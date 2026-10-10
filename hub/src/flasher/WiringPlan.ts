import { HardwareProfile, LightProfile, PINS, Role } from './HardwareProfile'

// The NodeMCU's two pin headers as printed on a LoLin (v3) board, top view, antenna at the top and
// USB at the bottom. Amica (v2) boards agree on every other pin; where LoLin prints G and VU they
// have two reserved pins (RSV). VU carries the 5 V from USB; VIN does not on LoLin boards.
export const BOARD_PINS = {
  left: ["A0", "G", "VU", "SD3", "SD2", "SD1", "CMD", "SD0", "CLK", "GND", "3V3", "EN", "RST", "GND", "VIN"],
  right: ["D0", "D1", "D2", "D3", "D4", "3V3", "GND", "D5", "D6", "D7", "D8", "RX", "TX", "GND", "3V3"],
} as const

export type BoardSide = "left" | "right"
export interface BoardPin { side: BoardSide, index: number, label: string }

const pin = (side: BoardSide, index: number): BoardPin => ({ side, index, label: BOARD_PINS[side][index] })
const rightPin = (label: string): BoardPin => pin("right", BOARD_PINS.right.indexOf(label as any))

// Fixed pins of each role's common leg, chosen next to that role's colour pins.
const COMMON_PIN: Record<Role, Record<"anode" | "cathode", BoardPin>> = {
  operator: { anode: pin("right", 5), cathode: pin("right", 6) },
  stage: { anode: pin("right", 14), cathode: pin("right", 13) },
}
// +5V from VU: on LoLin boards VIN is dead while the board runs from USB, and the strip, without
// power, then holds D4 low so the board does not even start. GND from the G right next to it.
const STRIP_POWER = { vu: pin("left", 2), gnd: pin("left", 1) }

export const WIRE_COLORS = {
  red: "#e53935",
  green: "#43a047",
  blue: "#1e88e5",
  data: "#00acc1",
  v5: "#ef6c00",
  v33: "#f9a825",
  gnd: "#616161",
}

export type PadName = "R" | "G" | "B" | "common" | "+5V" | "DIN" | "GND"

// One wire. It runs from a board pin, or (for a chained stage strip) from the end of the
// operator strip, to a pad of a light.
export interface Wire {
  role: Role // the light it ends on
  pad: PadName
  from: BoardPin | { chainedFrom: "operator", pad: "+5V" | "DOUT" | "GND" }
  color: string
  pinText: string // the board-pin column of the table
  toText: string // the "goes to" column
}

export interface WiringPlan {
  operator: LightProfile
  stage: LightProfile
  wires: Wire[]
  // which strip sits on D4: with an RGB operator and a strip stage light, the stage strip does
  firstStrip: Role | null
  stageChained: boolean
  totalPixels: number
}

const rgbWires = (role: Role, light: LightProfile): Wire[] => {
  const pins = PINS[role]
  const common = COMMON_PIN[role][light.polarity]
  const anode = light.polarity === "anode"
  return [
    { role, pad: "R", from: rightPin(pins.R), color: WIRE_COLORS.red, pinText: pins.R, toText: "red leg" },
    { role, pad: "G", from: rightPin(pins.G), color: WIRE_COLORS.green, pinText: pins.G, toText: "green leg" },
    { role, pad: "B", from: rightPin(pins.B), color: WIRE_COLORS.blue, pinText: pins.B, toText: "blue leg" },
    {
      role, pad: "common", from: common, color: anode ? WIRE_COLORS.v33 : WIRE_COLORS.gnd, pinText: common.label,
      toText: anode ? "common + leg (the longest leg)" : "common − leg (the longest leg)",
    },
  ]
}

const pixelWord = (n: number) => `${n} pixel${n === 1 ? "" : "s"}`

// Every wire the selected hardware needs, in the order the table lists them.
export function wiringPlan(profile: HardwareProfile): WiringPlan {
  const { operator, stage } = profile
  const wires: Wire[] = []
  const opStrip = operator.kind === "ws2812"
  const stStrip = stage.kind === "ws2812"
  const firstStrip: Role | null = opStrip ? "operator" : stStrip ? "stage" : null
  const stageChained = opStrip && stStrip

  if (operator.kind === "rgb") wires.push(...rgbWires("operator", operator))
  if (firstStrip) {
    const light = profile[firstStrip]
    const which = firstStrip === "operator" ? "operator" : "stage"
    wires.push(
      { role: firstStrip, pad: "DIN", from: rightPin(PINS.ws2812), color: WIRE_COLORS.data, pinText: PINS.ws2812, toText: `DIN pad of the ${which} strip (data in, the end the arrows point away from). Its first ${pixelWord(light.pixels)} are the ${which} light.` },
      { role: firstStrip, pad: "+5V", from: STRIP_POWER.vu, color: WIRE_COLORS.v5, pinText: "VU", toText: `+5V pad of the ${which} strip. Not 3V3. A board without VU and G there (Amica: RSV) uses VIN and a GND pin instead.` },
      { role: firstStrip, pad: "GND", from: STRIP_POWER.gnd, color: WIRE_COLORS.gnd, pinText: "G", toText: `GND pad of the ${which} strip (G is a GND pin)` },
    )
  }
  if (stage.kind === "rgb") wires.push(...rgbWires("stage", stage))
  if (stageChained) {
    wires.push(
      { role: "stage", pad: "DIN", from: { chainedFrom: "operator", pad: "DOUT" }, color: WIRE_COLORS.data, pinText: "operator strip DOUT", toText: `DIN pad of the stage strip (${pixelWord(stage.pixels)}). Not to the board.` },
      { role: "stage", pad: "+5V", from: { chainedFrom: "operator", pad: "+5V" }, color: WIRE_COLORS.v5, pinText: "operator strip +5V", toText: "+5V pad of the stage strip" },
      { role: "stage", pad: "GND", from: { chainedFrom: "operator", pad: "GND" }, color: WIRE_COLORS.gnd, pinText: "operator strip GND", toText: "GND pad of the stage strip" },
    )
  }
  const totalPixels = (opStrip ? operator.pixels : 0) + (stStrip ? stage.pixels : 0)
  return { operator, stage, wires, firstStrip, stageChained, totalPixels }
}

export const isBoardPin = (from: Wire["from"]): from is BoardPin => (from as BoardPin).side !== undefined

// A strip pixel draws about 20 mA per colour at full brightness; a tally shows one colour.
export const MA_PER_PIXEL_ONE_COLOUR = 20
