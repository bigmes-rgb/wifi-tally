import { pageClosedLine, pageOpenedLine, pagePath } from './PageLog'
import { SocketAwareEvent } from './SocketAwareEvent'
import ServerEventEmitter from './ServerEventEmitter'

test("a page is named by its path, without the address or the query", () => {
  expect(pagePath("http://localhost:3000/setup/light?x=1")).toBe("/setup/light")
  expect(pagePath(undefined)).toBe("?")
  expect(pagePath("not an address")).toBe("?")
})

test("opening and closing a page is one line each, and a running install is said to carry on", () => {
  expect(pageOpenedLine("/setup/light", 2)).toBe("[page] opened /setup/light (2 open)")
  const job = { path: "COM6", running: true, progress: { phase: "restarting" as const, percent: 97 }, firstStart: false }
  expect(pageClosedLine("/setup/light", 95000, "transport close", job)).toBe("[page] closed /setup/light after 1 min 35 s (transport close); the firmware install on COM6 carries on")
  expect(pageClosedLine("/", 4000)).toBe("[page] closed / after 4 s")
})

test("passing events to a page writes nothing to the log (it was a third of the operator's log)", () => {
  const debug = jest.spyOn(console, "debug").mockImplementation(() => {})
  try {
    const socket: any = { id: "abc", on: () => socket }
    const event = new SocketAwareEvent(new ServerEventEmitter(), 'tally.changed', socket, () => {})
    event.register()
    event.unregister()
    expect(debug).not.toHaveBeenCalled()
  } finally {
    debug.mockRestore()
  }
})
