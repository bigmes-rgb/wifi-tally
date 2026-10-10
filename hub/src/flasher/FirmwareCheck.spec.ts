import { firmwareProblem, numberTypeFrom } from './FirmwareCheck'

const ALL = "file,gpio,net,node,pwm2,tmr,wifi,ws2812"

test.each([
  ["0.5", "float"], ["0", "integer"], ["", "unknown"], ["stdin:1: error", "unknown"],
])("print(1/2) answering %j means %s", (answer, type) => {
  expect(numberTypeFrom(answer)).toBe(type)
})

test("the firmware the hub installs passes", () => {
  expect(firmwareProblem({ version: "3.0.0", modules: ALL + ",encoder,struct,uart", numberType: "float" })).toBeNull()
})
test("NodeMCU 2 is refused, naming the version", () => {
  expect(firmwareProblem({ version: "2.2.1", modules: null, numberType: "float" })).toContain("2.2.1")
})
test("an unknown number type is not held against a light", () => {
  expect(firmwareProblem({ version: "3.0.0", modules: ALL, numberType: "unknown" })).toBeNull()
})
test("missing modules are named", () => {
  expect(firmwareProblem({ version: "3.0.0", modules: "file,gpio,net,node,tmr,wifi", numberType: "float" })).toContain("pwm2, ws2812")
})
