import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BuildLightPage from './BuildLightPage'
import { socket } from '../hooks/useSocket'

const server = socket as any
const openPage = () => render(<MemoryRouter><BuildLightPage /></MemoryRouter>)
// the hub: it answers every page that asks for the install, and tells every page when it changes
let job: any = null
beforeEach(() => { job = null })
const hubAnswers = () => server.onServerEvent('flasher.firmware.job.get', () => server.emitServerEvent('flasher.firmware.job', job))
const hub = (event: string, data: any) => act(() => { if (event === 'flasher.firmware.job') job = data; server.emitServerEvent(event, data) })
const running = { path: "COM6", running: true, firstStart: false, progress: { phase: "erasing", percent: 4 } }
const finished = { ...running, running: false, firstStart: true, progress: { phase: "done", percent: 100, written: true, restart: "restarted" } }
const kind = () => screen.getByTestId("profile-operator-kind").querySelector("select")
const ticked = () => screen.getByTestId("wiring-checked").querySelector("input")
// "Plug it in": the step that holds the board panel (the step before it may still be folding away)
const plugItIn = () => within(screen.getByTestId("device-panel").closest(".MuiStepContent-root") as HTMLElement)

afterEach(() => { server.cleanUp(); window.sessionStorage.clear() })

test("a page reloaded during an install goes back to Plug it in, with step 1's choices as they were", () => {
  const before = openPage()
  fireEvent.change(kind(), { target: { value: "ws2812" } })
  fireEvent.click(ticked())
  before.unmount() // F5
  hubAnswers()
  openPage()
  hub('flasher.firmware.job', running)
  expect(screen.getByTestId("device-install-running")).toBeInTheDocument()
  fireEvent.click(plugItIn().getByTestId("build-back"))
  expect(kind()).toHaveValue("ws2812")
  expect(ticked()).toBeChecked()
})

test("Plug it in does not go on to the wiring test while step 1 is not ticked, and says why", () => {
  hubAnswers()
  openPage()
  hub('flasher.firmware.job', running) // a window opened during the install starts at Plug it in
  hub('flasher.firmware.job', finished)
  hub('flasher.device', { path: "COM6", nodeMcuVersion: "3.0.0", update: "up-to-date", serialPorts: [] })
  expect(screen.getByTestId("build-step1-unchecked").textContent).toContain("press Back")
  expect(plugItIn().getByTestId("build-next")).toBeDisabled()
})

test("Hide, Back to step 1, the install ends, Next: Plug it in shows the board after the install, not the advice from before", async () => {
  hubAnswers()
  const asked: any[] = []
  server.onServerEvent('flasher.device.get', (options: any) => asked.push(options))
  openPage()
  fireEvent.click(ticked())
  fireEvent.click(screen.getByTestId("build-next"))
  hub('flasher.device', { path: "COM6", boardState: "otherFirmware", firmwareAvailable: true, serialPorts: [] })
  fireEvent.click(plugItIn().getByTestId("device-firmware"))
  hub('flasher.firmware.job', running)
  fireEvent.click(screen.getByTestId("firmware-hide"))
  fireEvent.click(plugItIn().getByTestId("build-back"))
  await waitFor(() => expect(screen.queryByTestId("device-panel")).toBeNull()) // the step folded away
  hub('flasher.firmware.job', finished) // while step 1 shows
  expect(asked).toHaveLength(2) // the page asked the hub again, for the board's first start
  const step1 = within(ticked().closest(".MuiStepContent-root") as HTMLElement)
  fireEvent.click(step1.getByTestId("build-next"))
  expect(plugItIn().queryByTestId("device-firmware")).toBeNull()
  expect(plugItIn().getByTestId("device-first-start")).toBeInTheDocument()
})
