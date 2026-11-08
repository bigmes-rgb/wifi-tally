import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DockPage, { tileState } from './DockPage'
import { WALK_FLASH_MS } from '../components/PreServiceCheck'
import { socket } from '../hooks/useSocket'
import { ConnectionState, UdpTally, WebTally } from '../domain/Tally'

const server = socket as any

const light = (name: string, channelId?: string, state = ConnectionState.CONNECTED) =>
  ({ name, type: "udp", channelId, address: "192.168.1.20", port: 7411, state, program: "abc" })
const open = () => render(<MemoryRouter><DockPage /></MemoryRouter>)
const hubSays = (mixer = true) => act(() => {
  server.emitServerEvent('mixer.state', { isConnected: mixer, problem: mixer ? null : "No Roland V-8HD found on USB." })
  server.emitServerEvent('channel.state', { channels: [{ id: "1", name: "Wide" }, { id: "2" }, { id: "3" }] })
  server.emitServerEvent('hub.others', [])
  server.emitServerEvent('hub.info', { hostname: "BOOTH", addresses: ["192.168.1.5"], tallyPort: 7411, programStamp: "abc" })
  server.emitServerEvent('config.state.dimmer', 100)
  server.emitServerEvent('program.state', { programs: ["2"], previews: ["1"] })
})
const lights = (...tallies: any[]) => act(() => { server.emitServerEvent('tally.state', { tallies }) })

beforeEach(() => { server.connected = true })
afterEach(() => { server.cleanUp(); server.connected = false })

test("one tile per light in the switcher's order, coloured by what the light shows; a click flashes it", () => {
  const flashed: any[] = []
  server.onServerEvent('tally.highlight', (...args: any[]) => flashed.push(args))
  open()
  hubSays()
  lights(light("Cam 3", "3"), light("Cam 1", "1"), light("Cam 2", "2"), light("Spare"), light("Gone", "3", ConnectionState.DISCONNECTED))
  const grid = screen.getByTestId("dock-grid")
  const names = Array.from(grid.querySelectorAll("[data-testid^=dock-]")).map(el => el.getAttribute("data-testid"))
  expect(names).toEqual(["dock-Cam 1", "dock-Cam 2", "dock-Cam 3", "dock-Gone", "dock-Spare"])
  expect(screen.getByTestId("dock-Cam 1").getAttribute("data-state")).toBe("preview")
  expect(screen.getByTestId("dock-Cam 2").getAttribute("data-state")).toBe("program")
  expect(screen.getByTestId("dock-Cam 3").getAttribute("data-state")).toBe("idle")
  expect(screen.getByTestId("dock-Spare").getAttribute("data-state")).toBe("unpatched")
  expect(screen.getByTestId("dock-Gone").getAttribute("data-state")).toBe("offline")
  expect(screen.getByTestId("dock-Cam 1").textContent).toContain("Wide")
  expect(screen.getByTestId("dock-Gone").textContent).toContain("offline")
  fireEvent.click(screen.getByTestId("dock-Cam 2"))
  expect(flashed).toEqual([["Cam 2", "udp", WALK_FLASH_MS]])
  // one light off: the strip says so, and opens the pre-service check
  expect(screen.getByTestId("dock-strip").textContent).toContain("1 of 4 lights not online")
  fireEvent.click(screen.getByTestId("dock-strip"))
  expect(screen.getByTestId("precheck-dialog")).toBeInTheDocument()
})

test("nothing to say when all is well; the switcher off is said and shown on every tile", () => {
  open()
  hubSays()
  lights(light("Cam 1", "1"), light("Cam 2", "2"))
  expect(screen.queryByTestId("dock-strip")).toBeNull()
  act(() => {
    server.emitServerEvent('mixer.state', { isConnected: false, problem: "No Roland V-8HD found on USB." })
    server.emitServerEvent('program.state', { programs: null, previews: null })
  })
  expect(screen.getByTestId("dock-strip").textContent).toContain("Switcher not connected")
  expect(screen.getByTestId("dock-strip").getAttribute("data-status")).toBe("fail")
  expect(screen.getByTestId("dock-Cam 1").getAttribute("data-state")).toBe("unknown")
  expect(screen.getByTestId("dock-Cam 1").textContent).toContain("no switcher")
})

test("a hub that is gone is the first thing the strip says", () => {
  server.connected = false
  open()
  hubSays()
  lights(light("Cam 1", "1"))
  expect(screen.getByTestId("dock-hub").getAttribute("data-connected")).toBe("false")
  expect(screen.getByTestId("dock-strip").textContent).toContain("Hub disconnected")
})

test("tile states, from the light and the switcher", () => {
  const on = new UdpTally("a", "1", "192.168.1.2", 7411, ConnectionState.CONNECTED)
  expect(tileState(on, ["1"], [])).toBe("program")
  expect(tileState(on, ["2"], ["1"])).toBe("preview")
  expect(tileState(on, ["2"], ["2"])).toBe("idle")
  expect(tileState(on, null, null)).toBe("unknown")
  expect(tileState(new UdpTally("b", "1", "192.168.1.2", 7411, ConnectionState.MISSING), ["1"], [])).toBe("missing")
  expect(tileState(new UdpTally("c", "1", "192.168.1.2", 7411, ConnectionState.DISCONNECTED), ["1"], [])).toBe("offline")
  expect(tileState(new UdpTally("d", undefined, "192.168.1.2", 7411, ConnectionState.CONNECTED), ["1"], [])).toBe("unpatched")
  expect(tileState(new WebTally("phone", "1", [{ address: "1.2.3.4" }]), ["1"], [])).toBe("program")
})
