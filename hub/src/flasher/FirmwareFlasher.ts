import { promises as fs } from 'fs'
import NodeSerialTransport from './NodeSerialTransport'

export type FirmwarePhase = "connecting" | "writing" | "restarting" | "done" | "error"
export type FirmwareProgressType = {
  phase: FirmwarePhase
  percent: number // 0..100 over the whole job
  message?: string
}

// how the NodeMCU image is written: what nodemcu-pyflasher and the NodeMCU docs use for ESP-12 boards
export const NODEMCU_FLASH = { address: 0, flashMode: "dio", flashFreq: "40m", flashSize: "detect" } as const

export type FlashFirmwareOptions = {
  path: string // serial port
  binPath: string // the NodeMCU .bin
  onProgress: (progress: FirmwareProgressType) => void
  // injectable for tests: esptool-js is an ES module loaded at runtime
  loadEsptool?: () => Promise<any>
  makeTransport?: (path: string) => any
}

// esptool-js ships as an ES module. Node's ES-module loader cannot read from inside Electron's
// app.asar, so the packaged app failed with "Cannot find package 'esptool-js'". The build bundles
// it to a plain CommonJS file next to this one (see scripts/build.sh); the dynamic import stays
// as the fallback for running from source.
export const ESPTOOL_BUNDLE = "esptool-js.bundle.js"

const importEsptool = async () => {
  if (typeof (globalThis as any).atob !== "function") {
    // Node before 16 has no atob, esptool-js decodes its flasher stub with it
    (globalThis as any).atob = (s: string) => Buffer.from(s, "base64").toString("binary")
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(`./${ESPTOOL_BUNDLE}`)
  } catch (e) {
    if (e.code !== "MODULE_NOT_FOUND") { throw e }
  }
  // eslint-disable-next-line no-new-func
  return new Function('return import("esptool-js")')()
}

// esptool-js 0.7.0 marks the ESP8266's missing MOSI/MISO length registers with 0 instead of null.
// runSpiflashCommand tests "!= null", so for the ESP8266 it writes the read length into SPI_CMD
// (base + 0) instead of SPI_USR1. The flash chip's ID then reads back as garbage and writeFlash
// stops with "Could not auto-detect Flash size". esptool.py has None here. Put that back.
export const fixEsp8266SpiRegisters = (chip: any) => {
  if (chip && /ESP8266/i.test(chip.CHIP_NAME || "")) {
    if (chip.SPI_MOSI_DLEN_OFFS === 0) { chip.SPI_MOSI_DLEN_OFFS = null }
    if (chip.SPI_MISO_DLEN_OFFS === 0) { chip.SPI_MISO_DLEN_OFFS = null }
  }
}

export type FlashFirmwareFn = (options: FlashFirmwareOptions) => Promise<boolean>

// Puts the NodeMCU firmware on a bare ESP8266 board. Resolves true on success; every
// outcome is also reported through onProgress.
export const flashNodeMcuFirmware: FlashFirmwareFn = async ({ path, binPath, onProgress, loadEsptool = importEsptool, makeTransport = p => new NodeSerialTransport(p) }) => {
  const report = (phase: FirmwarePhase, percent: number, message?: string) => onProgress({ phase, percent, message })
  const transport = makeTransport(path)
  try {
    report("connecting", 0, "Reading the firmware file")
    const image = new Uint8Array(await fs.readFile(binPath))
    const esptool = await loadEsptool()
    const terminal = {
      clean: () => {},
      writeLine: (line: string) => console.info(`[esptool ${path}] ${line}`),
      write: (_: string) => {},
    }
    const loader = new esptool.ESPLoader({ transport, baudrate: 115200, romBaudrate: 115200, terminal })

    // apply the register fix the moment the chip is known, before main() first reads the flash ID
    const detectChip = loader.detectChip.bind(loader)
    loader.detectChip = async (...args: any[]) => {
      await detectChip(...args)
      fixEsp8266SpiRegisters(loader.chip)
    }

    report("connecting", 2, "Looking for the board. If nothing happens, hold FLASH and tap RST on the board.")
    const chip: string = await loader.main()
    if (!/ESP8266/i.test(chip)) {
      throw new Error(`This is not a NodeMCU/ESP8266 board but "${chip}".`)
    }

    // Ask the flash chip its size. If it cannot be read, keep the size written in the firmware
    // image (1 MB, which every ESP8266 board has) instead of refusing to install.
    let flashSize: string = NODEMCU_FLASH.flashSize
    if (flashSize === "detect") {
      flashSize = (await loader.detectFlashSize()) || "keep"
      console.info(`[esptool ${path}] flash size ${flashSize === "keep" ? "not readable, keeping the image's own setting" : flashSize}`)
    }

    report("writing", 5, `Writing ${Math.round(image.length / 1024)} kB to the board`)
    await loader.writeFlash({
      fileArray: [{ data: image, address: NODEMCU_FLASH.address }],
      flashMode: NODEMCU_FLASH.flashMode,
      flashFreq: NODEMCU_FLASH.flashFreq,
      flashSize,
      eraseAll: false,
      compress: true,
      reportProgress: (_fileIndex: number, written: number, total: number) => {
        report("writing", 5 + Math.round((written / Math.max(total, 1)) * 90))
      },
    })

    report("restarting", 96, "Restarting the board")
    await loader.after("hard_reset")
    await transport.disconnect()
    report("done", 100, "Firmware installed")
    return true
  } catch (e) {
    console.error(`Flashing the firmware on ${path} failed:`, e)
    await transport.disconnect().catch(() => {})
    report("error", 0, `${e?.message || e}`)
    return false
  }
}
