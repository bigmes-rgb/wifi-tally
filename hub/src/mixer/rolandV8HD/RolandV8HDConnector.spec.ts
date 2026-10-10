import RolandV8HDConnector from './RolandV8HDConnector'
import RolandV8HDConfiguration from './RolandV8HDConfiguration'

// A pretend node-midi 1.0.4 with a V-8HD behind it, built from how the real library behaves
// (node_modules/midi src/input.cpp, src/output.cpp and RtMidi's WinMM code), not from memory:
// - openPort on a port another program holds does NOT throw; isPortOpen() just stays false
// - openPort sets a port up even when it fails to open; only closePort frees it
// - sendMessage never throws: on a closed or vanished port it does nothing
// - the switcher answers every tally question (RQ1 for input n) with a DT1 for input n
const fakeMidi = () => {
  const state = {
    ports: [] as string[], heldByOtherProgram: false, switcherAnswers: true,
    status: [0, 0, 0, 0, 0, 0, 0, 0], inputs: [] as any[], sent: 0,
  }
  const openInput = () => state.inputs.find(p => p.isInput && p.opened)
  class Port {
    opened = false
    setUp = false
    closed = false
    listeners: Record<string, Function> = {}
    constructor(public isInput: boolean) { if (isInput) state.inputs.push(this) }
    getPortCount() { return state.ports.length }
    getPortName(i: number) { return state.ports[i] ?? "" }
    openPort(i: number) {
      if (i < 0 || i >= state.ports.length) { throw new RangeError("Invalid MIDI port number") }
      this.setUp = true
      this.opened = !state.heldByOtherProgram
    }
    closePort() { this.opened = false; this.closed = true }
    isPortOpen() { return this.opened }
    ignoreTypes() {}
    on(event: string, fn: Function) { this.listeners[event] = fn }
    sendMessage(message: number[]) {
      if (!this.opened || !state.ports.some(p => p.includes("V-8HD"))) { return }
      state.sent++
      if (!state.switcherAnswers) { return }
      const channel = message[10]
      setTimeout(() => openInput()?.answer(channel, state.status[channel]), 1)
    }
    // the switcher's DT1 for input `channel` with tally `status`
    answer(channel: number, status: number) { this.listeners['message']?.(0, [0xF0, 0x41, 0x10, 0, 0, 0, 0x68, 0x12, 0x0C, 0, channel, status, 0, 0xF7]) }
  }
  return { state, Input: class extends Port { constructor() { super(true) } }, Output: class extends Port { constructor() { super(false) } } }
}

const communicator = () => {
  const c: any = {
    connected: false, problems: [] as string[], programs: null, previews: null,
    notifyMixerIsConnected() { c.connected = true },
    notifyMixerIsDisconnected(problem?: string) { c.connected = false; if (problem) c.problems.push(problem) },
    notifyProgramPreviewChanged(programs: any, previews: any) { c.programs = programs; c.previews = previews },
  }
  return c
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const setup = (midi = fakeMidi(), options: any = { retryIntervalMs: 30, silenceTimeoutMs: 120 }) => {
  const c = communicator()
  const config = new RolandV8HDConfiguration()
  config.requestInterval = 20 // faster than a person may choose, to keep the tests short
  const connector = new RolandV8HDConnector(config, c, midi, options)
  return { midi, c, connector }
}

test("it keeps looking until the switcher is plugged in, then connects once it answers", async () => {
  const { midi, c, connector } = setup()
  connector.connect()
  expect(connector.isConnected()).toBe(false)
  expect(c.problems[0]).toContain("No Roland V-8HD found on USB")
  await sleep(80)
  expect(connector.isConnected()).toBe(false)
  // the person plugs it in
  midi.state.ports = ["Microsoft GS Wavetable Synth 0", "V-8HD 1"]
  await sleep(80)
  expect(connector.isConnected()).toBe(true)
  expect(c.connected).toBe(true)
  expect(midi.state.sent).toBeGreaterThan(0)
  connector.disconnect()
})

test("an open port is not 'connected' until the switcher has answered", async () => {
  const midi = fakeMidi()
  midi.state.ports = ["V-8HD 1"]
  midi.state.switcherAnswers = false
  const { c, connector } = setup(midi)
  connector.connect()
  await sleep(60)
  expect(connector.isConnected()).toBe(false)
  expect(c.connected).toBe(false)
  midi.state.switcherAnswers = true
  await sleep(150)
  expect(connector.isConnected()).toBe(true)
  connector.disconnect()
})

test("a port held by another program is reported, retried, and every failed attempt is freed", async () => {
  const midi = fakeMidi()
  midi.state.ports = ["V-8HD 1"]
  midi.state.heldByOtherProgram = true
  const { c, connector } = setup(midi)
  connector.connect()
  expect(connector.isConnected()).toBe(false)
  expect(c.problems[0]).toContain("could not open its MIDI port")
  expect(c.problems[0]).toContain("Another program")
  await sleep(100)
  // node-midi sets a port up even when Windows refuses it; every one of them was closed again
  const failed = midi.state.inputs.filter(p => p.setUp && !p.opened)
  expect(failed.length).toBeGreaterThan(1)
  expect(failed.every(p => p.closed)).toBe(true)
  midi.state.heldByOtherProgram = false // the other program was closed
  await sleep(100)
  expect(connector.isConnected()).toBe(true)
  connector.disconnect()
})

test("tally answers become program and preview lists", async () => {
  const midi = fakeMidi()
  midi.state.ports = ["V-8HD 1"]
  midi.state.status = [0, 0, 1, 0, 2, 0, 0, 0]
  const { c, connector } = setup(midi)
  connector.connect()
  await sleep(80)
  expect(c.programs).toEqual(["3"])
  expect(c.previews).toEqual(["5"])
  connector.disconnect()
})

test("a pulled cable drops the connection, and it comes back with the switcher", async () => {
  const midi = fakeMidi()
  midi.state.ports = ["V-8HD 1"]
  const { c, connector } = setup(midi)
  connector.connect()
  await sleep(80)
  expect(connector.isConnected()).toBe(true)
  // cable pulled: the port disappears and the switcher stops answering
  midi.state.ports = []
  await sleep(200)
  expect(connector.isConnected()).toBe(false)
  expect(c.problems.some(p => p.includes("stopped answering"))).toBe(true)
  midi.state.ports = ["V-8HD 1"]
  await sleep(100)
  expect(connector.isConnected()).toBe(true)
  connector.disconnect()
})

test("with the default timing a pulled cable is noticed within about 1.5 s, not 3 to 6 s", async () => {
  const midi = fakeMidi()
  midi.state.ports = ["V-8HD 1"]
  const { c, connector } = setup(midi, {}) // the defaults the hub uses
  connector.connect()
  await sleep(100)
  expect(connector.isConnected()).toBe(true)
  const pulledAt = Date.now()
  midi.state.ports = []
  while (connector.isConnected() && Date.now() - pulledAt < 5000) { await sleep(20) }
  const noticedAfter = Date.now() - pulledAt
  expect(c.connected).toBe(false)
  expect(noticedAfter).toBeGreaterThanOrEqual(1400)
  expect(noticedAfter).toBeLessThan(1800)
  connector.disconnect()
}, 10000)

test("disconnect() stops looking", async () => {
  const { midi, connector } = setup()
  connector.connect()
  connector.disconnect()
  midi.state.ports = ["V-8HD 1"]
  await sleep(80)
  expect(connector.isConnected()).toBe(false)
})
