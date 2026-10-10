import React, { useMemo } from 'react'
import { HardwareProfile } from '../../flasher/HardwareProfile'
import { wiringPlan } from '../../flasher/WiringPlan'
import { allPins, GEOMETRY, layoutDiagram, LedPart, Part, pinIsUsed, pinPoint, Point, StripPart } from './wiringLayout'

// Drawn from the selections on the page, so it shows exactly the parts, pixel counts and pins the
// pin table lists, and nothing else. A light background keeps wire colours the same in dark mode.

const INK = "#212121"
const MUTED = "#757575"
const PAD = "#d4a017"

type Props = {
  profile: HardwareProfile
  // pins a wiring-test finding names; drawn with a ring
  highlightPins?: string[]
}

const roleTitle = { operator: "Operator light", stage: "Stage light" }
const roleSub = { operator: "faces the camera operator", stage: "faces the people on stage" }
const path = (pts: Point[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ")

function Board({ usedColor, highlight }: { usedColor: (side: "left" | "right", index: number) => string | undefined, highlight: Set<string> }) {
  const { x, y, w, h } = GEOMETRY.board
  return <g>
    <rect x={x} y={y} width={w} height={h} rx={8} fill="#1b2a6b" />
    {/* the ESP-12 module with its antenna at the top */}
    <rect x={x + 30} y={y + 6} width={w - 60} height={44} rx={2} fill="#b0b8c4" />
    <path d={`M${x + 40},${y + 16} h14 v12 h12 v-12 h12 v12 h12 v-12 h12 v12 h14`} fill="none" stroke="#8a6d1d" strokeWidth={2} />
    <text x={x + w / 2} y={y + 46} textAnchor="middle" fontSize={9} fill="#37474f">ESP8266</text>
    <text x={x + w / 2} y={y + h - 50} textAnchor="middle" fontSize={12} fill="#ffffff" fontWeight="bold">NodeMCU</text>
    <text x={x + w / 2} y={y + h - 38} textAnchor="middle" fontSize={8} fill="#ffffff" opacity={0.7}>top view, chip side up</text>
    {/* RST and FLASH buttons sit either side of the USB socket */}
    <rect x={x + 18} y={y + h - 22} width={14} height={14} rx={2} fill="#9e9e9e" />
    <text x={x + 25} y={y + h - 25} textAnchor="middle" fontSize={7} fill="#ffffff">RST</text>
    <rect x={x + w - 32} y={y + h - 22} width={14} height={14} rx={2} fill="#9e9e9e" />
    <text x={x + w - 25} y={y + h - 25} textAnchor="middle" fontSize={7} fill="#ffffff">FLASH</text>
    <rect x={x + w / 2 - 26} y={y + h - 18} width={52} height={30} rx={3} fill="#cfd8dc" stroke="#90a4ae" />
    <text x={x + w / 2} y={y + h + 4} textAnchor="middle" fontSize={9} fill="#37474f">USB</text>
    {allPins().map(p => {
      const [cx, cy] = pinPoint(p)
      const color = usedColor(p.side, p.index)
      const ringed = color !== undefined && highlight.has(p.label)
      const labelX = p.side === "left" ? cx + 11 : cx - 11
      return <g key={`${p.side}${p.index}`} data-testid={color ? `pin-used-${p.label}` : undefined}>
        {ringed && <circle cx={cx} cy={cy} r={11} fill="none" stroke="#ff1744" strokeWidth={3} data-testid={`pin-ring-${p.label}`} />}
        <circle cx={cx} cy={cy} r={color ? 6 : 4.5} fill={color || PAD} opacity={color ? 1 : 0.4} stroke={color ? "#ffffff" : "none"} strokeWidth={1.5} />
        <text x={labelX} y={cy + 4} textAnchor={p.side === "left" ? "start" : "end"} fontSize={color ? 14 : 11} fontFamily="monospace"
          fontWeight={color ? "bold" : "normal"} fill="#ffffff" opacity={color ? 1 : 0.45}>{p.label}</text>
      </g>
    })}
  </g>
}

function Title({ part, partX }: { part: Part, partX: number }) {
  const detail = part.kind === "strip"
    ? `${part.pixels} pixel${part.pixels === 1 ? "" : "s"}, cut after pixel ${part.pixels}`
    : `RGB LED, common ${part.polarity === "anode" ? "+ (anode)" : "− (cathode)"}`
  return <g>
    <text x={partX} y={part.titleY + 2} fontSize={15} fontWeight="bold" fill={INK}>{roleTitle[part.role]}</text>
    <text x={partX} y={part.titleY + 19} fontSize={12} fill={MUTED}>{roleSub[part.role]} · {detail}</text>
  </g>
}

function Strip({ part, partX }: { part: StripPart, partX: number }) {
  const { pixelPitch } = GEOMETRY
  const top = part.top
  const endX = part.dout.DOUT[0]
  const pads = (x: number, names: string[], anchor: "start" | "end") => names.map((name, i) => <g key={name}>
    <rect x={anchor === "start" ? x + 2 : x - 10} y={top + 4 + i * 12} width={8} height={8} fill={PAD} />
    <text x={anchor === "start" ? x + 13 : x - 13} y={top + 11 + i * 12} fontSize={8} fill="#ffffff" textAnchor={anchor}>{name}</text>
  </g>)
  return <g data-testid={`strip-${part.role}`}>
    <rect x={partX} y={top} width={endX - partX} height={40} rx={3} fill="#212121" />
    {pads(partX, ["+5V", "DIN", "GND"], "start")}
    {Array.from({ length: part.pixels }, (_, i) => {
      const cx = partX + 34 + i * pixelPitch + 9
      return <g key={i} data-testid={`pixel-${part.role}`}>
        <rect x={cx - 9} y={top + 11} width={18} height={18} fill="#f5f5f5" />
        <circle cx={cx} cy={top + 20} r={5} fill="#e0e0e0" stroke="#bdbdbd" />
        {/* the data direction, printed on every real strip */}
        <path d={`M${cx + 11},${top + 16} l5,4 l-5,4 z`} fill="#ffffff" />
        <text x={cx} y={top + 52} fontSize={9} fill={MUTED} textAnchor="middle">{i + 1}</text>
      </g>
    })}
    {pads(endX, ["+5V", "DO", "GND"], "end")}
    {/* a chained strip has its wires leaving here; its subtitle says where to cut */}
    {part.showRest && <g>
      <line x1={part.cutX} y1={top - 6} x2={part.cutX} y2={top + 46} stroke="#e53935" strokeWidth={1.5} strokeDasharray="4 3" />
      <text x={part.cutX} y={top + 60} fontSize={10} fill="#e53935" textAnchor="middle">✂ cut</text>
      <g opacity={0.35}>
        <rect x={part.cutX + 6} y={top} width={44} height={40} rx={3} fill="none" stroke="#212121" strokeDasharray="4 3" />
        <text x={part.cutX + 28} y={top + 24} fontSize={9} fill={MUTED} textAnchor="middle">spare</text>
      </g>
    </g>}
  </g>
}

function Led({ part }: { part: LedPart }) {
  const [cx, cy] = part.center
  const plus = part.polarity === "anode"
  const legs: [keyof LedPart["pads"], string][] = [["R", "R"], ["common", plus ? "+" : "−"], ["G", "G"], ["B", "B"]]
  return <g data-testid={`led-${part.role}`}>
    {legs.map(([pad, label]) => {
      const [x, y] = part.pads[pad]
      return <g key={pad}>
        <line x1={x} y1={y} x2={cx - 20} y2={y} stroke="#9e9e9e" strokeWidth={2.5} />
        <text x={cx - 30} y={y - 3} fontSize={10} fill={INK} textAnchor="middle" fontWeight="bold">{label}</text>
      </g>
    })}
    {/* a 5 mm LED from the side: round top, flat rim at the legs */}
    <path d={`M${cx - 20},${cy - 34} h8 a26,34 0 0 1 0,68 h-8 z`} fill="#f5f5f5" stroke="#9e9e9e" strokeWidth={1.5} />
    <text x={cx + 26} y={cy - 4} fontSize={12} fill={INK}>{plus ? "+" : "−"} is the longest leg</text>
    <text x={cx + 26} y={cy + 12} fontSize={11} fill={MUTED}>(the common one)</text>
  </g>
}

function WiringDiagram({ profile, highlightPins = [] }: Props) {
  const layout = useMemo(() => layoutDiagram(wiringPlan(profile)), [profile])
  const highlight = new Set(highlightPins)
  return <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" role="img" aria-label="Wiring diagram for the selected lights" data-testid="wiring-diagram"
    style={{ maxWidth: layout.width, display: "block" }}>
    <rect x={0} y={0} width={layout.width} height={layout.height} rx={8} fill="#ffffff" />
    <Board usedColor={(side, index) => pinIsUsed(layout, side, index)} highlight={highlight} />
    {layout.parts.map(part => <g key={part.role}>
      <Title part={part} partX={layout.partX} />
      {part.kind === "strip" ? <Strip part={part} partX={layout.partX} /> : <Led part={part} />}
    </g>)}
    {/* a white edge under every wire makes crossings read as one wire passing over another */}
    {layout.wires.map((w, i) => <path key={`u${i}`} d={path(w.points)} fill="none" stroke="#ffffff" strokeWidth={7} strokeLinejoin="round" />)}
    {layout.wires.map((w, i) => <path key={`w${i}`} d={path(w.points)} fill="none" stroke={w.wire.color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round"
      data-testid={`wire-${w.wire.role}-${w.wire.pad}`} />)}
  </svg>
}

export default WiringDiagram
