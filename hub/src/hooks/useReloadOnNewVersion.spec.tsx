import React from 'react'
import '@testing-library/jest-dom'
import { act, render } from '@testing-library/react'
import { useReloadOnNewVersion } from './useReloadOnNewVersion'
import { socket, socketEventEmitter } from './useSocket'

const server = socket as any
afterEach(() => { server.cleanUp() })

const hubInfo = (version?: string) => ({ hostname: "BOOTH", addresses: ["192.168.1.5"], tallyPort: 7411, version })

test("a page reloads once the hub it talks to runs another version, and not before", () => {
  const reloads: number[] = []
  const reload = () => reloads.push(1)
  function Page() { useReloadOnNewVersion(reload); return null }
  render(<Page />)

  // the version the page was loaded with, said again on every reconnect: nothing to do
  act(() => { server.emitServerEvent('hub.info', hubInfo("0.9.34")) })
  act(() => { server.emitServerEvent('hub.info', hubInfo("0.9.34")) })
  // a hub that does not say its version (development) changes nothing either
  act(() => { server.emitServerEvent('hub.info', hubInfo(undefined)) })
  expect(reloads).toEqual([])

  act(() => { server.emitServerEvent('hub.info', hubInfo("0.9.35")) })
  expect(reloads).toEqual([1])
})

test("after a reconnect, the page asks the hub about itself again", () => {
  const asked: number[] = []
  server.onServerEvent('hub.info.get', () => asked.push(1))
  function Page() { useReloadOnNewVersion(() => {}); return null }
  render(<Page />)
  expect(asked).toEqual([1])
  act(() => { socketEventEmitter.emit("connected") })
  expect(asked).toEqual([1, 1])
})
