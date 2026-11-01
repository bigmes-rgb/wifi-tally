import { ConnectionState, UdpTally, WebTally } from '../domain/Tally'
import { hubAddressFor, updatePlan } from './LightUpdates'

const light = (name: string, program?: string, state = ConnectionState.CONNECTED) => {
  const tally = new UdpTally(name, "1", "192.168.1.20", 7411, state)
  tally.program = program
  return tally
}

test("sorts connected lights into current, behind and needs-USB, and leaves out lights that are off", () => {
  const plan = updatePlan([
    light("Current", "abc"), light("Behind", "old"), light("Files", "files"), light("Old light"),
    light("Off", "old", ConnectionState.DISCONNECTED), light("Missing", "old", ConnectionState.MISSING),
    new WebTally("Phone", "2", [{ address: "1.2.3.4" }]),
  ], "abc")
  expect(plan).toEqual({ behind: ["Behind", "Files"], current: ["Current"], needUsb: ["Old light"] })
})

test("offers nothing while the hub has no program of its own to give", () => {
  expect(updatePlan([light("Behind", "old"), light("Old light")], undefined)).toEqual({ behind: [], current: [], needUsb: [] })
})

test("the light fetches from this computer's address on its own network", () => {
  expect(hubAddressFor("192.168.1.20", ["10.0.0.5", "192.168.1.5"])).toBe("192.168.1.5")
  expect(hubAddressFor("192.168.1.20", ["10.0.0.5"])).toBe("10.0.0.5")
  expect(hubAddressFor(undefined, ["10.0.0.5", "192.168.1.5"])).toBe("10.0.0.5")
  expect(hubAddressFor("192.168.1.20", [])).toBeUndefined()
})
