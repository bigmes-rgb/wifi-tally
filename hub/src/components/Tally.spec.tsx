import React from 'react'
import '@testing-library/jest-dom'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TallyComponent from './Tally'
import { ConnectionState, UdpTally } from '../domain/Tally'
import { socket } from '../hooks/useSocket'

const server = socket as any

afterEach(() => server.cleanUp())

test("the card header names the light and the input it stands for", () => {
  const onWide = new UdpTally("Cam 1", "1", "192.168.1.20", 7411, ConnectionState.CONNECTED)
  const onTwo = new UdpTally("Cam 2", "2", "192.168.1.21", 7411, ConnectionState.CONNECTED)
  const spare = new UdpTally("Spare", undefined, "192.168.1.22", 7411, ConnectionState.CONNECTED)
  render(<MemoryRouter><TallyComponent tally={onWide} /><TallyComponent tally={onTwo} /><TallyComponent tally={spare} /></MemoryRouter>)
  act(() => { server.emitServerEvent('channel.state', { channels: [{ id: "1", name: "Wide" }, { id: "2" }] }) })
  expect(screen.getByTestId("tally-Cam 1-input").textContent).toBe("Wide")
  expect(screen.getByTestId("tally-Cam 2-input").textContent).toBe("Channel 2")
  expect(screen.getByTestId("tally-Spare-input").textContent).toBe("No input")
})
