import midi from 'midi'
import { MixerCommunicator } from '../../lib/MixerCommunicator'
import { Connector } from '../interfaces'
import RolandV8HDConfiguration from './RolandV8HDConfiguration'

// What a Roland V-8HD answers when nothing has been heard from it for this long: gone.
// It is polled every requestInterval (100 ms by default), so 3 s is many missed rounds.
const DEFAULT_SILENCE_TIMEOUT_MS = 3000
// how often to look for the switcher while it is not connected
const DEFAULT_RETRY_INTERVAL_MS = 3000

export type RolandV8HDOptions = {
  retryIntervalMs?: number
  silenceTimeoutMs?: number
}

// The port name Windows / macOS / ALSA give the switcher's USB-MIDI interface
const isV8hdPort = (name: string) => name.includes("V-8HD")

// Roland V-8HD over USB-MIDI. Keeps looking for the switcher until it appears, and
// goes back to looking when it stops answering (cable pulled, switched off, or another
// program took the MIDI port).
// @see https://static.roland.com/assets/media/pdf/V-8HD_reference_eng03_W.pdf
class RolandV8HDConnector implements Connector {
    configuration: RolandV8HDConfiguration
    communicator: MixerCommunicator
    connected: boolean = false
    midi: any
    midi_input: any = null
    midi_output: any = null
    input_status: number[] = [0, 0, 0, 0, 0, 0, 0, 0]
    private pollTimer: any = null
    private retryTimer: any = null
    private lastHeardAt: number = 0
    private lastProblem: string | null = null
    private stopped = true
    private readonly retryIntervalMs: number
    private readonly silenceTimeoutMs: number

    // midiLib is injectable so tests can pretend a switcher is plugged in
    constructor(configuration: RolandV8HDConfiguration, communicator: MixerCommunicator, midiLib: any = midi, options: RolandV8HDOptions = {}) {
        this.configuration = configuration
        this.communicator = communicator
        this.midi = midiLib
        this.retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS
        this.silenceTimeoutMs = options.silenceTimeoutMs ?? DEFAULT_SILENCE_TIMEOUT_MS
    }

    connect() {
        this.stopped = false
        console.log(`Looking for a Roland V-8HD on USB-MIDI`)
        this.tryToOpen()
        this.retryTimer = setInterval(() => this.watch(), this.retryIntervalMs)
    }

    // runs every retryIntervalMs: reconnect when not connected, notice silence when connected
    private watch() {
        if (this.stopped) { return }
        if (!this.connected) {
            this.tryToOpen()
        } else if (Date.now() - this.lastHeardAt > this.silenceTimeoutMs) {
            this.dropConnection("The V-8HD stopped answering. Is it switched on and its USB cable plugged in?")
        }
    }

    private findPort(device: any): number {
        const count = device.getPortCount()
        for (let i = 0; i < count; i++) {
            if (isV8hdPort(device.getPortName(i))) { return i }
        }
        return -1
    }

    private tryToOpen() {
        let input: any = null
        let output: any = null
        try {
            input = new this.midi.Input()
            output = new this.midi.Output()
            const inputIdx = this.findPort(input)
            const outputIdx = this.findPort(output)
            if (inputIdx === -1 || outputIdx === -1) {
                this.report("No Roland V-8HD found on USB. Check that it is switched on and its USB cable is plugged into this computer.")
                this.closeQuietly(input); this.closeQuietly(output)
                return
            }
            input.openPort(inputIdx)
            output.openPort(outputIdx)
            if (!input.isPortOpen() || !output.isPortOpen()) {
                throw new Error("port did not open")
            }
            // do not ignore SysEx messages; that is how the tally state arrives
            input.ignoreTypes(false, true, true)
            input.on('message', (_deltaTime: number, message: number[]) => this.onMessage(message))

            this.midi_input = input
            this.midi_output = output
            this.input_status = [0, 0, 0, 0, 0, 0, 0, 0]
            this.lastHeardAt = Date.now()
            this.connected = true
            this.lastProblem = null
            console.log(`Opened Midi Port ${inputIdx}: ${input.getPortName(inputIdx)}`)
            this.pollTimer = setInterval(() => this.requestStatus(), this.configuration.getRequestInterval())
            this.communicator.notifyMixerIsConnected()
        } catch (e) {
            this.closeQuietly(input); this.closeQuietly(output)
            this.report(`Found the V-8HD but could not open its MIDI port (${e?.message || e}). Another program, e.g. the Roland remote software, may be using it. Close it; the hub keeps trying.`)
        }
    }

    // log a problem once, not every retry
    private report(problem: string) {
        if (problem !== this.lastProblem) {
            console.warn(`Roland V-8HD: ${problem}`)
            this.lastProblem = problem
        }
        this.communicator.notifyMixerIsDisconnected(problem)
    }

    private closeQuietly(device: any) {
        try { if (device && device.isPortOpen && device.isPortOpen()) { device.closePort() } } catch (e) { /* already gone */ }
    }

    private dropConnection(problem: string) {
        if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
        this.closeQuietly(this.midi_input)
        this.closeQuietly(this.midi_output)
        this.midi_input = null
        this.midi_output = null
        this.connected = false
        this.report(problem)
    }

    private onMessage(message: number[]) {
        this.lastHeardAt = Date.now()
        // tally parameter area
        if (message[8] === 12) {
            // hdmi input id in byte 11, tally information in byte 12
            const channelIdx = message[10]
            this.input_status[channelIdx] = message[11]
            // only notify after a full round of all 8 inputs
            if (channelIdx === 7) {
                this.processInputStatus(this.communicator)
            }
        }
    }

    private processInputStatus(communicator: MixerCommunicator) {
      let programs: string[] = []
      let previews: string[] = []
      for (let i = 0; i < 8; i++) {
        if (this.input_status[i] === 1) { programs.push(`${i + 1}`) }
        if (this.input_status[i] === 2) { previews.push(`${i + 1}`) }
      }
      communicator.notifyProgramPreviewChanged(programs, previews)
    }

    // ask the switcher for the tally state of all 8 inputs
    private requestStatus() {
      if (!this.midi_output) { return }
      // Base SysEx message to the V-8HD; input address in byte 11, checksum in byte 15
      let sysex_msg = [0xF0, 0x41, 0x10, 0x00, 0x00, 0x00, 0x68, 0x11, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x03, 0x71, 0xF7]
      try {
        for (let i = 0; i < 8; i++) {
          this.midi_output.sendMessage(sysex_msg)
          sysex_msg[10] += 1
          sysex_msg[14] -= 1
        }
      } catch (e) {
        this.dropConnection(`Lost the V-8HD (${e?.message || e}). Looking for it again.`)
      }
    }

    disconnect() {
      this.stopped = true
      if (this.retryTimer) { clearInterval(this.retryTimer); this.retryTimer = null }
      if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
      this.closeQuietly(this.midi_input)
      this.closeQuietly(this.midi_output)
      this.midi_input = null
      this.midi_output = null
      this.connected = false
      console.log(`RolandV8HD V-8HD connection closed`)
      this.communicator.notifyMixerIsDisconnected()
      return true
    }

    isConnected() {
        return this.connected
    }

    getProblem(): string | null {
        return this.lastProblem
    }

    static readonly ID: "rolandV8HD" = "rolandV8HD"
}

export default RolandV8HDConnector
