import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { AppVersion, DockVersion } from './AppVersion'
import { socket } from '../hooks/useSocket'

const server = socket as any
afterEach(() => { server.cleanUp() })

test("the header says which version runs and where its update stands; a click can look for a new one", () => {
  const checks: number[] = []
  server.onServerEvent('app.update.check', () => checks.push(1))
  render(<AppVersion />)
  act(() => { server.emitServerEvent('app.update', { status: "current", current: "0.9.35" }) })
  expect(screen.getByTestId("app-version").textContent).toBe("v0.9.35")
  expect(screen.getByTestId("app-version-dot").getAttribute("data-mark")).toBe("ok")

  fireEvent.click(screen.getByTestId("app-version"))
  expect(screen.getByTestId("app-version-details").textContent).toContain("Up to date")
  fireEvent.click(screen.getByTestId("app-version-check"))
  expect(checks).toEqual([1])
  // once asked, the button waits rather than asking again and again
  expect(screen.getByTestId("app-version-check")).toBeDisabled()

  act(() => { server.emitServerEvent('app.update', { status: "ready", current: "0.9.35", version: "0.9.36" }) })
  expect(screen.getByTestId("app-version-dot").getAttribute("data-mark")).toBe("ready")
  // a blue dot on the blue header is easy to miss: the words say it too
  expect(screen.getByTestId("app-version").textContent).toBe("v0.9.35 · update ready")
  expect(screen.getByTestId("app-version-details").textContent).toContain("0.9.36 is ready to install")
  expect(screen.getByTestId("app-version-restart")).toBeInTheDocument()
})

test("a copy that does not update itself still says its version, from the hub", () => {
  render(<AppVersion />)
  act(() => {
    server.emitServerEvent('app.update', { status: "unsupported" })
    server.emitServerEvent('hub.info', { hostname: "BOOTH", addresses: [], tallyPort: 7411, version: "0.9.35" })
  })
  expect(screen.getByTestId("app-version").textContent).toBe("v0.9.35")
  expect(screen.queryByTestId("app-version-dot")).toBeNull()
})

test("the dock shows the version small", () => {
  render(<DockVersion />)
  act(() => { server.emitServerEvent('app.update', { status: "current", current: "0.9.35" }) })
  expect(screen.getByTestId("dock-version").textContent).toBe("v0.9.35")
})
