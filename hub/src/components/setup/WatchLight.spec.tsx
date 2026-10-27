import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import WatchLight from './WatchLight'
import { socket } from '../../hooks/useSocket'

const server = socket as any

afterEach(() => server.cleanUp())

test("without a light plugged in there is nothing to watch", () => {
  render(<WatchLight />)
  expect(screen.queryByTestId("watch-light")).toBeNull()
})

test("starts the watch for the plugged-in light, shows what it prints, and offers to stop", () => {
  const started: string[] = []
  server.onServerEvent('flasher.light.watch.start', (path: string) => started.push(path))
  render(<WatchLight path="COM6" />)
  expect(screen.queryByTestId("watch-light-output")).toBeNull()
  fireEvent.click(screen.getByTestId("watch-light-start"))
  expect(started).toEqual(["COM6"])
  expect(screen.getByTestId("watch-light-output").textContent).toContain("Nothing yet")
  act(() => server.emitServerEvent('flasher.light.watch.text', "[INFO]  booted because of POWER_ON, 29032"))
  act(() => server.emitServerEvent('flasher.light.watch.text', " bytes of memory free\r\n"))
  expect(screen.getByTestId("watch-light-output").textContent).toBe("[INFO]  booted because of POWER_ON, 29032 bytes of memory free\r\n")
  const stopped: number[] = []
  server.onServerEvent('flasher.light.watch.stop', () => stopped.push(1))
  fireEvent.click(screen.getByTestId("watch-light-stop"))
  expect(stopped).toHaveLength(1)
  // the hub says the watch ended: what was printed stays, the watch can be started again
  act(() => server.emitServerEvent('flasher.light.watch.end'))
  expect(screen.getByTestId("watch-light-start")).toBeInTheDocument()
  expect(screen.getByTestId("watch-light-output").textContent).toContain("POWER_ON")
})

test("leaving the step stops a running watch, and only then", () => {
  const stopped: number[] = []
  server.onServerEvent('flasher.light.watch.stop', () => stopped.push(1))
  const idle = render(<WatchLight path="COM6" />)
  idle.unmount()
  expect(stopped).toHaveLength(0)
  const running = render(<WatchLight path="COM6" />)
  fireEvent.click(screen.getByTestId("watch-light-start"))
  running.unmount()
  expect(stopped).toHaveLength(1)
})
