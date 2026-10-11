import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import BoardPicker from './BoardPicker'
import TallyDevice from '../../flasher/TallyDevice'

const device = (serialPorts: any[], path?: string) => TallyDevice.fromJson({ path, serialPorts } as any)

test("with one board plugged in there is nothing to pick", () => {
  render(<BoardPicker device={device([{ path: "COM6", vendorId: "1A86" }, { path: "COM1" }], "COM6")} onPick={() => {}} />)
  expect(screen.queryByTestId("board-picker")).toBeNull()
})

test("with two boards plugged in it asks which one, showing the one in use", () => {
  render(<BoardPicker device={device([{ path: "COM6", vendorId: "1A86" }, { path: "COM7", vendorId: "10C4" }], "COM7")} onPick={() => {}} />)
  const picker = screen.getByTestId("board-picker")
  expect(picker.textContent).toContain("2 boards are plugged in")
  expect(picker.textContent).toContain("COM7 (CP2102)")
})
