/**
 * @jest-environment node
 */
import { promises as fs } from 'fs'
import tmp from 'tmp'
import { EventEmitter } from 'events'
import { describeFlashError, fixEsp8266SpiRegisters, flashNodeMcuFirmware, FirmwareProgressType, hardResetBoard, NODEMCU_FLASH, RESET_BUTTON_WAIT_MS, RESTART_GRACE_MS } from './FirmwareFlasher'
import NodeSerialTransport from './NodeSerialTransport'

tmp.setGracefulCleanup()

// an ESPLoader that remembers what it was asked to do. Like the real one, main() runs
// detectChip() to create this.chip and then reads the flash ID with it.
const fakeEsptool = (chip = "ESP8266EX", failWrite = false, detectedSize: string | null = "4MB", failErase = false, failReset = false) => {
  const calls: any = { options: null, mainCalled: false, after: null, writeOptions: null, chipAtFlashIdRead: null, order: [] as string[] }
  class ESPLoader {
    chip: any = null
    constructor(options: any) { calls.options = options }
    async detectChip() { this.chip = { CHIP_NAME: /ESP8266/.test(chip) ? "ESP8266" : "ESP32", SPI_MOSI_DLEN_OFFS: 0, SPI_MISO_DLEN_OFFS: 0 } }
    async main() {
      calls.mainCalled = true
      calls.order.push("main")
      await this.detectChip()
      calls.chipAtFlashIdRead = { ...this.chip }
      return chip
    }
    async detectFlashSize() { return detectedSize }
    async eraseFlash() {
      calls.order.push("erase")
      if (failErase) { throw new Error("Timed out waiting for packet header") }
    }
    async writeFlash(options: any) {
      calls.order.push("write")
      calls.writeOptions = options
      if (failWrite) { throw new Error("Timed out waiting for packet header") }
      options.reportProgress(0, 50, 100)
      options.reportProgress(0, 100, 100)
    }
    // like esptool-js: "hard_reset" runs the reset strategy it was given, on its transport
    async after(mode: string) {
      calls.order.push("after")
      calls.after = mode
      if (failReset) { throw new Error("The board was unplugged.") }
      await calls.options.resetConstructors?.hardReset?.(calls.options.transport, false).reset()
    }
  }
  return { calls, load: async () => ({ ESPLoader }) }
}
const fakeTransport = () => {
  const t = {
    disconnected: 0, disconnect: async () => { t.disconnected++ },
    signals: [] as string[],
    setDTR: async (on: boolean) => { t.signals.push(`DTR ${on}`) },
    setRTS: async (on: boolean) => { t.signals.push(`RTS ${on}`) },
  }
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
  expect(progress.map(p => p.phase)).toEqual(["connecting", "connecting", "erasing", "writing", "writing", "writing", "restarting", "done"])
  expect(progress[progress.length - 1].percent).toBe(100)
})

test("the whole chip is erased before the image is written, so nothing of an earlier firmware is left", async () => {
  const esptool = fakeEsptool()
  const progress: FirmwareProgressType[] = []
  await flashNodeMcuFirmware({ path: "COM9", binPath: await withBin(), onProgress: p => progress.push(p), loadEsptool: esptool.load, makeTransport: fakeTransport })
  expect(esptool.calls.order).toEqual(["main", "erase", "write", "after"])
  expect(progress.find(p => p.phase === "erasing")?.message).toContain("Erasing everything")
})

test("a board that stops answering while being erased is reported, and nothing is written", async () => {
  const esptool = fakeEsptool("ESP8266EX", false, "4MB", true)
  const transport = fakeTransport()
  const progress: FirmwareProgressType[] = []
  const ok = await flashNodeMcuFirmware({ path: "COM9", binPath: await withBin(), onProgress: p => progress.push(p), loadEsptool: esptool.load, makeTransport: () => transport })
  expect(ok).toBe(false)
  expect(esptool.calls.order).toEqual(["main", "erase"])
  expect(progress[progress.length - 1].phase).toBe("error")
  expect(transport.disconnected).toBe(1)
})

describe("restarting the board after the install", () => {
  test("pulls EN low through RTS, with DTR released, the way esptool.py does", async () => {
    const transport = fakeTransport()
    const waits: number[] = []
    await hardResetBoard(transport, async ms => { waits.push(ms); transport.signals.push(`wait ${ms}`) }).reset()
    expect(transport.signals).toEqual(["DTR false", "RTS true", "wait 100", "RTS false"])
  })
  test("the installer hands that reset to esptool-js, which on its own only releases RTS", async () => {
    const esptool = fakeEsptool()
    const transport = fakeTransport()
    await flashNodeMcuFirmware({ path: "COM9", binPath: await withBin(), onProgress: () => {}, loadEsptool: esptool.load, makeTransport: () => transport, sleep: async () => {} })
    expect(esptool.calls.after).toBe("hard_reset")
    expect(transport.signals).toEqual(["DTR false", "RTS true", "RTS false"])
  })
  test("esptool-js 0.7.0's own hard reset never asserts RTS (why the hub brings its own)", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const source = require('fs').readFileSync(require.resolve('esptool-js/lib/reset.js'), 'utf8')
    const hardReset = source.slice(source.indexOf("class HardReset"), source.indexOf("class", source.indexOf("class HardReset") + 5))
    expect(hardReset).toContain("setRTS(false)")
    expect(hardReset).not.toContain("setRTS(true)")
  })
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
  test("an unplugged board is named as such, with what to do", () => {
    expect(describeFlashError(new Error("The board was unplugged."))).toContain("unplugged during the install")
    expect(describeFlashError(new Error("Cannot call write after a stream was destroyed"))).toContain("Plug it back in")
  })
  test("esptool-js's 'serial noise' means the board stopped answering", () => {
    expect(describeFlashError(new Error("Serial data stream stopped: Possible serial noise or corruption."))).toBe("The board stopped answering during the install. Usually it was not in flashing mode.")
  })
  test("other messages pass through", () => {
    expect(describeFlashError(new Error("This is not a NodeMCU/ESP8266 board but \"ESP32\"."))).toContain("ESP32")
  })
})

describe("after the install the board has to restart", () => {
  // a clock that moves only when the flasher sleeps; stretch: how long each 100 ms sleep really takes
  const fakeClock = (stretch = 1) => {
    let t = 0
    return { now: () => t, sleep: async (ms: number) => { t += ms * stretch } }
  }
  // a transport whose board sends bytes once it has restarted, or whose port closes
  const listeningTransport = ({ restartsAfterChecks = null, closesAfterChecks = null }: { restartsAfterChecks?: number | null, closesAfterChecks?: number | null } = {}) => {
    let checks = 0
    return {
      disconnected: 0,
      disconnect: async function () { this.disconnected++ },
      flushInput: () => { checks = 0 },
      inWaiting: () => { checks++; return restartsAfterChecks !== null && checks > restartsAfterChecks ? 500 : 0 },
      isOpen: () => closesAfterChecks === null || checks <= closesAfterChecks,
      peek: () => new Uint8Array(Buffer.from("\x80\x81Formatting file system. Please wait...\r\n")),
      setDTR: async () => {},
      setRTS: async () => {},
    }
  }
  const run = async (transport: any, options: any = {}) => {
    const clock = fakeClock(options.stretch)
    const progress: FirmwareProgressType[] = []
    const esptool = options.esptool || fakeEsptool()
    const ok = await flashNodeMcuFirmware({ path: "COM7", binPath: await withBin(), onProgress: p => progress.push(p), loadEsptool: esptool.load, makeTransport: () => transport, now: clock.now, sleep: clock.sleep, stopWaiting: options.stopWaiting })
    return { ok, progress, last: progress[progress.length - 1], waited: clock.now() }
  }

  test("a board that restarts by itself is not asked about", async () => {
    const { ok, progress, last } = await run(listeningTransport({ restartsAfterChecks: 2 }))
    expect(ok).toBe(true)
    expect(progress.some(p => p.pressReset)).toBe(false)
    expect(last).toMatchObject({ phase: "done", written: true, restart: "restarted" })
  })
  test("a silent board gets the RST card: press RST once, not FLASH, or unplug it and plug it back in", async () => {
    const { ok, progress, last } = await run(listeningTransport({ restartsAfterChecks: 100 }))
    expect(ok).toBe(true)
    const ask = progress.find(p => p.pressReset)
    expect(ask?.message).toContain("Press its RST button once (do not hold FLASH)")
    expect(ask?.message).toContain("unplug it and plug it back in")
    expect(last).toMatchObject({ phase: "done", restart: "restarted" })
  })
  test("a board that never restarts: the firmware is still installed, and the hub says it did not see the restart", async () => {
    const { ok, last, waited } = await run(listeningTransport())
    expect(ok).toBe(true)
    expect(last).toMatchObject({ phase: "done", percent: 100, written: true, restart: "timeout" })
    expect(waited).toBe(100 + RESTART_GRACE_MS + RESET_BUTTON_WAIT_MS) // after the reset pulse's 100 ms
  })
  test("the waits are measured by the clock, not by loop turns (Windows stretches every sleep)", async () => {
    const { waited } = await run(listeningTransport(), { stretch: 1.094 })
    const pulse = 109.4 // the reset pulse's own 100 ms sleep
    expect(waited - pulse).toBeGreaterThanOrEqual(RESTART_GRACE_MS + RESET_BUTTON_WAIT_MS)
    expect(waited - pulse).toBeLessThan(RESTART_GRACE_MS + RESET_BUTTON_WAIT_MS + 2 * 110) // one stretched turn per wait at most
  })
  test("the hub holds the USB port for at most about half a minute waiting on a person", () => {
    expect(RESTART_GRACE_MS + RESET_BUTTON_WAIT_MS).toBeLessThanOrEqual(35000)
  })
  test("unplugging the board ends the wait at once, and counts as a restart", async () => {
    const { ok, last, waited } = await run(listeningTransport({ closesAfterChecks: 40 }))
    expect(ok).toBe(true)
    expect(last).toMatchObject({ phase: "done", written: true, restart: "portClosed" })
    expect(waited).toBeLessThan(5000)
  })
  test("the operator's Done ends the wait", async () => {
    let asked = 0
    const { last, waited } = await run(listeningTransport(), { stopWaiting: () => ++asked > 40 })
    expect(last).toMatchObject({ phase: "done", written: true, restart: "operator" })
    expect(waited).toBeLessThan(5000)
  })
  test("a restart that fails because the board was unplugged is a restart too, not a failed install", async () => {
    const transport = { ...listeningTransport(), isOpen: () => false }
    const { ok, last } = await run(transport, { esptool: fakeEsptool("ESP8266EX", false, "4MB", false, true) })
    expect(ok).toBe(true)
    expect(last).toMatchObject({ phase: "done", written: true, restart: "portClosed" })
  })
  test("only progress after the read-back says the firmware is written", async () => {
    const { progress } = await run(listeningTransport({ restartsAfterChecks: 2 }))
    const firstWritten = progress.findIndex(p => p.written)
    expect(progress[firstWritten].phase).toBe("restarting")
    expect(progress.slice(0, firstWritten).every(p => !p.written)).toBe(true)
  })
  test("a failure before the read-back is still an error, and does not say written", async () => {
    const { ok, progress, last } = await run(listeningTransport(), { esptool: fakeEsptool("ESP8266EX", true) })
    expect(ok).toBe(false)
    expect(last.phase).toBe("error")
    expect(progress.some(p => p.written)).toBe(false)
  })
  test("the hub log gets one line per step, how the restart was seen, and what the board printed first", async () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => {})
    try {
      await run(listeningTransport({ restartsAfterChecks: 100 }))
      const lines = info.mock.calls.map(c => String(c[0])).filter(l => l.startsWith("[firmware COM7]"))
      expect(lines.filter(l => l.includes(" writing after "))).toHaveLength(1) // three writing reports, one line
      expect(lines.filter(l => l.includes("restarting (asking for RST) after"))).toHaveLength(1)
      expect(lines.join("\n")).toMatch(/restart: the board printed \d+\.\d s after the reset/)
      expect(lines.find(l => l.includes("printed after the restart"))).toContain("Formatting file system")
      expect(lines[lines.length - 1]).toContain("done after")
    } finally {
      info.mockRestore()
    }
  })

  // the real transport over a port that behaves like node-serialport 8's when a board is unplugged: a read
  // fails, the port closes itself and says why
  class UnpluggablePort extends EventEmitter {
    isOpen = false
    signals: any[] = []
    open(cb: any) { this.isOpen = true; cb(null) }
    close(cb: any) { this.isOpen = false; this.emit('close', null); cb(null) }
    write(_data: any, cb: any) { cb(null) }
    drain(cb: any) { cb(null) }
    set(options: any, cb: any) { this.signals.push({ ...options }); cb(null) }
    update(_options: any, cb: any) { cb(null) }
    unplug() { this.isOpen = false; this.emit('close', Object.assign(new Error("Operation aborted"), { disconnected: true })) }
  }
  test("with the real transport, a port that closes during the wait ends it at once, and the log says why", async () => {
    const port = new UnpluggablePort()
    const transport = new NodeSerialTransport("COM8", () => port as any)
    await transport.connect(115200)
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    try {
      let sleeps = 0
      const progress: FirmwareProgressType[] = []
      let t = 0
      const ok = await flashNodeMcuFirmware({
        path: "COM8", binPath: await withBin(), onProgress: p => progress.push(p), loadEsptool: fakeEsptool().load, makeTransport: () => transport,
        now: () => t, sleep: async ms => { t += ms; if (++sleeps === 50) port.unplug() },
      })
      expect(ok).toBe(true)
      expect(progress[progress.length - 1]).toMatchObject({ phase: "done", written: true, restart: "portClosed" })
      expect(sleeps).toBeLessThan(55)
      expect(port.signals).toContainEqual({ dtr: false, rts: true }) // the hard reset reached the port
      expect(warn.mock.calls.map(c => String(c[0])).join("\n")).toContain("[serial COM8] port closed: Operation aborted (the board is gone")
    } finally {
      warn.mockRestore()
    }
  })
})

describe("the install is read back", () => {
  test("the write is given an MD5 of exactly the bytes written", async () => {
    const esptool = fakeEsptool()
    await flashNodeMcuFirmware({ path: "COM9", binPath: await withBin(), onProgress: () => {}, loadEsptool: esptool.load, makeTransport: fakeTransport })
    const md5 = esptool.calls.writeOptions.calculateMD5Hash(new Uint8Array([1, 2, 3]))
    expect(md5).toBe("5289df737df57326fcdd22597afb1fac")
  })
  test("a mismatch says the write went wrong", () => {
    expect(describeFlashError(new Error("MD5 of file does not match data in flash!"))).toContain("does not match the firmware file")
  })
})
