import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import PreServiceCheck, { WALK_FLASH_MS, WALK_GAP_MS } from './PreServiceCheck'
import { socket } from '../hooks/useSocket'
import { ConnectionState } from '../domain/Tally'

const server = socket as any

const light = (name: string, channelId?: string, state = ConnectionState.CONNECTED, program: string | undefined = "abc") =>
  ({ name, type: "udp", channelId, address: "192.168.1.20", port: 7411, state, program })
const hubSays = () => act(() => {
  server.emitServerEvent('mixer.state', { isConnected: true })
  server.emitServerEvent('channel.state', { channels: [{ id: "1", name: "Wide" }, { id: "2" }] })
  server.emitServerEvent('hub.others', [])
  server.emitServerEvent('hub.info', { hostname: "BOOTH", addresses: ["192.168.1.5"], tallyPort: 7411, programStamp: "abc" })
  server.emitServerEvent('config.state.dimmer', 100)
})
const lights = (...tallies: any[]) => act(() => { server.emitServerEvent('tally.state', { tallies }) })

afterEach(() => { server.cleanUp() })

test("lists what must be true for the service, with a verdict, and offers the one-click fix", () => {
  const sent: number[] = []
  server.onServerEvent('config.change.dimmer', (v: number) => sent.push(v))
  render(<PreServiceCheck />)
  hubSays()
  lights(light("Cam 1", "1"), light("Cam 2", "2", ConnectionState.DISCONNECTED))
  act(() => { server.emitServerEvent('config.state.dimmer', 60) })
  fireEvent.click(screen.getByTestId("precheck"))
  expect(screen.getByTestId("precheck-verdict").textContent).toContain("1 thing to fix before the service")
  expect(screen.getByTestId("precheck-lights").getAttribute("data-status")).toBe("fail")
  expect(screen.getByTestId("precheck-lights").textContent).toContain("Cam 2")
  expect(screen.getByTestId("precheck-switcher").getAttribute("data-status")).toBe("ok")
  expect(screen.getByTestId("precheck-brightness").textContent).toContain("dimmed to 60%")
  fireEvent.click(screen.getByTestId("precheck-full-brightness"))
  expect(sent).toEqual([100])
  // the hub confirms, the finding clears without a reload
  act(() => { server.emitServerEvent('config.state.dimmer', 100) })
  expect(screen.getByTestId("precheck-brightness").getAttribute("data-status")).toBe("ok")
})

test("the walk test flashes each online light in the switcher's order, one after the other, and can be stopped", () => {
  jest.useFakeTimers()
  try {
    const flashed: any[] = []
    server.onServerEvent('tally.highlight', (name: string, type: string, ms: number) => flashed.push([name, type, ms]))
    render(<PreServiceCheck />)
    hubSays()
    // Zed is on input 1 and comes first; Off is not online and is left out
    lights(light("Cam 2", "2"), light("Zed", "1"), light("Off", "2", ConnectionState.DISCONNECTED), light("Spare"))
    fireEvent.click(screen.getByTestId("precheck"))
    expect(screen.getByTestId("walk-list").textContent).toContain("Wide")
    expect(screen.queryByTestId("walk-Off")).toBeNull()
    expect(screen.queryByTestId("walk-Spare")).toBeNull()

    fireEvent.click(screen.getByTestId("walk-start"))
    expect(flashed).toEqual([["Zed", "udp", WALK_FLASH_MS]])
    expect(screen.getByTestId("walk-Zed").getAttribute("data-state")).toBe("now")
    expect(screen.getByTestId("walk-flash-Zed")).toBeDisabled()
    act(() => { jest.advanceTimersByTime(WALK_FLASH_MS + WALK_GAP_MS) })
    expect(flashed).toHaveLength(2)
    expect(flashed[1][0]).toBe("Cam 2")
    expect(screen.getByTestId("walk-Zed").getAttribute("data-state")).toBe("done")
    expect(screen.getByTestId("walk-Cam 2").getAttribute("data-state")).toBe("now")
    act(() => { jest.advanceTimersByTime(WALK_FLASH_MS + WALK_GAP_MS) })
    expect(screen.getByTestId("walk-done")).toBeInTheDocument()
    expect(screen.getByTestId("walk-start").textContent).toContain("again")

    // a single light again, by hand
    fireEvent.click(screen.getByTestId("walk-flash-Cam 2"))
    expect(flashed[2][0]).toBe("Cam 2")

    // stopping half-way flashes nothing more
    fireEvent.click(screen.getByTestId("walk-start"))
    fireEvent.click(screen.getByTestId("walk-stop"))
    const before = flashed.length
    act(() => { jest.advanceTimersByTime(2 * (WALK_FLASH_MS + WALK_GAP_MS)) })
    expect(flashed.length).toBe(before)
  } finally {
    jest.useRealTimers()
  }
})
