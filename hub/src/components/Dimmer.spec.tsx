import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import Dimmer from './Dimmer'
import { socket } from '../hooks/useSocket'

const server = socket as any

beforeEach(() => { jest.useFakeTimers() })
afterEach(() => { server.cleanUp(); jest.useRealTimers() })

test("shows the hub's brightness, turns amber when dimmed, and sends a change once the slider rests", () => {
  const sent: number[] = []
  server.onServerEvent('config.change.dimmer', (v: number) => sent.push(v))
  render(<Dimmer />)
  act(() => { server.emitServerEvent('config.state.dimmer', 100) })
  const button = screen.getByTestId("dimmer")
  expect(button.textContent).toContain("100%")
  expect(button.getAttribute("data-dimmed")).toBe("false")

  fireEvent.click(button)
  const full = screen.getByTestId("dimmer-full")
  expect(full).toBeDisabled()

  // the hub says the lights are dimmed: the button says so too
  act(() => { server.emitServerEvent('config.state.dimmer', 40) })
  expect(screen.getByTestId("dimmer").textContent).toContain("40%")
  expect(screen.getByTestId("dimmer").getAttribute("data-dimmed")).toBe("true")
  expect(screen.getByTestId("dimmer-full")).not.toBeDisabled()

  // back to full: sent after the short rest, once
  fireEvent.click(screen.getByTestId("dimmer-full"))
  expect(screen.getByTestId("dimmer").textContent).toContain("100%")
  expect(sent).toEqual([])
  act(() => { jest.advanceTimersByTime(200) })
  expect(sent).toEqual([100])
})
