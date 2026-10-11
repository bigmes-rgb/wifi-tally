import { nameProblem } from './TallyName'

test("a usable name has no problem", () => {
  expect(nameProblem("Stage left", ["Cam 1"], "Cam 1")).toBeNull()
})
test("what the light or the hub could not take is refused, in words", () => {
  expect(nameProblem("", [], "Cam 1")).toContain("Type a name")
  expect(nameProblem(" Cam 2", [], "Cam 1")).toContain("spaces")
  expect(nameProblem("x".repeat(27), [], "Cam 1")).toContain("26")
  expect(nameProblem('Cam "2"', [], "Cam 1")).toContain("quotes")
  expect(nameProblem(";Cam", [], "Cam 1")).toContain("semicolon")
  expect(nameProblem("Cam 1", ["Cam 1"], "Cam 1")).toContain("name it has")
  expect(nameProblem("Cam 2", ["Cam 1", "Cam 2"], "Cam 1")).toContain("already called")
  expect(nameProblem(undefined, [], "Cam 1")).toContain("Type a name")
})
