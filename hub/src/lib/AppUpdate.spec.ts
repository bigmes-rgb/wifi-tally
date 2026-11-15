import appUpdate, { AppUpdate } from './AppUpdate'

test("one instance for the process, however the file is loaded", () => {
  expect((global as any).accTallyAppUpdate).toBe(appUpdate)
})

test("restarts only once a version is ready, and says every change", () => {
  const u = new AppUpdate()
  const seen: string[] = []
  u.on('change', s => seen.push(s.status))
  const installed: number[] = []
  const checked: number[] = []

  // nothing attached (npm package, development): nothing happens
  expect(u.install()).toBe(false)
  expect(u.check()).toBe(false)
  expect(u.get().status).toBe("unsupported")

  u.attach(() => installed.push(1), () => checked.push(1))
  u.set({ status: "current", current: "0.9.32" })
  expect(u.install()).toBe(false)
  expect(u.check()).toBe(true)

  u.set({ status: "downloading", current: "0.9.32", version: "0.9.33", percent: 40 })
  // no second check while one is on its way
  expect(u.check()).toBe(false)
  u.set({ status: "ready", current: "0.9.32", version: "0.9.33" })
  expect(u.check()).toBe(false)
  expect(u.install()).toBe(true)

  expect(installed).toEqual([1])
  expect(checked).toEqual([1])
  expect(seen).toEqual(["current", "downloading", "ready"])
})
