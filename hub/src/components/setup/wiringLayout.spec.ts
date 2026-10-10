import { HardwareProfile, LightProfile } from '../../flasher/HardwareProfile'
import { BoardPin, isBoardPin, wiringPlan } from '../../flasher/WiringPlan'
import { crossings, GEOMETRY, layoutDiagram, pinPoint } from './wiringLayout'

const light = (kind: LightProfile["kind"], polarity: LightProfile["polarity"] = "anode", pixels = 5): LightProfile => ({ kind, polarity, pixels, order: "grb" })
const OPERATOR_CHOICES = [light("rgb", "anode"), light("rgb", "cathode"), light("ws2812", "anode", 10)]
const STAGE_CHOICES = [light("none"), light("rgb", "anode"), light("rgb", "cathode"), light("ws2812", "anode", 10)]
const name = (l: LightProfile) => l.kind === "rgb" ? `rgb-${l.polarity}` : l.kind === "ws2812" ? `strip-${l.pixels}` : "none"

// every selection the page allows, with the longest strips so nothing runs off the drawing
const ALL: [string, HardwareProfile][] = OPERATOR_CHOICES.flatMap(operator => STAGE_CHOICES.map(stage =>
  [`operator ${name(operator)}, stage ${name(stage)}`, { operator, stage }] as [string, HardwareProfile]))

describe.each(ALL)("%s", (_, profile) => {
  const plan = wiringPlan(profile)
  const layout = layoutDiagram(plan)

  test("draws a part for each selected light and none for 'Nothing'", () => {
    expect(layout.parts.map(p => p.role)).toEqual(profile.stage.kind === "none" ? ["operator"] : ["operator", "stage"])
    layout.parts.forEach(p => expect(p.kind).toBe(profile[p.role].kind === "ws2812" ? "strip" : "rgb"))
  })

  test("every wire starts on its board pin and ends on its pad", () => {
    expect(layout.wires).toHaveLength(plan.wires.length)
    layout.wires.forEach(({ wire, points }) => {
      const part = layout.parts.find(p => p.role === wire.role) as any
      expect(points[points.length - 1]).toEqual(part.pads[wire.pad])
    })
    layout.wires.filter(({ wire }) => isBoardPin(wire.from)).forEach(({ wire, points }) => {
      expect(points[0]).toEqual(pinPoint(wire.from as BoardPin))
    })
  })

  test("the highlighted board pins are exactly the pins the table lists, each used once", () => {
    const pins = plan.wires.filter(w => isBoardPin(w.from)).map(w => w.from as BoardPin)
    expect(new Set(pins.map(p => `${p.side}:${p.index}`)).size).toBe(pins.length)
    expect([...layout.usedPins.keys()].sort()).toEqual(pins.map(p => `${p.side}:${p.index}`).sort())
    pins.forEach(p => expect(p.label).toBe(plan.wires.find(w => w.from === p)!.pinText))
  })

  test("no two wires run along the same line, and wires cross only where the parts force it", () => {
    // An RGB LED's legs run red, common, green, blue; its pins leave the board as D1 (green),
    // D2 (red), D3 (blue), common. Three pairs are in opposite order, so three crossings per LED
    // are unavoidable, on paper and on the bench. A strip's DIN sits between +5V and GND: one more.
    // With an RGB operator light and a stage strip, D4 sits above the LED's common pin on the
    // header but its wire goes to the strip below the LED: those two must cross as well.
    const leds = layout.parts.filter(p => p.kind === "rgb").length
    const strips = plan.firstStrip ? 1 : 0
    const d4UnderLed = profile.operator.kind === "rgb" && profile.stage.kind === "ws2812" ? 1 : 0
    const cost = crossings(layout.wires.map(w => w.points))
    expect(cost).toBeLessThanOrEqual(3 * leds + strips + d4UnderLed)
  })

  test("wires only turn at right angles, stay on the drawing and do not run across the board", () => {
    const { x, y, w, h } = GEOMETRY.board
    layout.wires.forEach(({ points }) => {
      points.slice(1).forEach((p, i) => expect(p[0] === points[i][0] || p[1] === points[i][1]).toBe(true))
      points.forEach(([px, py]) => {
        expect(px).toBeGreaterThanOrEqual(0)
        expect(px).toBeLessThanOrEqual(layout.width)
        expect(py).toBeLessThanOrEqual(layout.height)
      })
      points.slice(1).forEach(([px, py]) => expect(px > x && px < x + w && py > y && py < y + h).toBe(false))
    })
  })
})

test("a chained stage strip is fed from the operator strip's far end, not from the board", () => {
  const plan = wiringPlan({ operator: light("ws2812", "anode", 5), stage: light("ws2812", "anode", 8) })
  const stageWires = plan.wires.filter(w => w.role === "stage")
  expect(stageWires.map(w => w.pad).sort()).toEqual(["+5V", "DIN", "GND"])
  stageWires.forEach(w => expect(isBoardPin(w.from)).toBe(false))
  const layout = layoutDiagram(plan)
  expect(crossings(layout.wires.filter(w => w.wire.role === "stage").map(w => w.points))).toBe(0)
})

test("with an RGB operator light, a stage strip is the one on D4", () => {
  const plan = wiringPlan({ operator: light("rgb"), stage: light("ws2812", "anode", 6) })
  expect(plan.firstStrip).toBe("stage")
  expect(plan.wires.find(w => w.pad === "DIN")!.pinText).toBe("D4")
})

test("a common-anode LED's common leg goes to 3V3, a common-cathode one to GND", () => {
  const common = (polarity: "anode" | "cathode") => wiringPlan({ operator: light("rgb", polarity), stage: light("none") }).wires.find(w => w.pad === "common")!.pinText
  expect(common("anode")).toBe("3V3")
  expect(common("cathode")).toBe("GND")
})
