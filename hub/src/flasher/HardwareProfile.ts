import TallySettingsIni from './TallySettingsIni'

// What is soldered to the board. Mirrors the operator.* / stage.* settings in tally-settings.ini.
export type LedKind = "rgb" | "ws2812" | "none"
export type Polarity = "anode" | "cathode" // common anode: + to 3V3, pin LOW = on. common cathode: - to GND, pin HIGH = on
export type PixelOrder = "grb" | "rgb"

export type LightProfile = {
  kind: LedKind
  polarity: Polarity // only for "rgb"
  pixels: number // only for "ws2812", 1..10
  order: PixelOrder // only for "ws2812"
}

export type HardwareProfile = {
  operator: LightProfile
  stage: LightProfile
}

export const MAX_PIXELS = 10

export const defaultHardwareProfile = (): HardwareProfile => ({
  operator: { kind: "rgb", polarity: "anode", pixels: 5, order: "grb" },
  stage: { kind: "none", polarity: "anode", pixels: 4, order: "grb" },
})

// which board pin drives which colour
export const PINS = {
  operator: { R: "D2", G: "D1", B: "D3" },
  stage: { R: "D6", G: "D5", B: "D7" },
  ws2812: "D4",
} as const

export type Role = "operator" | "stage"
export type Channel = "R" | "G" | "B"

const clampPixels = (n: number) => Math.max(0, Math.min(MAX_PIXELS, Math.round(n) || 0))

// the ini values the tally understands
export function profileToIniValues(profile: HardwareProfile) {
  const type = (p: LightProfile) => (p.kind === "rgb" && p.polarity === "cathode" ? "grb-" : "grb+")
  const ws = (p: LightProfile) => (p.kind === "ws2812" ? `${clampPixels(p.pixels)} ${p.order}` : "0 grb")
  return {
    operatorType: type(profile.operator),
    operatorWs2812: ws(profile.operator),
    stageType: type(profile.stage),
    stageWs2812: ws(profile.stage),
  }
}

export function writeProfileToIni(ini: TallySettingsIni, profile: HardwareProfile) {
  const v = profileToIniValues(profile)
  ini.setOperatorType(v.operatorType)
  ini.setOperatorWs2812(v.operatorWs2812)
  ini.setStageType(v.stageType)
  ini.setStageWs2812(v.stageWs2812)
}

// best guess of the profile from an existing ini (a light that is being re-done)
export function readProfileFromIni(ini: TallySettingsIni | undefined): HardwareProfile {
  const profile = defaultHardwareProfile()
  if (!ini) return profile
  const parseWs = (value: string | null): { pixels: number, order: PixelOrder } | null => {
    if (!value) return null
    const m = value.trim().match(/^(\d+)(?:\s+(grb|rgb))?$/i)
    if (!m) return null
    return { pixels: clampPixels(parseInt(m[1], 10)), order: (m[2]?.toLowerCase() as PixelOrder) || "grb" }
  }
  const apply = (light: LightProfile, type: string | null, ws: string | null, hasRgbByDefault: boolean) => {
    const parsed = parseWs(ws)
    if (parsed && parsed.pixels > 0) {
      light.kind = "ws2812"
      light.pixels = parsed.pixels
      light.order = parsed.order
    } else if (hasRgbByDefault || type) {
      light.kind = "rgb"
    } else {
      light.kind = "none"
    }
    light.polarity = type?.trim().toLowerCase() === "grb-" ? "cathode" : "anode"
  }
  apply(profile.operator, ini.getOperatorType(), ini.getOperatorWs2812(), true)
  apply(profile.stage, ini.getStageType(), ini.getStageWs2812(), false)
  return profile
}

// Lua that makes a running tally use this profile until it reboots. The NodeMCU
// reads at most 256 characters per line, so this is several short commands.
export function profileToLuaCommands(profile: HardwareProfile): string[] {
  const v = profileToIniValues(profile)
  const [opN, opOrder] = v.operatorWs2812.split(" ")
  const [stN, stOrder] = v.stageWs2812.split(" ")
  return [
    `_G.testMode=true MySettings.operatorType=function()return"${v.operatorType}"end MySettings.stageType=function()return"${v.stageType}"end`,
    `MySettings.operatorNumberOfWs2812Lights=function()return ${opN} end MySettings.stageNumberOfWs2812Lights=function()return ${stN} end`,
    `MySettings.operatorWs2812Type=function()return"${opOrder}"end MySettings.stageWs2812Type=function()return"${stOrder}"end`,
  ]
}

export type Rgb = [number, number, number]
export const Off: Rgb = [0, 0, 0]
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n) || 0))

export function showColorLua(operator: Rgb, stage: Rgb): string {
  const o = operator.map(clamp), s = stage.map(clamp)
  return `MyLed.static(${o[0]},${o[1]},${o[2]},${s[0]},${s[1]},${s[2]})`
}

// hands the LEDs back to the tally program
export const endTestLua = `_G.testMode=nil MyLed.initial()`

// Every wiring-test command goes through the tally program's MySettings and MyLed. On a board where
// that program is not running they do not exist, and the board answers with a Lua error naming
// them: the hub knows by itself, before anything is shown, that no light can follow it.
export const tallyNotRunning = (boardReply: string) => /attempt to (index|call) (global|field) '(MySettings|MyLed)'/.test(boardReply)
