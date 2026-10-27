import { lineLogger } from './LineLogger'

test("joins chunks into whole lines and logs each once", () => {
  const lines: string[] = []
  const logger = lineLogger(l => lines.push(l))
  logger.add("[INFO]  booted because")
  logger.add(" of POWER_ON, 29032 bytes free\r\n[INFO]  Connect to ")
  logger.add("WiFi Home\r\n")
  expect(lines).toEqual(["[INFO]  booted because of POWER_ON, 29032 bytes free", "[INFO]  Connect to WiFi Home"])
})

test("logs the last line without a line break when the watch ends, and skips blank lines", () => {
  const lines: string[] = []
  const logger = lineLogger(l => lines.push(l))
  logger.add("\r\n\r\nERROR\r\n\r\n> ")
  expect(lines).toEqual(["ERROR"])
  logger.end()
  expect(lines).toEqual(["ERROR", ">"])
  logger.end()
  expect(lines).toEqual(["ERROR", ">"])
})
