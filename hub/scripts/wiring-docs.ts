// Writes the wiring drawings and pin tables to docs/wiring.md, from the same code the page draws them
// with, so the docs cannot say something else than Build a light. Run: npm run wiring-docs (in hub/).
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { promises as fs } from 'fs'
import path from 'path'
import WiringDiagram from '../src/components/setup/WiringDiagram'
import { wiringPlan } from '../src/flasher/WiringPlan'
import { HardwareProfile } from '../src/flasher/HardwareProfile'

const docs = path.join(__dirname, '..', '..', 'docs')

const builds: { file: string, title: string, intro: string, profile: HardwareProfile }[] = [
  {
    file: 'wiring-strip', title: 'A NeoPixel strip as the operator light (the usual build)',
    intro: 'Five WS2812 pixels on D4, powered from VU. No stage light.',
    profile: { operator: { kind: 'ws2812', polarity: 'anode', pixels: 5, order: 'grb' }, stage: { kind: 'none', polarity: 'anode', pixels: 0, order: 'grb' } },
  },
  {
    file: 'wiring-strip-stage', title: 'Two strips: operator and stage',
    intro: 'The stage strip is chained to the end of the operator strip, not wired to the board.',
    profile: { operator: { kind: 'ws2812', polarity: 'anode', pixels: 5, order: 'grb' }, stage: { kind: 'ws2812', polarity: 'anode', pixels: 8, order: 'grb' } },
  },
  {
    file: 'wiring-rgb', title: 'A single RGB LED as the operator light',
    intro: 'A common-anode (common +) RGB LED on D1, D2, D3. For a common-cathode LED the common leg goes to GND instead.',
    profile: { operator: { kind: 'rgb', polarity: 'anode', pixels: 0, order: 'grb' }, stage: { kind: 'none', polarity: 'anode', pixels: 0, order: 'grb' } },
  },
]

const escape = (s: string) => s.replace(/\|/g, '\\|')

async function main() {
  await fs.mkdir(path.join(docs, 'images'), { recursive: true })
  let md = `# Wiring a light

Generated from the hub's own wiring code (\`hub/scripts/wiring-docs.ts\`), the same that draws the diagram in
Build a light, step 1. Pick your parts there and the page shows exactly your wires; these are the common builds.

The board is a NodeMCU v3 (LoLin), seen from above with the antenna at the top and the USB socket at the bottom.
A strip's +5V comes from **VU** (the 5 V of the USB socket); VIN carries nothing on these boards while they run
from USB. Its GND goes to the **G** right next to VU. Boards that print RSV there instead (Amica) use VIN and a GND pin.

`
  for (const b of builds) {
    const svg = renderToStaticMarkup(React.createElement(WiringDiagram, { profile: b.profile }))
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    await fs.writeFile(path.join(docs, 'images', `${b.file}.svg`), svg)
    const plan = wiringPlan(b.profile)
    md += `## ${b.title}\n\n${b.intro}\n\n![${b.title}](images/${b.file}.svg)\n\n| Board pin | Goes to |\n|---|---|\n`
    for (const w of plan.wires) md += `| ${escape(w.pinText)} | ${escape(w.toText)} |\n`
    md += '\n'
  }
  md += `## Checking it

Build a light, step 3 lights each colour through the USB cable and asks what you see, and tells you which wire to
move. The strip stays dark? Check +5V is on VU, not 3V3 or VIN. One colour wrong? The strip's colour order is set
in step 1 (GRB is the usual).
`
  await fs.writeFile(path.join(docs, 'wiring.md'), md)
  console.log(`wrote docs/wiring.md and ${builds.length} drawings`)
}

main().catch(e => { console.error(e); process.exit(1) })
