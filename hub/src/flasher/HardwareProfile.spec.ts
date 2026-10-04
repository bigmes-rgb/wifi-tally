import { defaultHardwareProfile, endTestLua, profileToIniValues, profileToLuaCommands, readProfileFromIni, showColorLua, writeProfileToIni } from './HardwareProfile'
import TallySettingsIni from './TallySettingsIni'

describe("profileToIniValues()", () => {
  test("the default is one common-anode RGB operator light and nothing on stage", () => {
    expect(profileToIniValues(defaultHardwareProfile())).toEqual({
      operatorType: "grb+", operatorWs2812: "0 grb", stageType: "grb+", stageWs2812: "0 grb",
    })
  })
  test("common cathode flips the type, ws2812 sets the pixel count and order", () => {
    const profile = defaultHardwareProfile()
    profile.operator.polarity = "cathode"
    profile.stage = { kind: "ws2812", polarity: "anode", pixels: 4, order: "rgb" }
    expect(profileToIniValues(profile)).toEqual({
      operatorType: "grb-", operatorWs2812: "0 grb", stageType: "grb+", stageWs2812: "4 rgb",
    })
  })
  test("pixel counts are kept within what the tally accepts", () => {
    const profile = defaultHardwareProfile()
    profile.operator = { kind: "ws2812", polarity: "anode", pixels: 99, order: "grb" }
    expect(profileToIniValues(profile).operatorWs2812).toEqual("10 grb")
  })
})

describe("ini round trip", () => {
  test("a profile written to the ini is read back", () => {
    const profile = defaultHardwareProfile()
    profile.operator = { kind: "ws2812", polarity: "anode", pixels: 3, order: "rgb" }
    profile.stage = { kind: "rgb", polarity: "cathode", pixels: 4, order: "grb" }
    const ini = new TallySettingsIni("station.ssid=x\ntally.name=y\n")
    writeProfileToIni(ini, profile)
    const back = readProfileFromIni(new TallySettingsIni(ini.toString()))
    expect(back.operator).toEqual({ kind: "ws2812", polarity: "anode", pixels: 3, order: "rgb" })
    expect(back.stage).toEqual({ kind: "rgb", polarity: "cathode", pixels: 4, order: "grb" })
  })
  test("an ini from before these settings existed reads as the default", () => {
    expect(readProfileFromIni(new TallySettingsIni("station.ssid=x\n"))).toEqual(defaultHardwareProfile())
    expect(readProfileFromIni(undefined)).toEqual(defaultHardwareProfile())
  })
})

describe("Lua for the wiring test", () => {
  test("every command fits the NodeMCU's 256 character input line", () => {
    const profile = defaultHardwareProfile()
    profile.operator = { kind: "ws2812", polarity: "cathode", pixels: 10, order: "rgb" }
    profile.stage = { kind: "ws2812", polarity: "cathode", pixels: 10, order: "rgb" }
    for (const cmd of profileToLuaCommands(profile)) {
      // NodeMcuConnector appends '; print("ok")' (12 chars) and a newline
      expect(cmd.length + 13).toBeLessThan(256)
    }
    expect(showColorLua([255, 0, 0], [0, 0, 0])).toEqual("MyLed.static(255,0,0,0,0,0)")
    expect(endTestLua.length + 13).toBeLessThan(256)
  })
  test("the profile commands switch on test mode and carry the settings", () => {
    const cmds = profileToLuaCommands(defaultHardwareProfile()).join("\n")
    expect(cmds).toContain("_G.testMode=true")
    expect(cmds).toContain('MySettings.operatorType=function()return"grb+"end')
    expect(cmds).toContain("MySettings.operatorNumberOfWs2812Lights=function()return 0 end")
  })
  test("colours are clamped to what the LEDs accept", () => {
    expect(showColorLua([300, -5, 12.6], [0, 0, 0])).toEqual("MyLed.static(255,0,13,0,0,0)")
  })
})
