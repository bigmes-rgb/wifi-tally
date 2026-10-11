/**
 * @jest-environment node
 */
import dgram from 'dgram'
import { EventEmitter } from 'events'
import { AppConfiguration } from '../lib/AppConfiguration'
import CommandParser from './CommandParser'
import TallyContainer from './TallyContainer'
import UdpTallyDriver from './UdpTallyDriver'
import { wifiProblem } from './WifiHandover'

describe("wifiProblem()", () => {
  test.each([
    ["Church", "secret-pass", null],
    ["Church", "", null], // an open network
    ["", "secret-pass", "network name"],
    ["x".repeat(33), "secret-pass", "1 to 32"],
    ["Church", "short", "8 to 63"],
    ["Church ", "secret-pass", "spaces"],
  ])("%j / %j", (ssid, password, expected) => {
    const problem = wifiProblem(ssid, password)
    if (expected === null) expect(problem).toBeNull()
    else expect(problem).toContain(expected)
  })
})

test("a light's answer is parsed", () => {
  expect(CommandParser.parse('wifi-saved "Cam 1"')).toEqual({ command: "wifi-answer", tallyName: "Cam 1", saved: true })
  expect(CommandParser.parse('wifi-failed "Cam 1"')).toEqual({ command: "wifi-answer", tallyName: "Cam 1", saved: false })
})

test("the hub sends a new Wi-Fi to every light on the network, as hex, and passes on each answer", async () => {
  const emitter = new EventEmitter() as any
  const configuration = new AppConfiguration(emitter)
  configuration.tallyPort = 41000 + Math.floor(Math.random() * 900)
  const container = new TallyContainer(configuration, emitter)
  const driver = new UdpTallyDriver(configuration, container)
  // a pretend light on this computer: says hello, then answers whatever Wi-Fi it is sent
  const light = dgram.createSocket('udp4')
  const received: string[] = []
  const answers: any[] = []
  emitter.on('tally.wifi', (a: any) => answers.push(a))
  try {
    await new Promise<void>(resolve => light.bind(0, "127.0.0.1", () => resolve()))
    light.on('message', msg => {
      const text = msg.toString()
      if (text.startsWith("wifi ")) {
        received.push(text)
        light.send('wifi-saved "Cam 1"', configuration.tallyPort, "127.0.0.1")
      }
    })
    await new Promise(resolve => setTimeout(resolve, 100))
    light.send('tally-ho "Cam 1"', configuration.tallyPort, "127.0.0.1")
    await new Promise(resolve => setTimeout(resolve, 200))

    const sentTo = driver.sendWifi("Church Wi-Fi", "pass=word 1")
    expect(sentTo).toEqual(["Cam 1"])
    await new Promise(resolve => setTimeout(resolve, 200))
    const wifi = received.find(r => r.startsWith("wifi ")) as string
    const [, ssidHex, pwHex] = wifi.split(" ")
    expect(Buffer.from(ssidHex, "hex").toString()).toEqual("Church Wi-Fi")
    expect(Buffer.from(pwHex, "hex").toString()).toEqual("pass=word 1")
    expect(answers).toEqual([{ tallyName: "Cam 1", saved: true }])
  } finally {
    light.close()
    driver.close()
  }
})

test("the hub renames one light over the network, and moves its channel to the new name once the light answers", async () => {
  const emitter = new EventEmitter() as any
  const configuration = new AppConfiguration(emitter)
  configuration.tallyPort = 42000 + Math.floor(Math.random() * 900)
  const container = new TallyContainer(configuration, emitter)
  const driver = new UdpTallyDriver(configuration, container)
  const light = dgram.createSocket('udp4')
  const received: string[] = []
  const answers: any[] = []
  emitter.on('tally.renamed', (a: any) => answers.push(a))
  try {
    await new Promise<void>(resolve => light.bind(0, "127.0.0.1", () => resolve()))
    light.on('message', msg => {
      const text = msg.toString()
      if (text.startsWith("name ")) {
        received.push(text)
        light.send('name-saved "Cam 1" "Stage left"', configuration.tallyPort, "127.0.0.1")
      }
    })
    expect(driver.sendName("Cam 1", "Stage left")).toBe(false) // not on the network yet
    await new Promise(resolve => setTimeout(resolve, 100))
    light.send('tally-ho "Cam 1"', configuration.tallyPort, "127.0.0.1")
    await new Promise(resolve => setTimeout(resolve, 200))
    container.patch("Cam 1", "udp", "3")

    expect(driver.sendName("Cam 1", "Stage left")).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(Buffer.from(received[0].split(" ")[1], "hex").toString()).toEqual("Stage left")
    expect(answers).toEqual([{ tallyName: "Cam 1", newName: "Stage left", saved: true }])
    expect(container.get("Cam 1", "udp")).toBeUndefined()
    expect(container.get("Stage left", "udp")?.channelId).toBe("3")
  } finally {
    light.close()
    driver.close()
  }
})
