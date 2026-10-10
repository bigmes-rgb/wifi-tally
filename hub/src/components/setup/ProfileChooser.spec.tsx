import React from 'react'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import ProfileChooser from './ProfileChooser'
import { HardwareProfile } from '../../flasher/HardwareProfile'

const show = (profile: HardwareProfile) => render(<ProfileChooser profile={profile} onChange={() => {}} checked={false} onChecked={() => {}} />)

test("a 5-pixel operator strip and no stage light: 5 pixels, 3 wires, no stage part, no stock picture", () => {
  show({ operator: { kind: "ws2812", polarity: "anode", pixels: 5, order: "grb" }, stage: { kind: "none", polarity: "anode", pixels: 4, order: "grb" } })
  const diagram = screen.getByTestId("wiring-diagram")
  expect(within(diagram).getAllByTestId("pixel-operator")).toHaveLength(5)
  expect(within(diagram).queryByTestId("strip-stage")).toBeNull()
  expect(within(diagram).queryByTestId(/^led-/)).toBeNull()
  expect(["D4", "VIN", "GND"].every(p => within(diagram).queryByTestId(`pin-used-${p}`))).toBe(true)
  expect(within(diagram).queryByTestId("pin-used-D1")).toBeNull()
  expect(screen.getByTestId("wiring-table").querySelectorAll("tbody tr")).toHaveLength(3)
  expect(document.querySelector("img")).toBeNull()
  expect(screen.getByTestId("wiring-notes").textContent).toContain("about 100 mA")
})

test("adding an 8-pixel stage strip draws it chained, with 6 table rows", () => {
  show({ operator: { kind: "ws2812", polarity: "anode", pixels: 5, order: "grb" }, stage: { kind: "ws2812", polarity: "anode", pixels: 8, order: "grb" } })
  const diagram = screen.getByTestId("wiring-diagram")
  expect(within(diagram).getAllByTestId("pixel-stage")).toHaveLength(8)
  expect(screen.getByTestId("wiring-table").querySelectorAll("tbody tr")).toHaveLength(6)
  expect(screen.getByTestId("wiring-table").textContent).toContain("operator strip DOUT")
  expect(screen.getByTestId("wiring-notes").textContent).toContain("about 260 mA")
})

test("RGB LEDs: the common leg's pin follows the polarity, and the notes mention resistors", () => {
  show({ operator: { kind: "rgb", polarity: "anode", pixels: 5, order: "grb" }, stage: { kind: "rgb", polarity: "cathode", pixels: 4, order: "grb" } })
  const diagram = screen.getByTestId("wiring-diagram")
  expect(within(diagram).getByTestId("led-operator")).toBeInTheDocument()
  expect(within(diagram).getByTestId("led-stage")).toBeInTheDocument()
  expect(within(diagram).getAllByTestId("pin-used-3V3")).toHaveLength(1)
  expect(within(diagram).getAllByTestId("pin-used-GND")).toHaveLength(1)
  expect(["D1", "D2", "D3", "D5", "D6", "D7"].every(p => within(diagram).queryByTestId(`pin-used-${p}`))).toBe(true)
  expect(screen.getByTestId("wiring-notes").textContent).toContain("220 Ω")
  expect(screen.getByTestId("wiring-print")).toBeInTheDocument()
})
