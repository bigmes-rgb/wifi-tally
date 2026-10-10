/**
 * @jest-environment node
 */
import { EventEmitter } from 'events'
import { classifyBoardOutput, hasPrompt, listenToBoard, printable } from './BoardListener'

// a serial port that prints what the test scripts, and records what the hub writes
const fakePort = (script: (port: any) => void, failOpen = false) => {
  const port: any = new EventEmitter()
  port.isOpen = false
  port.written = [] as string[]
  port.open = (cb: (err?: Error) => void) => { if (failOpen) return cb(new Error("Access denied")); port.isOpen = true; cb(); script(port) }
  port.close = (cb: () => void) => { port.isOpen = false; cb() }
  port.write = (data: Buffer, cb: () => void) => { port.written.push(data.toString()); cb() }
  return port
}
const say = (port: any, text: string | Buffer, after = 0) => setTimeout(() => port.emit('data', Buffer.isBuffer(text) ? text : Buffer.from(text)), after)

test("it stops as soon as the Lua prompt comes back, and pokes with a newline", async () => {
  const port = fakePort(p => say(p, "\r\n> ", 20))
  const heard = await listenToBoard({ path: "COM5", ms: 5000, openPort: () => port })
  expect(heard.sawPrompt).toBe(true)
  expect(port.written[0]).toBe("\r\n")
  expect(port.isOpen).toBe(false)
})

test("it listens for the whole time when no prompt comes, and closes the port", async () => {
  const port = fakePort(p => say(p, "Formatting file system. Please wait...\r\n", 10))
  const started = Date.now()
  const heard = await listenToBoard({ path: "COM5", ms: 300, openPort: () => port })
  expect(Date.now() - started).toBeGreaterThanOrEqual(290)
  expect(heard.sawPrompt).toBe(false)
  expect(classifyBoardOutput(heard)).toBe("formatting")
  expect(port.isOpen).toBe(false)
})

test("a port that cannot be opened reads as a silent board instead of failing", async () => {
  const heard = await listenToBoard({ path: "COM5", ms: 300, openPort: () => fakePort(() => {}, true) })
  expect(heard.bytes).toBe(0)
  expect(classifyBoardOutput(heard)).toBe("silent")
})

describe("classifyBoardOutput()", () => {
  const heard = (text: string) => ({ text, sawPrompt: hasPrompt(text), bytes: text.length })
  test.each([
    ["NodeMCU 3.0.0.0 built with Docker\r\n> ", "ready"],
    ["Formatting file system. Please wait...\r\n", "formatting"],
    ["NodeMCU 3.0.0.0 built with Docker\r\n", "busy"],
    ["Fatal exception 28(LoadProhibitedCause):\r\nepc1=0x4000df64", "crashing"],
    ["NodeMCU 3.0.0.0\r\n·NodeMCU 3.0.0.0\r\n·", "crashing"],
    ["··ready\r\n", "otherFirmware"],
    ["", "silent"],
  ])("%j is %s", (text, state) => {
    expect(classifyBoardOutput(heard(text))).toBe(state)
  })
  test("unreadable bytes are shown as one dot per run", () => {
    expect(printable(Buffer.from([0x80, 0x81, 0x41, 0xff, 0x42]))).toBe("·A·B")
  })
  test("a '>' inside text is not a prompt", () => {
    expect(hasPrompt("a > b\r\n")).toBe(false)
  })
})
