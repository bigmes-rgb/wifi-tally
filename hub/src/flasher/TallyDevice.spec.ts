import TallyDevice, { boardCandidates, describePort } from './TallyDevice'
import TallySettingsIni from './TallySettingsIni'


test('toJson/fromJson', () => {
  const tallySettings = new TallySettingsIni("example=foo\n")
  const device = new TallyDevice()
  device.chipId = "abcd12"
  device.errorMessage = "error message"
  device.flashId = "1234ab"
  device.nodeMcuModules = "foo,bar,baz"
  device.nodeMcuVersion = "3.0.0"
  device.path = "/dev/ttyUSB0"
  device.productId = "123abc"
  device.tallySettings = tallySettings
  device.vendorId = "abc123"
  device.update = "up-to-date"

  const json = device.toJson()
  const object = TallyDevice.fromJson(json)

  expect(object.chipId).toEqual("abcd12")
  expect(object.errorMessage).toEqual("error message")
  expect(object.flashId).toEqual("1234ab")
  expect(object.nodeMcuModules).toEqual("foo,bar,baz")
  expect(object.nodeMcuVersion).toEqual("3.0.0")
  expect(object.path).toEqual("/dev/ttyUSB0")
  expect(object.productId).toEqual("123abc")
  expect(object.tallySettings.toString()).toEqual("example=foo\n")
  expect(object.vendorId).toEqual("abc123")
  expect(object.update).toEqual("up-to-date")
})

describe("boardCandidates()", () => {
  test("lists every port that could be a NodeMCU, known chips first, and nothing without a vendor id", () => {
    const ports = [
      { path: "COM1" },
      { path: "COM9", vendorId: "2341", manufacturer: "Arduino" },
      { path: "COM6", vendorId: "1a86", manufacturer: "wch.cn" },
      { path: "COM7", vendorId: "10C4", manufacturer: "Silicon Labs" },
    ]
    expect(boardCandidates(ports).map(p => p.path)).toEqual(["COM6", "COM7", "COM9"])
    expect(describePort(ports[2])).toEqual("COM6 (CH340)")
    expect(describePort(ports[1])).toEqual("COM9 (Arduino)")
  })
})
