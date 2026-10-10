import { Role } from '../../flasher/HardwareProfile'
import { BoardPin, BoardSide, BOARD_PINS, isBoardPin, PadName, Wire, WiringPlan } from '../../flasher/WiringPlan'

// Geometry for the wiring diagram, kept apart from React so tests can check what is drawn.

export type Point = [number, number]

export const GEOMETRY = {
  board: { x: 40, y: 44, w: 170, h: 470 },
  pinY0: 108,
  pitch: 24,
  pinX: { left: 54, right: 196 } as Record<BoardSide, number>,
  laneX0: 232,
  laneStep: 13,
  pixelPitch: 28,
}

export const pinPoint = (p: BoardPin): Point => [GEOMETRY.pinX[p.side], GEOMETRY.pinY0 + p.index * GEOMETRY.pitch]

export interface StripPart {
  kind: "strip"
  role: Role
  titleY: number
  top: number // strip outline top; it is 40 high
  pixels: number
  pads: Record<"+5V" | "DIN" | "GND", Point> // the DIN end, where wires arrive
  dout: Record<"+5V" | "DOUT" | "GND", Point> // the far end of the cut piece
  cutX: number
  showRest: boolean // the leftover reel is drawn after the last strip only
}

export interface LedPart {
  kind: "rgb"
  role: Role
  titleY: number
  polarity: "anode" | "cathode"
  center: Point // the LED body
  pads: Record<"R" | "G" | "B" | "common", Point> // leg ends, where wires arrive
}

export type Part = StripPart | LedPart

export interface DrawnWire {
  wire: Wire
  points: Point[]
}

export interface Layout {
  width: number
  partX: number // where wires meet a light: the strip's left edge, or the LED legs' ends
  height: number
  parts: Part[]
  wires: DrawnWire[]
  usedPins: Map<string, string> // "right:4" -> wire colour
}

const pinKey = (p: BoardPin) => `${p.side}:${p.index}`

// --- crossings -------------------------------------------------------------

type Segment = { x1: number, y1: number, x2: number, y2: number }
const segments = (pts: Point[]): Segment[] => pts.slice(1).map((p, i) => ({ x1: pts[i][0], y1: pts[i][1], x2: p[0], y2: p[1] }))
const between = (v: number, a: number, b: number) => v > Math.min(a, b) && v < Math.max(a, b)
const overlap = (a1: number, a2: number, b1: number, b2: number) => Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)) > 0

// a crossing costs 1; two wires running along the same line cost far more, they would look like one
const segmentCost = (a: Segment, b: Segment): number => {
  const aH = a.y1 === a.y2, bH = b.y1 === b.y2
  if (aH && bH) return a.y1 === b.y1 && overlap(a.x1, a.x2, b.x1, b.x2) ? 100 : 0
  if (!aH && !bH) return a.x1 === b.x1 && overlap(a.y1, a.y2, b.y1, b.y2) ? 100 : 0
  const h = aH ? a : b, v = aH ? b : a
  return between(v.x1, h.x1, h.x2) && between(h.y1, v.y1, v.y2) ? 1 : 0
}

const wireLength = (wires: Point[][]) => wires.reduce((sum, pts) => sum + pts.slice(1).reduce((s, p, i) => s + Math.abs(p[0] - pts[i][0]) + Math.abs(p[1] - pts[i][1]), 0), 0)

export const crossings = (wires: Point[][]): number => {
  const segs = wires.map(segments)
  let total = 0
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      for (const a of segs[i]) for (const b of segs[j]) total += segmentCost(a, b)
    }
  }
  return total
}

function* permutations(n: number): Generator<number[]> {
  const a = Array.from({ length: n }, (_, i) => i)
  const c = new Array(n).fill(0)
  yield a.slice()
  let i = 0
  while (i < n) {
    if (c[i] < i) {
      const k = i % 2 === 0 ? 0 : c[i];
      [a[k], a[i]] = [a[i], a[k]]
      yield a.slice()
      c[i]++
      i = 0
    } else {
      c[i] = 0
      i++
    }
  }
}

// --- layout ----------------------------------------------------------------

export function layoutDiagram(plan: WiringPlan): Layout {
  const G = { ...GEOMETRY, partX: 0 }
  const boardWireCount = plan.wires.filter(w => isBoardPin(w.from)).length
  // the lights start just right of the last lane; chained strip wires need 30 more on their left
  G.partX = Math.max(300, G.laneX0 + (boardWireCount - 1) * G.laneStep + 40)
  const parts: Part[] = []
  let y = 56
  const roles: Role[] = plan.stage.kind === "none" ? ["operator"] : ["operator", "stage"]
  const lastStrip: Role | null = plan.stage.kind === "ws2812" ? "stage" : plan.operator.kind === "ws2812" ? "operator" : null

  for (const role of roles) {
    const light = plan[role]
    if (light.kind === "rgb") {
      const cy = y + 62
      parts.push({
        kind: "rgb", role, titleY: y, polarity: light.polarity, center: [G.partX + 104, cy],
        pads: { R: [G.partX, cy - 27], common: [G.partX - 12, cy - 9], G: [G.partX, cy + 9], B: [G.partX, cy + 27] },
      })
      y += 132
    } else if (light.kind === "ws2812") {
      const top = y + 30
      const endX = G.partX + 34 + light.pixels * G.pixelPitch
      parts.push({
        kind: "strip", role, titleY: y, top, pixels: light.pixels,
        pads: { "+5V": [G.partX, top + 8], DIN: [G.partX, top + 20], GND: [G.partX, top + 32] },
        dout: { "+5V": [endX, top + 8], DOUT: [endX, top + 20], GND: [endX, top + 32] },
        cutX: endX + 10,
        showRest: role === lastStrip,
      })
      // a chained stage strip needs room underneath for the wires that loop back to its start
      y += role === "operator" && plan.stageChained ? 150 : 112
    }
  }

  const partOf = (role: Role) => parts.find(p => p.role === role) as Part
  const padPoint = (role: Role, pad: PadName): Point => (partOf(role).pads as any)[pad]

  // wires from the operator strip's far end to the stage strip's start: right, down, left, down,
  // right. Turning twice keeps the three wires in order without crossing each other.
  const chainOrder = ["+5V", "DOUT", "GND"] as const
  const chained: DrawnWire[] = plan.wires.filter(w => !isBoardPin(w.from)).map(w => {
    const from = w.from as { pad: "+5V" | "DOUT" | "GND" }
    const k = chainOrder.indexOf(from.pad)
    const op = partOf("operator") as StripPart
    const start = op.dout[from.pad]
    const end = padPoint("stage", w.pad)
    const xr = op.cutX + 16 + (2 - k) * 8
    const yb = op.top + 64 + (2 - k) * 8
    const xl = G.partX - 12 - k * 8
    return { wire: w, points: [start, [xr, start[1]], [xr, yb], [xl, yb], [xl, end[1]], end] }
  })

  // wires from the board: each gets its own vertical lane between the board and the lights.
  // Pins on the left header (VIN, GND) leave to the left and go round the board, over the top or
  // under the bottom, whichever crosses fewer wires.
  const boardWires = plan.wires.filter(w => isBoardPin(w.from))
  const leftWires = boardWires.filter(w => (w.from as BoardPin).side === "left")
  const top = G.board.y, bottom = G.board.y + G.board.h
  const route = (w: Wire, laneX: number, overTop: boolean): Point[] => {
    const from = w.from as BoardPin
    const start = pinPoint(from)
    const end = padPoint(w.role, w.pad)
    if (from.side === "right") return [start, [laneX, start[1]], [laneX, end[1]], end]
    // the wire from the lower pin goes on the outside going up, on the inside going down
    const k = overTop ? leftWires.length - 1 - leftWires.indexOf(w) : leftWires.indexOf(w)
    const lx = G.board.x - 12 - k * 10
    const ry = overTop ? top - 14 - k * 10 : bottom + 16 + k * 12
    return [start, [lx, start[1]], [lx, ry], [laneX, ry], [laneX, end[1]], end]
  }
  const lanes = boardWires.map((_, i) => G.laneX0 + i * G.laneStep)
  const chainedPoints = chained.map(c => c.points)
  let best: Point[][] = []
  let bestCost = Infinity
  // both left wires take the same way round, or they would cross each other at the corner
  for (const overTop of leftWires.length ? [true, false] : [false]) {
    for (const order of permutations(boardWires.length)) {
      const candidate = boardWires.map((w, i) => route(w, lanes[order[i]], overTop))
      // ties go to the shorter wiring
      const cost = crossings([...candidate, ...chainedPoints]) + wireLength(candidate) / 1e6
      if (cost < bestCost) { best = candidate; bestCost = cost }
    }
  }

  const wires: DrawnWire[] = [...boardWires.map((w, i) => ({ wire: w, points: best[i] })), ...chained]
  const usedPins = new Map<string, string>()
  boardWires.forEach(w => usedPins.set(pinKey(w.from as BoardPin), w.color))

  const lowestWire = Math.max(...wires.flatMap(w => w.points.map(p => p[1])), 0)
  const height = Math.max(y + 10, bottom + 46, lowestWire + 14)
  // as wide as what is drawn: the spare strip, a chained wire, an LED's note, or a title
  const rightmost = Math.max(
    ...wires.flatMap(w => w.points.map(p => p[0] + 12)),
    ...parts.map(p => p.kind === "strip" ? (p.showRest ? p.cutX + 58 : p.cutX + 12) : p.center[0] + 170),
    G.partX + 330,
  )
  return { width: Math.ceil(rightmost), partX: G.partX, height, parts, wires, usedPins }
}

export const pinIsUsed = (layout: Layout, side: BoardSide, index: number) => layout.usedPins.get(`${side}:${index}`)
export const allPins = (): BoardPin[] => (["left", "right"] as BoardSide[]).flatMap(side => BOARD_PINS[side].map((label, index) => ({ side, index, label })))
