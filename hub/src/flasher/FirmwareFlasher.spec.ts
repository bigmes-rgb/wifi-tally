import { promises as fs } from 'fs'
import tmp from 'tmp'
import { flashNodeMcuFirmware, FirmwareProgressType, NODEMCU_FLASH } from './FirmwareFlasher'

tmp.setGracefulCleanup()

// an ESPLoader that remembers what it was asked to do
const fakeEsptool = (chip = "ESP8266EX", failWrite = false) => {
  const calls: any = { options: null, mainCalled: false, after: null, writeOptions: null }
  class ESPLoader {
    constructor(options: any) { calls.options = options }
    async main() { calls.mainCalled = true; return chip }
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
  expect(esptool.calls.writeOptions.flashSize).toBe("detect")
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
  expect(progress[progress.length - 1].message).toContain("Timed out")
  expect(transport.disconnected).toBe(1)
})

test("a missing firmware file is an error, not a crash", async () => {
  const progress: FirmwareProgressType[] = []
  const ok = await flashNodeMcuFirmware({ path: "COM9", binPath: "/does/not/exist.bin", onProgress: p => progress.push(p), loadEsptool: fakeEsptool().load, makeTransport: fakeTransport })
  expect(ok).toBe(false)
  expect(progress[progress.length - 1].phase).toBe("error")
})
