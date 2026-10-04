import NodeMcuConnector from './NodeMcuConnector'

const fakeNodemcu = () => ({
  onError: () => {},
  isConnected: () => false,
  disconnect: async () => {},
  listDevices: async () => [],
})

describe("getLocalFiles()", () => {
  test("it returns an empty list instead of failing when no bundle exists", async () => {
    const files = await NodeMcuConnector.getLocalFiles(["/does/not/exist", "/neither/does/this"])
    expect(files).toEqual([])
  })
  test("it skips missing directories and uses the first one that exists", async () => {
    const files = await NodeMcuConnector.getLocalFiles(["/does/not/exist", __dirname + "/../../../tally/src"])
    expect(files.length).toBeGreaterThan(0)
    expect(files.every(f => f.fileName.endsWith(".lua"))).toBe(true)
  })
})

describe("getDevice()", () => {
  test("it reports 'not-available' rather than crashing the hub when the bundle is missing", async () => {
    const dirs = NodeMcuConnector.localFileDirs
    NodeMcuConnector.localFileDirs = ["/does/not/exist"]
    try {
      const connector = new NodeMcuConnector(fakeNodemcu())
      const device = await connector.getDevice()
      expect(device.update).toEqual("not-available")
      expect(device.path).toBeUndefined()
    } finally {
      NodeMcuConnector.localFileDirs = dirs
    }
  })
})

describe("writeTallySettingsIni()", () => {
  // a NodeMCU that remembers what was uploaded and answers like the real one
  const rememberingNodemcu = () => {
    const files: Record<string, string> = {}
    let connected = false
    return {
      files,
      onError: () => {},
      isConnected: () => connected,
      connect: async () => { connected = true },
      disconnect: async () => { connected = false },
      checkConnection: async () => {},
      listDevices: async () => [{ path: "/dev/fake" }],
      upload: async (local: string, remote: string) => { files[remote] = require('fs').readFileSync(local).toString() },
      download: async (remote: string) => files[remote],
      execute: async (cmd: string) => {
        const rename = cmd.match(/file\.rename\("([^"]+)", "([^"]+)"\)/)
        if (rename) { files[rename[2]] = files[rename[1]]; delete files[rename[1]] }
        const remove = cmd.match(/file\.remove\("([^"]+)"\)/)
        if (remove) { delete files[remove[1]] }
        return { response: "ok" }
      },
      hardreset: async () => {},
    }
  }

  test("a light without hub.ip is written: it finds the hub on its own", async () => {
    const nodemcu = rememberingNodemcu()
    const connector = new NodeMcuConnector(nodemcu)
    const states = []
    const ok = await connector.writeTallySettingsIni("/dev/fake", "station.ssid=Church\nstation.password=secret\ntally.name=Cam 1\n", s => states.push({ ...s }))
    expect(ok).toBe(true)
    expect(states[states.length - 1].allDone).toBe(true)
    expect(states[states.length - 1].error).toBe(false)
    expect(nodemcu.files["tally-settings.ini"]).toContain("tally.name=Cam 1")
    expect(nodemcu.files["tally-settings.ini.swp"]).toBeUndefined()
  }, 20000)

  test("a light without a name is refused", async () => {
    const connector = new NodeMcuConnector(rememberingNodemcu())
    const states = []
    const ok = await connector.writeTallySettingsIni("/dev/fake", "station.ssid=Church\n", s => states.push({ ...s }))
    expect(ok).toBe(false)
    expect(states[states.length - 1].error).toBe(true)
  })
})
