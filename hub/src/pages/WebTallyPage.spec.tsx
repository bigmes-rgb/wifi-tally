import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route } from 'react-router-dom'
import WebTallyPage from './WebTallyPage'
import { socket } from '../hooks/useSocket'

const server = socket as any
let location = ""
const open = (name: string) => render(<MemoryRouter initialEntries={[`/tally/web-${name}`]}>
  <Route exact path="/tally/:tallyId"><WebTallyPage /></Route>
  <Route path="*" render={({ location: l }) => { location = l.pathname; return null }} />
</MemoryRouter>)
const state = (name: string, command: string, channelId?: string) => act(() => {
  server.emitServerEvent('channel.state', { channels: [{ id: "1", name: "Wide" }, { id: "2" }] })
  server.emitServerEvent('webTally.state', { tally: { name, type: "web", channelId, connectedClients: [{ address: "1.2.3.4" }] }, command })
})

beforeEach(() => { server.connected = true; window.localStorage.clear() })
afterEach(() => { server.cleanUp(); server.connected = false })

test("the phone shows its name, its camera's input, and the state in plain words", () => {
  open("Balcony")
  state("Balcony", "on-air", "1")
  expect(screen.getByTestId("page-tally-web").getAttribute("data-color")).toBe("program")
  expect(screen.getByTestId("tally-web-name").textContent).toBe("Balcony")
  expect(screen.getByTestId("tally-web-input").textContent).toBe("Wide")
  expect(screen.getByTestId("tally-web-state").textContent).toBe("On air")
  state("Balcony", "preview", "1")
  expect(screen.getByTestId("tally-web-state").textContent).toBe("Next")
  // no input yet: it says who sets it
  state("Balcony", "release")
  expect(screen.queryByTestId("tally-web-input")).toBeNull()
  expect(screen.getByTestId("tally-web-state").textContent).toContain("director to pick your input")
})

test("after a reload it offers a tap to keep the screen on, and the tap takes it", () => {
  open("Balcony")
  state("Balcony", "release", "2")
  expect(screen.getByTestId("tally-web-wake")).toBeInTheDocument()
  fireEvent.click(screen.getByTestId("page-tally-web"))
  expect(screen.queryByTestId("tally-web-wake")).toBeNull()
})

test("renamed by the director, the phone follows to its new name and remembers it", () => {
  window.localStorage.setItem("accTally.phoneName", "Phone 1")
  open("Phone 1")
  state("Phone 1", "release", "2")
  act(() => { server.emitServerEvent('webTally.renamed', { from: "Phone 1", to: "Balcony" }) })
  expect(location).toBe("/tally/web-Balcony")
  expect(window.localStorage.getItem("accTally.phoneName")).toBe("Balcony")
})

test("removed by the director, the phone says so and offers to join again", () => {
  window.localStorage.setItem("accTally.phoneName", "Phone 1")
  open("Phone 1")
  state("Phone 1", "release")
  act(() => { server.emitServerEvent('webTally.invalid', "Phone 1") })
  expect(screen.getByTestId("page-tally-web-gone").textContent).toContain("not a tally light any more")
  fireEvent.click(screen.getByTestId("tally-web-rejoin"))
  expect(location).toBe("/join")
  expect(window.localStorage.getItem("accTally.phoneName")).toBeNull()
})
