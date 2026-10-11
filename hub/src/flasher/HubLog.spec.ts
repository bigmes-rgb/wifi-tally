/**
 * @jest-environment node
 */
import { BoardOutputLog, outputBlock, redact, warnRarely } from './HubLog'

test("a Wi-Fi password never reaches the log; the rest of the settings do", () => {
  expect(redact("station.ssid=Church\nstation.password=hunter 2\ntally.name=Cam 1")).toBe("station.ssid=Church\nstation.password=•••\ntally.name=Cam 1")
})

test("what a board printed is shown as at most 40 indented lines of its last 1500 characters", () => {
  const loop = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join("\r\n")
  const block = outputBlock(loop)
  const lines = block.split("\n")
  expect(lines.length).toBeLessThanOrEqual(41)
  expect(lines.every(l => l.startsWith("  | "))).toBe(true)
  expect(block).toContain("line 1999") // the end, where the board is now
  expect(block.length).toBeLessThan(1500 + 41 * 4 + 10)
})

describe("BoardOutputLog: a board that restarts over and over does not fill the log", () => {
  const loop = "NodeMCU 3.0.0.0 \r\n\tbranch: HEAD\r\nPANIC: unprotected error in call to Lua API (not enough memory)\r\n".repeat(40)
  const capture = () => {
    const lines: string[] = []
    jest.spyOn(console, "info").mockImplementation((line: string) => { lines.push(line) })
    return lines
  }
  afterEach(() => jest.restoreAllMocks())

  test("the same lines, cut at another place, from the same port within ten minutes are pointed to, not repeated", () => {
    let now = 0
    const log = new BoardOutputLog(() => now)
    const lines = capture()
    for (let i = 0; i < 50; i++, now += 6000) log.write("COM6", loop.slice(i * 7))
    expect(lines.filter(l => l.startsWith("[board COM6] printed (the last"))).toHaveLength(1)
    expect(lines.filter(l => l.startsWith("[board COM6] printed the same lines as at"))).toHaveLength(49)
  })
  test("other output, another port, or ten minutes later is written out", () => {
    let now = 0
    const log = new BoardOutputLog(() => now)
    const lines = capture()
    log.write("COM6", loop)
    log.write("COM5", loop)
    log.write("COM6", "ets Jan  8 2013,rst cause:2\r\nsomething else\r\nentirely\r\n")
    now += 11 * 60 * 1000
    log.write("COM6", "ets Jan  8 2013,rst cause:2\r\nsomething else\r\nentirely\r\n")
    expect(lines.filter(l => l.includes("printed (the last"))).toHaveLength(4)
  })
})

test("the same warning is written at most once a minute", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
  try {
    for (let t = 0; t < 59000; t += 1000) warnRarely("[serial COM6] could not open the port: Access denied", 1000000 + t)
    warnRarely("[serial COM6] could not open the port: Access denied", 1000000 + 61000)
    expect(warn).toHaveBeenCalledTimes(2)
  } finally {
    warn.mockRestore()
  }
})
