import TallyDevice from '../../flasher/TallyDevice'
import TallySettingsIni from '../../flasher/TallySettingsIni'
import { rememberFromDevice, shouldReadProfile } from './rememberedLight'

const board = (chipId: string | undefined, settings?: string) => {
  const device = new TallyDevice()
  device.chipId = chipId
  if (settings) device.tallySettings = new TallySettingsIni(settings)
  return device
}
const cam1 = "tally.name=Cam 1\nstation.ssid=Church\nstation.password=secret\n"

describe("what the wizard remembers about the light being built", () => {
  test("the next, bare board does not inherit the last light's name, Wi-Fi and password", () => {
    const remembered = rememberFromDevice(undefined, board("aaaa", cam1))
    expect(remembered?.settings.getTallyName()).toEqual("Cam 1")
    expect(rememberFromDevice(remembered, board("bbbb"))).toBeUndefined()
  })
  test("the same board keeps its settings while its firmware is reinstalled (which wipes its files)", () => {
    const remembered = rememberFromDevice(undefined, board("aaaa", cam1))
    expect(rememberFromDevice(remembered, board("aaaa"))?.settings.getTallyName()).toEqual("Cam 1")
  })
  test("a board that has its own settings brings those", () => {
    const remembered = rememberFromDevice(undefined, board("aaaa", cam1))
    expect(rememberFromDevice(remembered, board("bbbb", "tally.name=Cam 2\n"))?.settings.getTallyName()).toEqual("Cam 2")
  })
})

describe("reading a light's stored hardware profile", () => {
  test("once per board, and never again for the board just finished", () => {
    expect(shouldReadProfile(board("aaaa", cam1), undefined)).toBe(true)
    expect(shouldReadProfile(board("aaaa", cam1), "aaaa")).toBe(false)
    expect(shouldReadProfile(board("bbbb", cam1), "aaaa")).toBe(true)
    expect(shouldReadProfile(board("bbbb"), undefined)).toBe(false)
  })
})
