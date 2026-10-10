/**
 * @jest-environment node
 */
import { promises as fs } from 'fs'
import tmp from 'tmp'
import { describeFlashError, fixEsp8266SpiRegisters, flashNodeMcuFirmware, FirmwareProgressType, NODEMCU_FLASH } from './FirmwareFlasher'
import NodeSerialTransport from './NodeSerialTransport'

tmp.setGracefulCleanup()

// an ESPLoader that remembers what it was asked to do. Like the real one, main() runs
// detectChip() to create this.chip and then reads the flash ID with it.
const fakeEsptool = (chip = "ESP8266EX", failWrite = false, detectedSize: string | null = "4MB") => {
  const calls: any = { options: null, mainCalled: false, after: null, writeOptions: null, chipAtFlashIdRead: null }
  class ESPLoader {
    chip: any = null
    constructor(options: any) { calls.options = options }
    async detectChip() { this.chip = { CHIP_NAME: /ESP8266/.test(chip) ? "ESP8266" : "ESP32", SPI_MOSI_DLEN_OFFS: 0, SPI_MISO_DLEN_OFFS: 0 } }
    async main() {
      calls.mainCalled = true
      await this.detectChip()
      calls.chipAtFlashIdRead = { ...this.chip }
      return chip
    }
    async detectFlashSize() { return detectedSize }
    async writeFlash(options: any) {
      calls.writeOptions = options
      if (failWrite) { throw new Error("Timed out waiting for packet header") }
      options.reportProgress(0, 50, 100)
      options.reportProgress(0, 100, 100)
    }
    async after(mode: string) { calls.after = mode }
  }
  return { calls, load: async () => ({ ESPLoader }) }
}
const fakeTransport = () => {
  const t = { disconnected: 0, disconnect: async () => { t.disconnected++ } }
  return t
}

const withBin = async () => {
  const { path } = await new Promise<{ path: string }>((resolve, reject) => tmp.file((err, p) => (err ? reject(err) : resolve({ path: p }))))
  await fs.writeFile(path, Buffer.alloc(2048, 0xe9))
  return path
}

test("it writes the image at address 0 with the NodeMCU flash settings and restarts the board", async () => {
  const esptool = fakeEsptool()
  const transport = fakeTransport()
  const progress: FirmwareProgressType[] = []
  const ok = await flashNodeMcuFirmware({ path: "COM9", binPath: await withBin(), onProgress: p => progress.push(p), loadEsptool: esptool.load, makeTransport: () => transport })
  expect(ok).toBe(true)
  expect(esptool.calls.options.transport).toBe(transport)
  expect(esptool.calls.options.romBaudrate).toBe(115200)
  expect(esptool.calls.mainCalled).toBe(true)
  expect(esptool.calls.writeOptions.fileArray[0].address).toBe(0)
  expect(esptool.calls.writeOptions.fileArray[0].data.length).toBe(2048)
  expect(esptool.calls.writeOptions.flashMode).toBe(NODEMCU_FLASH.flashMode)
  expect(esptool.calls.writeOptions.flashSize).toBe("4MB")
  expect(esptool.calls.after).toBe("hard_reset")
  expect(transport.disconnected).toBe(1)
  expect(progress.map(p => p.phase)).toEqual(["connecting", "connecting", "writing", "writing", "writing", "restarting", "done"])
  expect(progress[progress.length - 1].percent).toBe(100)
})

test("a board that is not an ESP8266 is refused before anything is written", async () => {
  const esptool = fakeEsptool("ESP32-D0WDQ6")
  const progress: FirmwareProgressType[] = []
  const ok = await flashNodeMcuFirmware({ path: "COM9", binPath: await withBin(), onProgress: p => progress.push(p), loadEsptool: esptool.load, makeTransport: fakeTransport })
  expect(ok).toBe(false)
  expect(esptool.calls.writeOptions).toBeNull()
  expect(progress[progress.length - 1]).toEqual({ phase: "error", percent: 0, message: 'This is not a NodeMCU/ESP8266 board but "ESP32-D0WDQ6".' })
})

test("a failure while writing is reported and the port is released", async () => {
  const esptool = fakeEsptool("ESP8266EX", true)
  const transport = fakeTransport()
  const progress: FirmwareProgressType[] = []
  const ok = await flashNodeMcuFirmware({ path: "COM9", binPath: await withBin(), onProgress: p => progress.push(p), loadEsptool: esptool.load, makeTransport: () => transport })
  expect(ok).toBe(false)
  expect(progress[progress.length - 1].phase).toBe("error")
  expect(progress[progress.length - 1].message).toBe("The board stopped answering during the install. Usually it was not in flashing mode.")
  expect(transport.disconnected).toBe(1)
})

test("a missing firmware file is an error, not a crash", async () => {
  const progress: FirmwareProgressType[] = []
  const ok = await flashNodeMcuFirmware({ path: "COM9", binPath: "/does/not/exist.bin", onProgress: p => progress.push(p), loadEsptool: fakeEsptool().load, makeTransport: fakeTransport })
  expect(ok).toBe(false)
  expect(progress[progress.length - 1].phase).toBe("error")
})

describe("the esptool-js bundle the build ships", () => {
  test("it bundles to CommonJS, loads in Node without a browser, and has the loader the flasher uses", () => {
    const esbuild = require('esbuild')
    const os = require('os')
    const nodePath = require('path')
    const outfile = nodePath.join(os.tmpdir(), `esptool-js-${process.pid}.bundle.js`)
    esbuild.buildSync({
      entryPoints: [require.resolve('esptool-js')], bundle: true, platform: 'node', format: 'cjs', target: 'node14', outfile, logLevel: 'silent',
    })
    const esptool = require(outfile)
    expect(typeof esptool.ESPLoader).toBe("function")
    const transport = new NodeSerialTransport("/dev/fake")
    const loader = new esptool.ESPLoader({ transport, baudrate: 115200, romBaudrate: 115200, terminal: { clean() {}, writeLine() {}, write() {} } })
    expect(typeof loader.main).toBe("function")
    expect(typeof loader.writeFlash).toBe("function")
  })
})

test("the ESP8266 register fix is in place before main() first reads the flash ID", async () => {
  const esptool = fakeEsptool()
  await flashNodeMcuFirmware({ path: "COM9", binPath: await withBin(), onProgress: () => {}, loadEsptool: esptool.load, makeTransport: fakeTransport })
  expect(esptool.calls.chipAtFlashIdRead.SPI_MOSI_DLEN_OFFS).toBeNull()
  expect(esptool.calls.chipAtFlashIdRead.SPI_MISO_DLEN_OFFS).toBeNull()
})

test("when the flash size cannot be read it keeps the image's own size instead of refusing", async () => {
  const esptool = fakeEsptool("ESP8266EX", false, null)
  const progress: FirmwareProgressType[] = []
  const ok = await flashNodeMcuFirmware({ path: "COM9", binPath: await withBin(), onProgress: p => progress.push(p), loadEsptool: esptool.load, makeTransport: fakeTransport })
  expect(ok).toBe(true)
  expect(esptool.calls.writeOptions.flashSize).toBe("keep")
  expect(progress[progress.length - 1].phase).toBe("done")
})

describe("fixEsp8266SpiRegisters() against the real esptool-js code", () => {
  // Bundles the real ESP8266ROM target and ESPLoader, then runs the real runSpiflashCommand
  // (what readFlashId uses) against a recording stand-in for the serial link.
  const load = () => {
    const esbuild = require('esbuild')
    const os = require('os')
    const nodePath = require('path')
    const lib = nodePath.dirname(require.resolve('esptool-js'))
    const outfile = nodePath.join(os.tmpdir(), `esptool-8266-${process.pid}.bundle.js`)
    esbuild.buildSync({
      stdin: { contents: `export { ESP8266ROM } from "./targets/esp8266.js"; export { ESPLoader } from "./esploader.js";`, resolveDir: lib, loader: 'js' },
      bundle: true, platform: 'node', format: 'cjs', target: 'node14', outfile, logLevel: 'silent',
    })
    return require(outfile)
  }
  const readFlashIdWrites = async (fix: boolean) => {
    const { ESP8266ROM, ESPLoader } = load()
    const chip = new ESP8266ROM()
    if (fix) { fixEsp8266SpiRegisters(chip) }
    const writes: [number, number][] = []
    const link = {
      chip,
      writeReg: async (addr: number, value: number) => { writes.push([addr, value]) },
      readReg: async () => 0,
    }
    await ESPLoader.prototype.readFlashId.call({ ...link, runSpiflashCommand: ESPLoader.prototype.runSpiflashCommand.bind(link) })
    return writes
  }
  const SPI_CMD = 0x60000200, SPI_USR1 = 0x60000220

  test("unfixed, esptool-js 0.7.0 writes the read length into SPI_CMD and never sets SPI_USR1 (the bug)", async () => {
    const writes = await readFlashIdWrites(false)
    expect(writes.some(([addr, value]) => addr === SPI_CMD && value === 23)).toBe(true)
    expect(writes.some(([addr]) => addr === SPI_USR1)).toBe(false)
  })
  test("fixed, the 24-bit read length goes into SPI_USR1 the way esptool.py does it", async () => {
    const writes = await readFlashIdWrites(true)
    expect(writes).toContainEqual([SPI_USR1, 23 << 8])
    expect(writes.some(([addr, value]) => addr === SPI_CMD && value === 23)).toBe(false)
  })
  test("other chips are left alone", () => {
    const chip = { CHIP_NAME: "ESP32", SPI_MOSI_DLEN_OFFS: 0x28, SPI_MISO_DLEN_OFFS: 0x2c }
    fixEsp8266SpiRegisters(chip)
    expect(chip.SPI_MOSI_DLEN_OFFS).toBe(0x28)
  })
})

describe("describeFlashError()", () => {
  test("esptool-js's 'serial noise' means the board stopped answering", () => {
    expect(describeFlashError(new Error("Serial data stream stopped: Possible serial noise or corruption."))).toBe("The board stopped answering during the install. Usually it was not in flashing mode.")
  })
  test("other messages pass through", () => {
    expect(describeFlashError(new Error("This is not a NodeMCU/ESP8266 board but \"ESP32\"."))).toContain("ESP32")
  })
})

describe("after the install the board has to restart", () => {
  // a transport whose board sends bytes once it has restarted
  const listeningTransport = (restartsAfterChecks: number | null) => {
    let checks = 0
    return {
      disconnected: 0,
      disconnect: async function () { this.disconnected++ },
      flushInput: () => { checks = 0 },
      inWaiting: () => { checks++; return restartsAfterChecks !== null && checks > restartsAfterChecks ? 42 : 0 },
    }
  }
  const run = async (transport: any) => {
    const progress: FirmwareProgressType[] = []
    const ok = await flashNodeMcuFirmware({ path: "COM7", binPath: await withBin(), onProgress: p => progress.push(p), loadEsptool: fakeEsptool().load, makeTransport: () => transport, sleep: async () => {} })
    return { ok, progress }
  }
  test("a board that restarts by itself is not asked about", async () => {
    const { ok, progress } = await run(listeningTransport(2))
    expect(ok).toBe(true)
    expect(progress.some(p => p.pressReset)).toBe(false)
  })
  test("a silent board gets 'press RST', and the install finishes once it restarts", async () => {
    const { ok, progress } = await run(listeningTransport(100))
    expect(ok).toBe(true)
    const ask = progress.find(p => p.pressReset)
    expect(ask?.message).toContain("RST")
    expect(progress[progress.length - 1].phase).toBe("done")
  })
  test("a board that never restarts ends in an error that says what to do", async () => {
    const { ok, progress } = await run(listeningTransport(null))
    expect(ok).toBe(false)
    expect(progress[progress.length - 1].message).toContain("RST")
  })
})
