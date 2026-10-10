import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import DevicePanel, { twoHubsText } from './DevicePanel'
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

const flipFlop = "[INFO]  Found hub at 192.168.1.35\r\n[INFO]  Found hub at 192.168.1.6\r\n[INFO]  Found hub at 192.168.1.35\r\n"

test("a light switching between two hubs says so, names both addresses, and offers Check again", () => {
  render(<DevicePanel device={board({ boardState: "twoHubs", boardOutput: flipFlop })} onReload={() => {}} />)
  const alert = screen.getByTestId("device-state-twoHubs")
  expect(alert.textContent).toContain("hears a vTally hub at two addresses")
  expect(alert.textContent).toContain("192.168.1.35 and 192.168.1.6")
  expect(alert.textContent).toContain("press RST on the board")
  expect(screen.getByTestId("device-check")).toBeInTheDocument()
  expect(screen.queryByTestId("device-firmware")).toBeNull()
})

test("a light running its tally software says to check again, not to reinstall the firmware", () => {
  render(<DevicePanel device={board({ boardState: "tallyBusy", boardOutput: "[INFO]  Got IP 192.168.1.50\r\n" })} onReload={() => {}} />)
  expect(screen.getByTestId("device-state-tallyBusy").textContent).toContain("tally software is running")
  expect(screen.getByTestId("device-check")).toBeInTheDocument()
  expect(screen.queryByTestId("device-firmware")).toBeNull()
})

describe("twoHubsText()", () => {
  test("both addresses are this computer: it is on the network twice", () => {
    const text = twoHubsText(["192.168.1.35", "192.168.1.6"], ["192.168.1.6", "192.168.1.35"])
    expect(text).toContain("Both, 192.168.1.35 and 192.168.1.6, are this computer")
    expect(text).toContain("Unplug its network cable or turn its Wi-Fi off")
  })
  test("one address is someone else's: another computer runs vTally", () => {
    const text = twoHubsText(["192.168.1.35", "192.168.1.20"], ["192.168.1.35"])
    expect(text).toContain("192.168.1.20 is another computer running vTally")
    expect(text).not.toContain("network twice")
  })
  test("without this computer's addresses it names both possibilities", () => {
    const text = twoHubsText(["192.168.1.35", "192.168.1.6"], [])
    expect(text).toContain("another computer on this network runs vTally")
    expect(text).toContain("on the network twice")
  })
})
