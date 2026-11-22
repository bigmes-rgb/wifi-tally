import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { AddPhoneDialog, joinUrl } from './AddPhone'
import { socket } from '../hooks/useSocket'

const server = socket as any
afterEach(() => { server.cleanUp() })

const hubSays = (addresses: string[]) => act(() => {
  server.emitServerEvent('hub.info', { hostname: "BOOTH", addresses, tallyPort: 7411, version: "0.9.36" })
})
const tallies = (...list: any[]) => act(() => { server.emitServerEvent('tally.state', { tallies: list }) })
const phone = (name: string, channelId?: string) => ({ name, type: "web", channelId, connectedClients: [{ address: "192.168.1.40" }] })

test("the code takes a phone to this hub's address on the church network, never to localhost", () => {
  expect(joinUrl("192.168.1.5", "3000")).toBe("http://192.168.1.5:3000/join")
  expect(joinUrl("192.168.1.5", "")).toBe("http://192.168.1.5/join")
  expect(joinUrl("192.168.1.5", "80")).toBe("http://192.168.1.5/join")
})

test("the dialog shows the code, lets the director pick another address, and lists the phones that join", () => {
  render(<AddPhoneDialog open onClose={() => {}} />)
  hubSays(["192.168.1.5", "10.0.0.7"])
  tallies(phone("Cam 1", "1"))
  expect(screen.getByTestId("add-phone-qr").getAttribute("data-text")).toBe("http://192.168.1.5/join")
  expect(screen.getByTestId("add-phone-joined").textContent).toContain("Waiting for a phone to join")

  fireEvent.click(screen.getByTestId("add-phone-address-10.0.0.7"))
  expect(screen.getByTestId("add-phone-url").textContent).toBe("http://10.0.0.7/join")

  // a phone that was there before is not news; a new one is, with what to do next
  tallies(phone("Cam 1", "1"), phone("Balcony"))
  expect(screen.queryByTestId("add-phone-joined-Cam 1")).toBeNull()
  expect(screen.getByTestId("add-phone-joined-Balcony").textContent).toContain("Pick its input")
})

test("a hub on no network says so instead of showing a code no phone could use", () => {
  render(<AddPhoneDialog open onClose={() => {}} />)
  hubSays([])
  expect(screen.queryByTestId("add-phone-qr")).toBeNull()
  expect(screen.getByTestId("add-phone-no-network")).toBeInTheDocument()
})
