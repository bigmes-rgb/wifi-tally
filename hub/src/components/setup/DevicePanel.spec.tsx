import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import DevicePanel from './DevicePanel'
import TallyDevice from '../../flasher/TallyDevice'

const board = (fields: any) => TallyDevice.fromJson({ path: "COM5", firmwareAvailable: true, serialPorts: [], ...fields })

test("a board still formatting says to wait, offers Check again first, and shows what it printed", () => {
  render(<DevicePanel device={board({ boardState: "formatting", boardOutput: "Formatting file system. Please wait...", errorMessage: "The board did not answer the hub's Lua commands." })} onReload={() => {}} />)
  const alert = screen.getByTestId("device-state-formatting")
  expect(alert.textContent).toContain("setting up its storage")
  expect(screen.getByTestId("device-check")).toBeInTheDocument()
  expect(screen.queryByTestId("device-firmware")).toBeNull()
  expect(screen.getByTestId("device-output").textContent).toContain("Formatting file system")
})

test("a crashing board says the install was not clean and offers Install firmware", () => {
  render(<DevicePanel device={board({ boardState: "crashing", boardOutput: "Fatal exception 28" })} onReload={() => {}} />)
  expect(screen.getByTestId("device-state-crashing").textContent).toContain("did not install cleanly")
  expect(screen.getByTestId("device-firmware")).toBeInTheDocument()
})

test("a silent board says to press RST after an install", () => {
  render(<DevicePanel device={board({ boardState: "silent" })} onReload={() => {}} />)
  expect(screen.getByTestId("device-state-silent").textContent).toContain("press the board's RST button once")
  expect(screen.queryByTestId("device-output")).toBeNull()
})
