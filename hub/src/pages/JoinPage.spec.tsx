import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route } from 'react-router-dom'
import JoinPage, { joinNameProblem, nextPhoneName } from './JoinPage'
import { socket } from '../hooks/useSocket'

const server = socket as any
let location = ""
const open = () => render(<MemoryRouter initialEntries={["/join"]}>
  <JoinPage />
  <Route path="*" render={({ location: l }) => { location = l.pathname; return null }} />
</MemoryRouter>)
const tallies = (...list: any[]) => act(() => {
  server.emitServerEvent('channel.state', { channels: [{ id: "1", name: "Wide" }, { id: "2" }] })
  server.emitServerEvent('tally.state', { tallies: list })
})

beforeEach(() => { server.connected = true; window.localStorage.clear() })
afterEach(() => { server.cleanUp(); server.connected = false })

test("names: a free Phone N to start with, and the hub's rules said before Start", () => {
  expect(nextPhoneName(["Phone 1", "Cam 2"])).toBe("Phone 2")
  expect(joinNameProblem("", [])).toContain("Type")
  expect(joinNameProblem("Cam \"4\"", [])).toContain("quotes")
  expect(joinNameProblem("Cam 2", ["Cam 2"])).toContain("taken")
  expect(joinNameProblem("x".repeat(27), [])).toContain("26")
  // counted in bytes, like the hub: 13 letters that take two bytes each are too long
  expect(joinNameProblem("é".repeat(13), [])).toBeNull()
  expect(joinNameProblem("é".repeat(14), [])).toContain("26")
  expect(joinNameProblem("Balcony", ["Cam 2"])).toBeNull()
})

test("a volunteer types the camera's name, taps Start, and the phone becomes that tally light", () => {
  const joined: any[] = []
  server.onServerEvent('tally.join', (...args: any[]) => joined.push(args))
  open()
  tallies({ name: "Cam 1", type: "udp", channelId: "1" })
  expect((screen.getByTestId("join-name") as HTMLInputElement).value).toBe("Phone 1")
  fireEvent.change(screen.getByTestId("join-name"), { target: { value: "Cam 1" } })
  expect(screen.getByTestId("join-start")).toBeDisabled()
  fireEvent.change(screen.getByTestId("join-name"), { target: { value: "Balcony" } })
  fireEvent.click(screen.getByTestId("join-start"))
  expect(joined).toEqual([["Balcony", undefined]])

  act(() => { server.emitServerEvent('tally.join.result', { name: "Balcony", ok: true }) })
  expect(location).toBe("/tally/web-Balcony")
  expect(window.localStorage.getItem("accTally.phoneName")).toBe("Balcony")
})

test("the hub refusing a name is said on the page", () => {
  open()
  tallies()
  fireEvent.click(screen.getByTestId("join-start"))
  act(() => { server.emitServerEvent('tally.join.result', { name: "Phone 1", ok: false, problem: "Something is already called \"Phone 1\"." }) })
  expect(screen.getByTestId("join-problem").textContent).toContain("already called")
})

test("a phone that joined before continues under its name with one tap", () => {
  const joined: any[] = []
  server.onServerEvent('tally.join', (...args: any[]) => joined.push(args))
  window.localStorage.setItem("accTally.phoneName", "Balcony")
  open()
  tallies({ name: "Balcony", type: "web", channelId: "2", connectedClients: [] })
  expect(screen.getByTestId("join-continue").textContent).toContain("Continue as Balcony")
  fireEvent.click(screen.getByTestId("join-continue"))
  expect(joined).toEqual([["Balcony", undefined]])
  // or start over under another name
  fireEvent.click(screen.getByTestId("join-other"))
  expect(screen.getByTestId("join-name")).toBeInTheDocument()
})

test("a phone that cannot reach the hub is told to check the Wi-Fi", () => {
  jest.useFakeTimers()
  try {
    server.connected = false
    open()
    expect(screen.queryByTestId("join-unreachable")).toBeNull()
    act(() => { jest.advanceTimersByTime(6500) })
    expect(screen.getByTestId("join-unreachable").textContent).toContain("church Wi-Fi")
  } finally {
    jest.useRealTimers()
  }
})
