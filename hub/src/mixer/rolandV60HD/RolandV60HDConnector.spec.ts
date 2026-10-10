/**
 * @jest-environment node
 */
import http from 'http'
import { AddressInfo } from 'net'
import { EventEmitter } from 'events'
import { AppConfiguration } from '../../lib/AppConfiguration'
import { MixerCommunicator } from '../../lib/MixerCommunicator'
import CommandCreator from '../../tally/CommandCreator'
import { UdpTally } from '../../domain/Tally'
import RolandV60HDConfiguration from './RolandV60HDConfiguration'
import RolandV60HDConnector from './RolandV60HDConnector'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const until = async (what: () => boolean, ms = 3000) => {
  const end = Date.now() + ms
  while (!what()) {
    if (Date.now() > end) throw new Error("timed out waiting")
    await sleep(20)
  }
}

// a stand-in for the switcher's Smart Tally web server: GET /tally/<n>/status answers a word
const switcher = async (answer: (input: number, res: http.ServerResponse) => void) => {
  const requests: number[] = []
  const sockets = new Set<any>()
  const server = http.createServer((req, res) => {
    const input = parseInt((req.url || "").split("/")[2], 10)
    requests.push(input)
    answer(input, res)
  })
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as AddressInfo).port
  // switching it off: no more answers, open connections cut
  const off = () => new Promise<void>(resolve => { server.close(() => resolve()); sockets.forEach(s => s.destroy()) })
  return { port, requests, off }
}

const words = (input: number, res: http.ServerResponse) => res.end(input === 1 ? "onair" : input === 2 ? "selected" : "unselected")

const setup = (port: number) => {
  const emitter = new EventEmitter()
  const communicator = new MixerCommunicator(new AppConfiguration(emitter), emitter)
  communicator.lostMixerGraceMs = 100
  const config = new RolandV60HDConfiguration()
  config.setIp("127.0.0.1")
  config.setPort(port)
  config.setRequestInterval(100)
  const connector = new RolandV60HDConnector(config, communicator)
  connector.requestTimeoutMs = 300
  return { communicator, connector }
}

test("it follows the switcher's program and preview", async () => {
  const v60 = await switcher(words)
  const { communicator, connector } = setup(v60.port)
  try {
    connector.connect()
    await until(() => communicator.getCurrentPrograms() !== null)
    expect(communicator.getCurrentPrograms()).toEqual(["1"])
    expect(communicator.getCurrentPreviews()).toEqual(["2"])
    expect(communicator.isConnected).toBe(true)
  } finally {
    connector.disconnect()
    await v60.off()
  }
})

test("a switcher that is switched off mid-service turns the lights to 'unknown' instead of leaving a camera on air", async () => {
  const v60 = await switcher(words)
  const { communicator, connector } = setup(v60.port)
  const camera1 = new UdpTally("Cam 1", "1")
  try {
    connector.connect()
    await until(() => communicator.getCurrentPrograms() !== null)
    expect(CommandCreator.getState(camera1, communicator.getCurrentPrograms(), communicator.getCurrentPreviews())).toEqual("on-air")

    await v60.off()
    await until(() => communicator.getCurrentPrograms() === null)
    expect(communicator.isConnected).toBe(false)
    expect(CommandCreator.getState(camera1, communicator.getCurrentPrograms(), communicator.getCurrentPreviews())).toEqual("unknown")
  } finally {
    connector.disconnect()
  }
})

test("it is not 'connected' before the switcher has answered", async () => {
  const v60 = await switcher(() => { /* never answers */ })
  const { communicator, connector } = setup(v60.port)
  try {
    connector.connect()
    expect(communicator.isConnected).not.toBe(true)
    await sleep(150)
    expect(communicator.isConnected).not.toBe(true)
  } finally {
    connector.disconnect()
    await v60.off()
  }
})

test("a switcher that stops answering is reported within the request time limit, without piling up requests", async () => {
  const v60 = await switcher(() => { /* hangs */ })
  const { communicator, connector } = setup(v60.port)
  try {
    connector.connect()
    await until(() => communicator.isConnected === false, 2000)
    // one question per input at a time, however long the switcher hangs
    await sleep(250)
    const inFlightPerInput = Math.max(...[1, 2, 3, 4, 5, 6, 7, 8].map(i => v60.requests.filter(r => r === i).length))
    expect(inFlightPerInput).toBeLessThanOrEqual(2)
  } finally {
    connector.disconnect()
    await v60.off()
  }
})

test("something else answering at the address (a router's 404 page) is not taken for a V-60HD", async () => {
  const router = await switcher((_, res) => { res.statusCode = 404; res.end("<html>Not Found</html>") })
  const { communicator, connector } = setup(router.port)
  try {
    connector.connect()
    await until(() => communicator.getProblem() !== null)
    expect(communicator.isConnected).toBe(false)
    expect(communicator.getProblem()).toContain("not a V-60HD")
    expect(communicator.getCurrentPrograms()).toBeNull()
  } finally {
    connector.disconnect()
    await router.off()
  }
})

test("a reply that arrives after the mixer was switched away does not bring back its state", async () => {
  const v60 = await switcher((input, res) => setTimeout(() => words(input, res), 150))
  const { communicator, connector } = setup(v60.port)
  try {
    connector.connect()
    await until(() => v60.requests.length > 0)
    connector.disconnect()
    await sleep(400)
    expect(communicator.isConnected).toBe(false)
    expect(communicator.getCurrentPrograms()).toBeNull()
  } finally {
    await v60.off()
  }
})
