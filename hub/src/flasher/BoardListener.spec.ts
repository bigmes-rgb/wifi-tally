/**
 * @jest-environment node
 */
import { EventEmitter } from 'events'
import { classifyBoardOutput, hasPrompt, hubAddressesIn, listenToBoard, logEveryPortClose, portCameBack, printable, streamFromBoard } from './BoardListener'

// the real node-serialport stream, on its own pretend binding that remembers how the port was opened and what
// the lines were set to: the option names below are node-serialport 8's, not ones from memory
jest.mock('serialport', () => {
  const SerialPort = jest.requireActual('@serialport/stream')
  const MockBinding = jest.requireActual('@serialport/binding-mock')
  class RecordingBinding extends MockBinding {
    static opened: any[] = []
    static lines: any[] = []
    async open(path: string, options: any) { RecordingBinding.opened.push(options); return super.open(path, options) }
    async set(flags: any) { RecordingBinding.lines.push(flags); return super.set(flags) }
  }
  SerialPort.Binding = RecordingBinding
  return SerialPort
})

// a serial port that prints what the test scripts, and records what the hub writes
const fakePort = (script: (port: any) => void, failOpen = false) => {
  const port: any = new EventEmitter()
  port.isOpen = false
  port.written = [] as string[]
  port.lines = [] as any[]
  port.open = (cb: (err?: Error) => void) => { if (failOpen) return cb(new Error("Access denied")); port.isOpen = true; cb(); script(port) }
  port.close = (cb: () => void) => { port.isOpen = false; port.emit('close', null); cb() }
  port.write = (data: Buffer, cb: () => void) => { port.written.push(data.toString()); cb() }
  port.set = (flags: any, cb: () => void) => { port.lines.push(flags); cb() }
  // what node-serialport 8 does when a read fails because the board was unplugged
  port.unplug = () => { port.isOpen = false; port.emit('close', Object.assign(new Error("Reading from COM5 failed"), { disconnected: true })) }
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
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
  const heard = await listenToBoard({ path: "COM5", ms: 300, openPort: () => fakePort(() => {}, true) })
  warn.mockRestore()
  expect(heard.bytes).toBe(0)
  expect(heard.closed).toBe(true)
  expect(classifyBoardOutput(heard)).toBe("silent")
})

describe("a port opened only to listen leaves the reset and FLASH lines alone", () => {
  // On NodeMCU's auto-reset circuit DTR on with RTS off holds GPIO0 low: pressing RST then starts flashing mode.
  test("node-serialport opens it with hupcl off, and both lines are switched off once it is open", async () => {
    const MockBinding = require('@serialport/binding-mock')
    MockBinding.createPort("/dev/BOARD", { readyData: "" })
    await listenToBoard({ path: "/dev/BOARD", ms: 50 })
    const RecordingBinding = require('serialport').Binding
    expect(RecordingBinding.opened[0]).toMatchObject({ baudRate: 115200, hupcl: false })
    expect(RecordingBinding.lines[0]).toMatchObject({ dtr: false, rts: false })
  })
  test("listening switches DTR and RTS off before anything else", async () => {
    const port = fakePort(() => {})
    await listenToBoard({ path: "COM5", ms: 50, openPort: () => port })
    expect(port.lines).toEqual([{ dtr: false, rts: false }])
  })
  test("so does streaming, at either speed", async () => {
    for (const baudRate of [115200, 74880]) {
      const port = fakePort(() => {})
      await streamFromBoard({ path: "COM5", ms: 50, baudRate, onText: () => {}, openPort: () => port }).done
      expect(port.lines).toEqual([{ dtr: false, rts: false }])
    }
  })
})

describe("a port that goes away while the hub listens", () => {
  test("ends the listen at once, says the port closed, and the log says why", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const port = fakePort(p => { say(p, "NodeMCU 3.0.0.0 \r\n", 10); setTimeout(() => p.unplug(), 30) })
      const started = Date.now()
      const heard = await listenToBoard({ path: "COM5", ms: 5000, openPort: () => port })
      expect(Date.now() - started).toBeLessThan(1000)
      expect(heard).toMatchObject({ closed: true, sawPrompt: false })
      expect(heard.text).toContain("NodeMCU")
      expect(warn).toHaveBeenCalledWith("[serial COM5] port closed: Reading from COM5 failed (the board is gone: unplugged, or Windows dropped the port)")
    } finally {
      warn.mockRestore()
    }
  })
  test("a listen nobody waits for any more ends early and gives the port back", async () => {
    const port = fakePort(() => {})
    let wanted = true
    setTimeout(() => { wanted = false }, 100)
    const started = Date.now()
    const heard = await listenToBoard({ path: "COM5", ms: 5000, openPort: () => port, cancelled: () => !wanted })
    expect(Date.now() - started).toBeLessThan(1000)
    expect(port.isOpen).toBe(false)
    expect(heard.closed).toBeUndefined()
  })
  test("a listen that runs its time is not 'closed', although the hub closes the port afterwards", async () => {
    const heard = await listenToBoard({ path: "COM5", ms: 50, openPort: () => fakePort(() => {}) })
    expect(heard.closed).toBeUndefined()
  })
  test("ends a stream too", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const port = fakePort(p => setTimeout(() => p.unplug(), 20))
      const started = Date.now()
      await streamFromBoard({ path: "COM5", ms: 5000, onText: () => {}, openPort: () => port }).done
      expect(Date.now() - started).toBeLessThan(1000)
    } finally {
      warn.mockRestore()
    }
  })
})

test("a port that goes away under nodemcu-tool, which only listens for 'error', is logged with its reason too", async () => {
  const SerialPort = jest.requireActual('@serialport/stream')
  const MockBinding = jest.requireActual('@serialport/binding-mock')
  // what node-serialport's Windows binding does when the board is unplugged: the pending read fails
  class UnpluggedBinding extends MockBinding {
    async read() {
      await new Promise(resolve => setTimeout(resolve, 20))
      if (!this.isOpen) throw Object.assign(new Error("Read canceled"), { canceled: true })
      throw new Error("Reading from COM7 failed: The device does not recognize the command.")
    }
  }
  MockBinding.createPort("COM7", { echo: false, record: false })
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
  try {
    logEveryPortClose(SerialPort)
    logEveryPortClose(SerialPort) // installed once, however often it is called
    // opened the way nodemcu-tool opens it: an 'error' listener and a parser reading from it, nothing for 'close'
    const port = new SerialPort("COM7", { baudRate: 115200, autoOpen: false, binding: UnpluggedBinding })
    port.on('error', () => {})
    await new Promise(resolve => port.open(resolve))
    const closed = new Promise(resolve => port.once('close', resolve))
    port.on('data', () => {})
    await closed
    expect(warn.mock.calls.map(c => c[0])).toEqual(["[serial COM7] port closed: Reading from COM7 failed: The device does not recognize the command. (the board is gone: unplugged, or Windows dropped the port)"])
  } finally {
    warn.mockRestore()
  }
})

describe("classifyBoardOutput()", () => {
  const heard = (text: string) => ({ text, sawPrompt: hasPrompt(text), bytes: text.length })
  test.each([
    ["NodeMCU 3.0.0.0 built with Docker\r\n> ", "ready"],
    ["Formatting file system. Please wait...\r\n", "formatting"],
    ["NodeMCU 3.0.0.0 built with Docker\r\n", "busy"],
    ["Fatal exception 28(LoadProhibitedCause):\r\nepc1=0x4000df64", "crashing"],
    ["Soft WDT reset\r\n>>>stack>>>\r\nctx: cont\r\n", "crashing"],
    // NodeMCU's banner comes only once the firmware is up: two of them are restarts, not a broken install
    ["NodeMCU 3.0.0.0\r\n·NodeMCU 3.0.0.0\r\n·", "restarting"],
    ["NodeMCU 3.0.0.0 \r\nPANIC: unprotected error in call to Lua API (not enough memory)\r\n", "restarting"],
    ["NodeMCU 3.0.0.0 \r\nFatal exception 29(StoreProhibitedCause):\r\n", "restarting"],
    ["NodeMCU custom build by frightanic.com\r\n·NodeMCU custom build by frightanic.com\r\n", "restarting"],
    ["........\r\n.....", "formatting"],
    // a Lua PANIC is NodeMCU's own message, and NodeMCU restarts after it: caught without the banner it is still NodeMCU
    ["[INFO]  Connect to WiFi Home\r\nPANIC: unprotected error in call to Lua API (not enough memory)\r\n·ets Jan  8 2013,rst cause:2·", "restarting"],
    // restarting in the middle of setting up its storage starts that over on every start
    ["Formatting file system. Please wait...\r\n....·Formatting file system. Please wait...\r\n...", "restarting"],
    // unplugged and plugged back in during the listen: it starts formatting again, which is not a restart loop
    ["Formatting file system. Please wait...\r\n.." + portCameBack("COM5") + "Formatting file system. Please wait...\r\n", "formatting"],
    ["Formatting file system. Please wait...\r\n" + portCameBack("COM5") + "......", "formatting"],
    ["··ready\r\n", "otherFirmware"],
    ["[INFO]  Got IP 192.168.1.50\r\n[INFO]  Searching for hub by broadcast\r\n", "tallyBusy"],
    ["[INFO]  Found hub at 192.168.1.35\r\n[INFO]  Found hub at 192.168.1.6\r\n[INFO]  Found hub at 192.168.1.35\r\n", "twoHubs"],
    ["[INFO]  Found hub at 192.168.1.35\r\n[INFO]  Found hub at 192.168.1.35\r\n", "tallyBusy"],
    ["", "silent"],
  ])("%j is %s", (text, state) => {
    expect(classifyBoardOutput(heard(text))).toBe(state)
  })
  test("unreadable bytes are shown as one dot per run", () => {
    expect(printable(Buffer.from([0x80, 0x81, 0x41, 0xff, 0x42]))).toBe("·A·B")
  })
  test("hub addresses come out once each, in the order first heard", () => {
    expect(hubAddressesIn("[INFO]  Found hub at 192.168.1.35\r\n[INFO]  Found hub at 192.168.1.6\r\n[INFO]  Found hub at 192.168.1.35\r\n")).toEqual(["192.168.1.35", "192.168.1.6"])
    expect(hubAddressesIn("NodeMCU 3.0.0.0\r\n")).toEqual([])
  })
  test("a '>' inside text is not a prompt", () => {
    expect(hasPrompt("a > b\r\n")).toBe(false)
  })
})

test("streaming sends the restart first, passes text along live, and stops when told what to look for", async () => {
  const port = fakePort(p => { say(p, "[INFO]  Got IP 192.168.1.50\r\n", 10); say(p, "[INFO]  Found hub at 192.168.1.10\r\n", 30); say(p, "late line\r\n", 200) })
  const chunks: string[] = []
  const { done } = streamFromBoard({ path: "COM5", ms: 5000, writeFirst: "\r\nnode.restart()\r\n", onText: t => chunks.push(t), stopWhen: all => /Found hub/.test(all), openPort: () => port })
  const all = await done
  expect(port.written[0]).toBe("\r\nnode.restart()\r\n")
  expect(chunks.join("")).toContain("Got IP")
  expect(all).not.toContain("late line")
  expect(port.isOpen).toBe(false)
})

test("stop() ends a stream early", async () => {
  const port = fakePort(() => {})
  const s = streamFromBoard({ path: "COM5", ms: 5000, onText: () => {}, openPort: () => port })
  setTimeout(() => s.stop(), 20)
  await s.done
  expect(port.isOpen).toBe(false)
})

test("streaming opens the port at the baud rate asked for", async () => {
  const opened: number[] = []
  const port = fakePort(() => {})
  const s = streamFromBoard({ path: "COM7", ms: 50, baudRate: 74880, onText: () => {}, openPort: (_p: string, baud: number) => { opened.push(baud); return port } })
  await s.done
  expect(opened).toEqual([74880])
})
