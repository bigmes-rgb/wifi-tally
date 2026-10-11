import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import NodeSerialTransport, { UNPLUGGED } from './NodeSerialTransport'
import { printable } from './BoardListener'
import { outputBlock, secs } from './HubLog'

export type FirmwarePhase = "connecting" | "erasing" | "writing" | "restarting" | "done" | "error"
// How the board's restart after the install was noticed. None of them is a failure: by then the firmware has
// been read back from the board and matched.
export type RestartOutcome =
  | "restarted" // it printed something: it restarted by itself, or someone pressed RST
  | "portClosed" // its port closed: unplugged and plugged back in, or dropped by Windows. Either way it lost power or moved, and started again
  | "operator" // the operator pressed Done
  | "timeout" // not seen in time; the first board check listens for the first start
export type FirmwareProgressType = {
  phase: FirmwarePhase
  percent: number // 0..100 over the whole job
  message?: string
  // the board did not restart by itself after the install: someone has to press RST or plug it in again
  pressReset?: boolean
  // the firmware is on the board and was read back correctly. From here on the install cannot fail.
  written?: boolean
  // with phase "done": how the restart after the install was noticed
  restart?: RestartOutcome
}

// esptool-js 0.7.0's HardReset only releases RTS (sleep, setRTS(false)) and never asserts it. After the
// connect sequence RTS is already released, so its "Hard resetting via RTS pin" reset nothing and every
// board was left sitting in the flasher, waiting for someone to press RST. esptool.py pulls EN low first:
// RTS asserted, 100 ms, released. DTR has to be released meanwhile: with both asserted the board's
// two-transistor reset circuit keeps EN high.
export const hardResetBoard = (transport: any, sleep: (ms: number) => Promise<void>) => ({
  reset: async () => {
    await transport.setDTR(false)
    await transport.setRTS(true)
    await sleep(100)
    await transport.setRTS(false)
  },
})

// After the install the board is restarted through the RTS line. Boards whose auto-reset does not
// work (the ones that need FLASH and RST to install) stay in the flasher, silent. A board that did
// restart always sends something: the ROM's boot line, then NodeMCU. So: wait for any byte.
export const RESTART_GRACE_MS = 3000
// Then someone has to press RST or plug the board in again. The hub holds the USB port while it waits, so it
// waits only this long: every other page's board check waits behind it. The first board check after the install
// keeps listening for the first start (150 s) and follows the board to another port, so a slower person is fine.
export const RESET_BUTTON_WAIT_MS = 30000

// Waits for a sign that the board restarted, by the clock: on Windows each 100 ms sleep runs long, and 1230 of
// them took 134 s instead of 123 s. A port that closes means the board was unplugged or dropped by Windows,
// which starts it again too; the wait used to sit out its time on a port that was gone.
const waitForRestart = async (transport: any, ms: number, sleep: (ms: number) => Promise<void>, stopWaiting: () => boolean, now: () => number): Promise<RestartOutcome> => {
  const deadline = now() + ms
  while (true) {
    if (transport.inWaiting() > 0) return "restarted"
    if (typeof transport.isOpen === "function" && !transport.isOpen()) return "portClosed"
    if (stopWaiting()) return "operator"
    if (now() >= deadline) return "timeout"
    await sleep(100)
  }
}

// the restart's line in the hub log
const restartLine: Record<RestartOutcome, (after: string) => string> = {
  restarted: after => `the board printed ${after} after the reset`,
  portClosed: after => `its port closed ${after} after the reset (unplugged, or dropped by Windows); that counts as a restart`,
  operator: after => `the operator pressed Done ${after} after the reset`,
  timeout: after => `not seen in the ${after} after the reset; the first board check listens for the first start`,
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
  sleep?: (ms: number) => Promise<void> // injectable for tests
  now?: () => number // the clock the waits are measured by; injectable for tests
  // true once the operator says the board restarted (pressed RST, or plugged it in again)
  stopWaiting?: () => boolean
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

// esptool-js's wording blames "serial noise" when the board simply stopped answering
export const describeFlashError = (e: any): string => {
  const message = `${e?.message || e}`
  if (message.includes(UNPLUGGED) || /Cannot call write after a stream was destroyed|Port is not open/i.test(message)) {
    return "The board was unplugged during the install. Plug it back in, press Check again, then install the firmware again."
  }
  if (/Serial data stream stopped|No serial data received|Timed out waiting for packet/i.test(message)) {
    return "The board stopped answering during the install. Usually it was not in flashing mode."
  }
  if (/MD5 of file does not match/i.test(message)) {
    return "What arrived on the board does not match the firmware file: the write went wrong. Install it again; if it keeps failing, try another USB socket or cable."
  }
  if (/Failed to connect/i.test(message)) {
    return "Could not get the board into flashing mode."
  }
  return message
}

export type FlashFirmwareFn = (options: FlashFirmwareOptions) => Promise<boolean>

// Puts the NodeMCU firmware on a bare ESP8266 board. Resolves true on success; every
// outcome is also reported through onProgress.
export const flashNodeMcuFirmware: FlashFirmwareFn = async ({ path, binPath, onProgress, loadEsptool = importEsptool, makeTransport = p => new NodeSerialTransport(p), sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms)), now = Date.now, stopWaiting = () => false }) => {
  const started = now()
  let written = false
  let step = ""
  const report = (phase: FirmwarePhase, percent: number, message?: string, extra: Partial<FirmwareProgressType> = {}) => {
    // the log gets a line when the step changes, not one per percent
    const next = `${phase}${extra.pressReset ? " (asking for RST)" : ""}`
    if (next !== step) {
      step = next
      console.info(`[firmware ${path}] ${next} after ${secs(now() - started)}${message ? `: ${message}` : ""}`)
    }
    onProgress({ phase, percent, message, ...(written ? { written } : {}), ...extra })
  }
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
    const loader = new esptool.ESPLoader({
      transport, baudrate: 115200, romBaudrate: 115200, terminal,
      resetConstructors: { hardReset: (t: any) => hardResetBoard(t, sleep) },
    })

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

    // Wipe the whole chip first. Writing only the image left the rest of the flash as it was, and on
    // this firmware that is the file system: the light program and its settings. A program that made
    // the board restart survived every install, so installing again changed nothing (the operator went
    // round that loop). The system and RF settings sit inside the image on this firmware, so every
    // write renewed those anyway. NodeMCU's own instructions erase first. Build a light puts the
    // light's program and settings back.
    report("erasing", 4, "Erasing everything on the board first. This takes up to a minute.")
    await loader.eraseFlash()

    report("writing", 5, `Writing ${Math.round(image.length / 1024)} kB to the board`)
    await loader.writeFlash({
      fileArray: [{ data: image, address: NODEMCU_FLASH.address }],
      flashMode: NODEMCU_FLASH.flashMode,
      flashFreq: NODEMCU_FLASH.flashFreq,
      flashSize,
      eraseAll: false, // erased above, with its own progress message
      compress: true,
      // read back what landed on the chip and compare: a bad write is reported as one
      calculateMD5Hash: (written: Uint8Array) => createHash("md5").update(Buffer.from(written)).digest("hex"),
      reportProgress: (_fileIndex: number, written: number, total: number) => {
        report("writing", 5 + Math.round((written / Math.max(total, 1)) * 90))
      },
    })

    // writeFlash returns only after the MD5 read back from the chip matched the file: the firmware is on the
    // board. Whatever happens from here, the install did not fail.
    written = true
    report("restarting", 96, "Restarting the board")
    const canListen = typeof transport.inWaiting === "function" && typeof transport.flushInput === "function"
    if (canListen) transport.flushInput()
    const resetAt = now()
    let restart: RestartOutcome = "timeout"
    try {
      await loader.after("hard_reset")
      if (canListen) restart = await waitForRestart(transport, RESTART_GRACE_MS, sleep, stopWaiting, now)
      if (restart === "timeout" && canListen) {
        report("restarting", 97, "The board did not restart by itself. Press its RST button once (do not hold FLASH), or unplug it and plug it back in.", { pressReset: true })
        restart = await waitForRestart(transport, RESET_BUTTON_WAIT_MS, sleep, stopWaiting, now)
      }
    } catch (e) {
      // The restart itself failed. Usually the port went away: unplugged, which starts the board again as well.
      console.warn(`[firmware ${path}] restarting the board failed: ${e?.message || e}`)
      restart = transport.isOpen?.() === false ? "portClosed" : "timeout"
    }
    console.info(`[firmware ${path}] restart: ${restartLine[restart](secs(now() - resetAt))}`)
    if (restart === "restarted" && typeof transport.peek === "function") {
      // What it prints first says how it started: NodeMCU's "Formatting file system", or only the chip's own
      // start-up message, which reads as garbage at this speed.
      const until = now() + 2000
      while (transport.inWaiting() < 300 && now() < until && transport.isOpen?.() !== false) await sleep(100)
      console.info(`[firmware ${path}] printed after the restart:\n${outputBlock(printable(Buffer.from(transport.peek())).slice(0, 300), 300)}`)
    }
    await transport.disconnect().catch(() => {})
    report("done", 100, "Firmware installed and checked", { restart })
    return true
  } catch (e) {
    console.error(`Flashing the firmware on ${path} failed:`, e)
    await transport.disconnect().catch(() => {})
    report("error", 0, describeFlashError(e))
    return false
  }
}
