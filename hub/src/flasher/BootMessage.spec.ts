import { BOOT_ADVICE, bootVerdict, parseBootMessage } from './BootMessage'

const boot = (mode: string, more = "") => `\r\n ets Jan  8 2013,rst cause:2, boot mode:(${mode})\r\n${more}`
const loads = "\r\nload 0x40100000, len 27728, room 16 \r\ntail 0\r\nchksum 0x2a\r\n"

test.each([
  [boot("3,6", loads), "normal"],
  [boot("3,6", loads) + boot("3,6", loads), "restarting"],
  [boot("1,7", "\r\nwaiting for host\r\n"), "flashingMode"],
  [boot("2,6"), "d4Low"],
  [boot("0,6"), "d4Low"],
  [boot("7,7"), "d8High"],
  ["", "noMessage"],
  ["{l·d·|·l·<·d·c|·r·b·#·o'·do'·cxx·l;l;l", "noMessage"],
])("%j reads as %s", (text, verdict) => {
  expect(bootVerdict(parseBootMessage(text))).toBe(verdict)
})

test("the D4 advice names the strip's power and the VU pin", () => {
  expect(BOOT_ADVICE.d4Low).toContain("strip")
  expect(BOOT_ADVICE.d4Low).toContain("VU")
})

test("the parse reports the restart cause and whether the firmware was loaded", () => {
  expect(parseBootMessage(boot("3,6", loads))).toEqual({ rstCause: 2, bootMode: 3, starts: 1, loads: true, waitingForHost: false })
})
