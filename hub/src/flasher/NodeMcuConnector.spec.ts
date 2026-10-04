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
