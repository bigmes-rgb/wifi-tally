import React from 'react'
import '@testing-library/jest-dom'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import IndexPage from './IndexPage'
import { socket } from '../hooks/useSocket'

const server = socket as any

beforeEach(() => { server.connected = true })
afterEach(() => { server.cleanUp(); server.connected = false })

test("warns in red when another vTally hub is heard on the network, naming the computer", () => {
  const asked: number[] = []
  server.onServerEvent('hub.others.get', () => asked.push(1))
  render(<MemoryRouter><IndexPage /></MemoryRouter>)
  expect(asked).toHaveLength(1)
  expect(screen.queryByTestId("other-hubs")).toBeNull()
  act(() => { server.emitServerEvent('hub.others', [{ address: "192.168.1.5", hostname: "BOOTH-PC" }]) })
  const warning = screen.getByTestId("other-hubs")
  expect(warning.textContent).toContain("Another vTally is running on BOOTH-PC (192.168.1.5)")
  expect(warning.textContent).toContain("goes missing on the other")
  act(() => { server.emitServerEvent('hub.others', []) })
  expect(screen.queryByTestId("other-hubs")).toBeNull()
})
