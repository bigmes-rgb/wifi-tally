import React from 'react'
import '@testing-library/jest-dom'
import { act, render, screen } from '@testing-library/react'
import useTallyDevice from './useTallyDevice'
import { socket } from './useSocket'

const server = socket as any
const Probe = ({ refresh, path, newBoard }: { refresh: number, path?: string, newBoard?: boolean }) => {
  const device = useTallyDevice(refresh, path, newBoard)
  return <div data-testid="probe">{device ? device.path : "checking"}</div>
}
const job = (fields: any = {}) => ({ path: "COM6", running: true, firstStart: false, progress: { phase: "writing", percent: 40 }, ...fields })
const done = job({ running: false, firstStart: true, progress: { phase: "done", percent: 100, written: true, restart: "restarted" } })
const hub = (event: string, data: any) => act(() => { server.emitServerEvent(event, data) })
const asking = () => {
  const asked: any[] = []
  server.onServerEvent('flasher.device.get', (options: any) => asked.push(options))
  return asked
}
afterEach(() => server.cleanUp())

test("\"Check the other board\" tells the hub that another board is plugged in", () => {
  const asked = asking()
  const { rerender } = render(<Probe refresh={1} />)
  rerender(<Probe refresh={2} newBoard />)
  rerender(<Probe refresh={3} path="COM5" />)
  expect(asked).toEqual([undefined, { path: undefined, newBoard: true }, { path: "COM5", newBoard: undefined }])
})

test("after an install, whoever shows the board from before it asks again, once, and not as another board", () => {
  const asked = asking()
  render(<Probe refresh={1} newBoard />)
  hub('flasher.device', { path: "COM6", serialPorts: [] })
  hub('flasher.firmware.job', job())
  hub('flasher.firmware.job', done)
  hub('flasher.firmware.job', done) // the same news again (another page asked for it)
  expect(asked).toEqual([{ path: undefined, newBoard: true }, undefined])
  expect(screen.getByTestId("probe").textContent).toBe("checking")
})

test("a page whose check waits behind the install does not ask again: that check brings the board", () => {
  const asked = asking()
  render(<Probe refresh={1} />)
  hub('flasher.firmware.job', job())
  hub('flasher.firmware.job', done)
  expect(asked).toEqual([undefined])
})

test("an install that failed is no reason to look at the board again", () => {
  const asked = asking()
  render(<Probe refresh={1} />)
  hub('flasher.device', { path: "COM6", serialPorts: [] })
  hub('flasher.firmware.job', job())
  hub('flasher.firmware.job', job({ running: false, progress: { phase: "error", percent: 0 } }))
  expect(asked).toEqual([undefined])
})
