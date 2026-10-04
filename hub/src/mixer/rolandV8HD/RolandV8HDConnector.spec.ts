import RolandV8HDConnector from './RolandV8HDConnector'
import RolandV8HDConfiguration from './RolandV8HDConfiguration'

// a pretend node-midi: the list of ports can change while the connector runs,
// opening can be made to fail, and the test can inject answers from the switcher
const fakeMidi = () => {
  const state = { ports: [] as string[], openFails: false, inputs: [] as any[], sent: 0 }
  class Port {
    opened = false
    listeners: Record<string, Function> = {}
    constructor() { state.inputs.push(this) }
    getPortCount() { return state.ports.length }
    getPortName(i: number) { return state.ports[i] }
    openPort(i: number) {
      if (state.openFails) { throw new Error("MidiInWinMM::openPort: error creating Windows MM MIDI input port.") }
      if (i < 0 || i >= state.ports.length) { throw new Error("invalid port") }
      this.opened = true
    }
    closePort() { this.opened = false }
    isPortOpen() { return this.opened }
    ignoreTypes() {}
    on(event: string, fn: Function) { this.listeners[event] = fn }
    sendMessage() { if (!this.opened) { throw new Error("port not open") } state.sent++ }
    // test helper: the switcher answers for input `channel` with `status`
    answer(channel: number, status: number) { this.listeners['message']?.(0, [0xF0, 0x41, 0x10, 0, 0, 0, 0x68, 0x12, 0x0C, 0, channel, status, 0, 0xF7]) }
  }
  return { state, Input: Port, Output: Port }
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

const setup = (midi = fakeMidi()) => {
  const c = communicator()
  const config = new RolandV8HDConfiguration()
  config.setRequestInterval(20)
  const connector = new RolandV8HDConnector(config, c, midi, { retryIntervalMs: 30, silenceTimeoutMs: 120 })
  return { midi, c, connector }
}

test("it keeps looking until the switcher is plugged in, then connects", async () => {
  const { midi, c, connector } = setup()
  connector.connect()
  expect(connector.isConnected()).toBe(false)
  expect(c.problems[0]).toContain("No Roland V-8HD found on USB")
  await sleep(80)
  expect(connector.isConnected()).toBe(false)
  // the person plugs it in
  midi.state.ports = ["Microsoft GS Wavetable Synth", "V-8HD"]
  await sleep(80)
  expect(connector.isConnected()).toBe(true)
  expect(c.connected).toBe(true)
  expect(midi.state.sent).toBeGreaterThan(0)
  connector.disconnect()
})

test("a port held by another program is reported and retried", async () => {
  const midi = fakeMidi()
  midi.state.ports = ["V-8HD"]
  midi.state.openFails = true
  const { c, connector } = setup(midi)
  connector.connect()
  expect(connector.isConnected()).toBe(false)
  expect(c.problems[0]).toContain("could not open its MIDI port")
  expect(c.problems[0]).toContain("Another program")
  midi.state.openFails = false // the other program was closed
  await sleep(80)
  expect(connector.isConnected()).toBe(true)
  connector.disconnect()
})

test("tally answers become program and preview lists", async () => {
  const midi = fakeMidi()
  midi.state.ports = ["V-8HD"]
  const { c, connector } = setup(midi)
  connector.connect()
  const input = midi.state.inputs.find(p => p.opened)
  for (let ch = 0; ch < 8; ch++) { input.answer(ch, ch === 2 ? 1 : ch === 4 ? 2 : 0) }
  expect(c.programs).toEqual(["3"])
  expect(c.previews).toEqual(["5"])
  connector.disconnect()
})

test("silence from the switcher drops the connection and the search starts again", async () => {
  const midi = fakeMidi()
  midi.state.ports = ["V-8HD"]
  const { c, connector } = setup(midi)
  connector.connect()
  expect(connector.isConnected()).toBe(true)
  // keep it alive for a while
  const input = midi.state.inputs.find(p => p.opened)
  for (let i = 0; i < 4; i++) { input.answer(0, 0); await sleep(30) }
  expect(connector.isConnected()).toBe(true)
  // then nothing: cable pulled
  midi.state.ports = []
  await sleep(200)
  expect(connector.isConnected()).toBe(false)
  expect(c.problems.some(p => p.includes("stopped answering"))).toBe(true)
  // and it comes back when the switcher does
  midi.state.ports = ["V-8HD"]
  await sleep(80)
  expect(connector.isConnected()).toBe(true)
  connector.disconnect()
})

test("disconnect() stops looking", async () => {
  const { midi, connector } = setup()
  connector.connect()
  connector.disconnect()
  midi.state.ports = ["V-8HD"]
  await sleep(80)
  expect(connector.isConnected()).toBe(false)
})
