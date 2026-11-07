import Channel from '../domain/Channel'
import { ConnectionState, UdpTally, WebTally } from '../domain/Tally'
import { channelLabel, preServiceFindings, verdict } from './preService'

const light = (name: string, channelId?: string, state = ConnectionState.CONNECTED, program = "abc") => {
  const t = new UdpTally(name, channelId, "192.168.1.20", 7411, state)
  t.program = program
  return t
}
const channels = [new Channel("1", "Wide"), new Channel("2")]
const good = { mixerConnected: true, tallies: [light("Cam 1", "1"), light("Cam 2", "2")], channels, otherHubs: [], programStamp: "abc", dimmer: 100 }
const byId = (findings: ReturnType<typeof preServiceFindings>, id: string) => findings.find(f => f.id === id)!

test("everything in order reads as ready", () => {
  const findings = preServiceFindings(good)
  expect(findings.map(f => f.status)).toEqual(["ok", "ok", "ok", "ok", "ok", "ok"])
  expect(byId(findings, "lights").title).toBe("All 2 lights online")
  expect(verdict(findings)).toEqual({ status: "ok", title: "Ready for the service" })
})

test("a switcher that is off, a light that is off and a second hub stop the service; they are counted", () => {
  const findings = preServiceFindings({ ...good, mixerConnected: false, mixerProblem: "No Roland V-8HD found on USB.",
    tallies: [light("Cam 1", "1"), light("Cam 2", "2", ConnectionState.DISCONNECTED), light("Cam 3", "2", ConnectionState.MISSING)],
    otherHubs: [{ address: "192.168.1.5", hostname: "BOOTH-PC" }] })
  expect(byId(findings, "switcher")).toMatchObject({ status: "fail", detail: "No Roland V-8HD found on USB." })
  expect(byId(findings, "lights")).toMatchObject({ status: "fail", title: "2 of 3 lights not online", detail: expect.stringContaining("Cam 2, Cam 3") })
  expect(byId(findings, "hubs")).toMatchObject({ status: "fail", title: expect.stringContaining("BOOTH-PC") })
  expect(verdict(findings)).toEqual({ status: "fail", title: "3 things to fix before the service" })
})

test("a spare light on no input, two lights on one input, an older program and a dimmed room are things to look at", () => {
  const spare = preServiceFindings({ ...good, tallies: [...good.tallies, light("Spare")] })
  expect(byId(spare, "inputs")).toMatchObject({ status: "warn", title: "1 light on no input", detail: expect.stringContaining("Spare") })

  const doubled = preServiceFindings({ ...good, tallies: [light("Cam 1", "1"), light("Cam 1b", "1")] })
  expect(byId(doubled, "inputs")).toMatchObject({ status: "warn", title: "Two lights on the same input", detail: expect.stringContaining("Cam 1, Cam 1b are both on Wide") })

  const saysNothing = light("Cam 2", "2")
  saysNothing.program = undefined // a light from before the update over the network
  const older = preServiceFindings({ ...good, tallies: [light("Cam 1", "1", ConnectionState.CONNECTED, "old"), saysNothing] })
  expect(byId(older, "program")).toMatchObject({ status: "warn", title: "2 lights on an older program" })

  const dimmed = preServiceFindings({ ...good, dimmer: 40 })
  expect(byId(dimmed, "brightness")).toMatchObject({ status: "warn", title: "Lights dimmed to 40%", action: "full-brightness" })
  expect(verdict(dimmed)).toEqual({ status: "warn", title: "Ready, with 1 thing to look at" })
})

test("a light that is off but on no input is not counted; a phone tally counts like a light", () => {
  const findings = preServiceFindings({ ...good, tallies: [light("Cam 1", "1"), light("Old spare", undefined, ConnectionState.DISCONNECTED), new WebTally("Phone", "2", [{ address: "1.2.3.4" }])] })
  expect(byId(findings, "lights")).toMatchObject({ status: "ok", title: "All 2 lights online" })
  expect(byId(findings, "inputs").status).toBe("ok")
})

test("without a program of its own the hub says nothing about the lights' programs", () => {
  expect(preServiceFindings({ ...good, programStamp: undefined }).find(f => f.id === "program")).toBeUndefined()
})

test("an input is named as the switcher names it, else by its number", () => {
  expect(channelLabel("1", channels)).toBe("Wide")
  expect(channelLabel("2", channels)).toBe("Channel 2")
  expect(channelLabel("7", channels)).toBe("Channel 7")
  expect(channelLabel(undefined, channels)).toBe("no input")
})
