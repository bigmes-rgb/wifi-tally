import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import UpdateLights, { ANSWER_MS, COME_BACK_MS, wording } from './UpdateLights'
import { socket } from '../hooks/useSocket'
import { ConnectionState, UdpTally } from '../domain/Tally'

const server = socket as any

const light = (name: string, program?: string, state = ConnectionState.CONNECTED) =>
  ({ name, type: "udp", channelId: "1", address: "192.168.1.20", port: 7411, state, program })
const hubHas = (programStamp?: string) => act(() => { server.emitServerEvent('hub.info', { hostname: "BOOTH", addresses: ["192.168.1.5"], tallyPort: 7411, programStamp }) })
const lights = (...tallies: any[]) => act(() => { server.emitServerEvent('tally.state', { tallies }) })

afterEach(() => server.cleanUp())

test("shows nothing while every light runs the hub's program, or the hub has none to give", () => {
  render(<UpdateLights />)
  lights(light("Cam 1", "abc"), light("Cam 2", "abc"))
  hubHas("abc")
  expect(screen.queryByTestId("update-lights")).toBeNull()
  lights(light("Cam 1", "old"))
  hubHas(undefined)
  expect(screen.queryByTestId("update-lights")).toBeNull()
})

test("offers the update to lights on an older build, sends it, and shows each light's answer", () => {
  const sent: number[] = []
  server.onServerEvent('tallies.update.send', () => sent.push(1))
  render(<UpdateLights />)
  hubHas("abc")
  lights(light("Cam 1", "old"), light("Cam 2", "files"), light("Cam 3", "abc"), light("Cam 4", "old", ConnectionState.DISCONNECTED))
  const panel = screen.getByTestId("update-lights")
  expect(panel.textContent).toContain("Newer light program available")
  expect(screen.getByTestId("update-lights-behind").textContent).toBe("Cam 1Cam 2")
  expect(screen.getByTestId("update-lights-send").textContent).toContain("Update 2 lights")
  fireEvent.click(screen.getByTestId("update-lights-send"))
  expect(sent).toHaveLength(1)
  act(() => { server.emitServerEvent('tallies.update.sent', { sentTo: ["Cam 1", "Cam 2"], needUsb: [] }) })
  expect(screen.getByTestId("update-light-Cam 1").textContent).toContain("waiting")
  expect(screen.getByTestId("update-light-Cam 1").getAttribute("data-mark")).toBe("busy")
  expect(screen.getByTestId("update-lights-send")).toBeDisabled()
  act(() => { server.emitServerEvent('tallies.update.answer', { tallyName: "Cam 1", stamp: "abc", outcome: "saved" }) })
  act(() => { server.emitServerEvent('tallies.update.answer', { tallyName: "Cam 2", stamp: "abc", outcome: "failed" }) })
  expect(screen.getByTestId("update-light-Cam 1").textContent).toContain("restarting")
  expect(screen.getByTestId("update-light-Cam 2").textContent).toContain("could not fetch")
  expect(screen.getByTestId("update-light-Cam 2").getAttribute("data-mark")).toBe("bad")
  expect(screen.getByTestId("update-lights-send")).not.toBeDisabled()
  // Cam 1 comes back on the new build: it is no longer behind, and its line says it is done
  lights(light("Cam 1", "abc"), light("Cam 2", "files"))
  expect(screen.getByTestId("update-lights-send").textContent).toContain("Update 1 light")
  expect(screen.getByTestId("update-light-Cam 1").textContent).toContain("done, back on the new program")
  expect(screen.getByTestId("update-light-Cam 1").getAttribute("data-mark")).toBe("ok")
})

test("tells which lights must come to the computer once", () => {
  render(<UpdateLights />)
  hubHas("abc")
  lights(light("Cam 1", "abc"), light("Old one"))
  // no "all good" banner: only the one note that asks for something
  expect(screen.queryByTestId("update-lights")).toBeNull()
  const usb = screen.getByTestId("update-lights-usb")
  expect(usb.textContent).toContain("1 light needs a USB install once")
  expect(usb.textContent).toContain("Old one")
  expect(usb.textContent).toContain("Install now")
})

describe("what each light's line says as time passes", () => {
  const back = (program: string | undefined, state = ConnectionState.CONNECTED) => {
    const t = new UdpTally("Cam 1", "1", "192.168.1.20", 7411, state)
    t.program = program
    return t
  }
  test("a light that never answers, and one that never comes back, are said so", () => {
    expect(wording("sent", 5000, back("old"), "abc")).toEqual({ mark: "busy", text: expect.stringContaining("waiting") })
    expect(wording("sent", ANSWER_MS + 1, back("old"), "abc")).toEqual({ mark: "bad", text: expect.stringContaining("did not answer") })
    expect(wording("saved", 5000, back("old", ConnectionState.DISCONNECTED), "abc")).toEqual({ mark: "busy", text: expect.stringContaining("restarting") })
    expect(wording("saved", COME_BACK_MS + 1, back("old", ConnectionState.DISCONNECTED), "abc")).toEqual({ mark: "bad", text: expect.stringContaining("has not come back") })
    expect(wording("saved", COME_BACK_MS + 1, undefined, "abc").text).toContain("has not come back")
  })
  test("a light back on the new program is done; one back on its files says the flash did not take it", () => {
    expect(wording("saved", COME_BACK_MS + 1, back("abc"), "abc")).toEqual({ mark: "ok", text: expect.stringContaining("done, back on the new program") })
    expect(wording("saved", 5000, back("files"), "abc")).toEqual({ mark: "bad", text: expect.stringContaining("flash did not take") })
    expect(wording("done", 0, back("abc"), "abc").mark).toBe("ok")
    expect(wording("failed", 0, back("old"), "abc")).toEqual({ mark: "bad", text: expect.stringContaining("could not fetch") })
  })
})
