import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import AppUpdateNotice, { RESTART_GIVE_UP_MS } from './AppUpdateNotice'
import { socket } from '../hooks/useSocket'

const server = socket as any
afterEach(() => { server.cleanUp() })

test("says nothing until a version is downloaded; then the operator restarts, or puts it off", () => {
  const asked: number[] = []
  server.onServerEvent('app.update.install', () => asked.push(1))
  render(<AppUpdateNotice />)
  act(() => { server.emitServerEvent('app.update', { status: "downloading", current: "0.9.32", version: "0.9.33", percent: 40 }) })
  expect(screen.queryByTestId("app-update")).toBeNull()

  act(() => { server.emitServerEvent('app.update', { status: "ready", current: "0.9.32", version: "0.9.33" }) })
  expect(screen.getByTestId("app-update").textContent).toContain("ACC Tally 0.9.33 is ready to install")
  expect(screen.getByTestId("app-update").textContent).toContain("next time ACC Tally closes")
  fireEvent.click(screen.getByTestId("app-update-restart"))
  expect(asked).toEqual([1])
  expect(screen.getByTestId("app-update-restarting")).toBeInTheDocument()
})

test("Later hides it on this page", () => {
  render(<AppUpdateNotice />)
  act(() => { server.emitServerEvent('app.update', { status: "ready", current: "0.9.32", version: "0.9.33" }) })
  fireEvent.click(screen.getByTestId("app-update-later"))
  expect(screen.queryByTestId("app-update")).toBeNull()
})

test("in the dock: a small button that opens the same words", () => {
  const asked: number[] = []
  server.onServerEvent('app.update.install', () => asked.push(1))
  render(<AppUpdateNotice compact />)
  act(() => { server.emitServerEvent('app.update', { status: "unsupported" }) })
  expect(screen.queryByTestId("app-update-dock")).toBeNull()
  act(() => { server.emitServerEvent('app.update', { status: "ready", current: "0.9.32", version: "0.9.33" }) })
  fireEvent.click(screen.getByTestId("app-update-dock"))
  expect(screen.getByTestId("app-update-dialog").textContent).toContain("about 20 seconds")
  fireEvent.click(screen.getByTestId("app-update-restart"))
  expect(asked).toEqual([1])
})

test("what it said about one update does not carry over to the next, and a restart that never comes is said", () => {
  jest.useFakeTimers()
  try {
    render(<AppUpdateNotice />)
    act(() => { server.emitServerEvent('app.update', { status: "ready", current: "0.9.32", version: "0.9.33" }) })
    fireEvent.click(screen.getByTestId("app-update-restart"))
    expect(screen.getByTestId("app-update-restarting")).toBeInTheDocument()

    // the hub did not restart: after a while it says so, and the button works again
    act(() => { jest.advanceTimersByTime(RESTART_GIVE_UP_MS) })
    expect(screen.queryByTestId("app-update-restarting")).toBeNull()
    expect(screen.getByTestId("app-update-stuck").textContent).toContain("did not restart")
    expect(screen.getByTestId("app-update-restart")).not.toBeDisabled()

    // a newer version arrives: a fresh notice, nothing left over
    fireEvent.click(screen.getByTestId("app-update-restart"))
    act(() => { server.emitServerEvent('app.update', { status: "ready", current: "0.9.32", version: "0.9.34" }) })
    expect(screen.getByTestId("app-update").textContent).toContain("0.9.34")
    expect(screen.queryByTestId("app-update-restarting")).toBeNull()
    expect(screen.queryByTestId("app-update-stuck")).toBeNull()
    expect(screen.getByTestId("app-update-restart")).not.toBeDisabled()
  } finally {
    jest.useRealTimers()
  }
})
