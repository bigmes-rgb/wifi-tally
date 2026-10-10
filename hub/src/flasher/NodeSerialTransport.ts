import { EventEmitter } from 'events'

// The slice of node-serialport 8 this transport uses. Kept narrow so tests can pass a fake.
export interface SerialPortLike extends EventEmitter {
  isOpen: boolean
  open(cb: (err?: Error | null) => void): void
  close(cb: (err?: Error | null) => void): void
  write(data: Buffer, cb: (err?: Error | null) => void): void
  drain(cb: (err?: Error | null) => void): void
  set(options: { dtr: boolean, rts: boolean }, cb: (err?: Error | null) => void): void
  update(options: { baudRate: number }, cb: (err?: Error | null) => void): void
}

export type OpenPort = (path: string, baudRate: number) => SerialPortLike

export const defaultOpenPort: OpenPort = (path, baudRate) => {
  const SerialPort = require('serialport')
  return new SerialPort(path, { baudRate, autoOpen: false })
}

const SLIP_END = 0xc0, SLIP_ESC = 0xdb, SLIP_ESC_END = 0xdc, SLIP_ESC_ESC = 0xdd
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// What esptool-js needs from a serial port, on top of node-serialport instead of Web Serial.
// Method names and semantics follow esptool-js's own Transport so ESPLoader can use it unchanged.
class NodeSerialTransport {
  tracing = false
  slipReaderEnabled = true
  baudrate = 115200
  private port: SerialPortLike | null = null
  private buffer = new Uint8Array(0)
  // serialport's set() resets every signal that is not passed, so both are always sent together
  private dtr = false
  private rts = false

  constructor(private path: string, private openPort: OpenPort = defaultOpenPort) {}

  getInfo() { return this.path }
  getPid(): number | undefined { return undefined }
  getVid(): number | undefined { return undefined }
  trace(message: string) { if (this.tracing) { console.debug(`[serial ${this.path}] ${message}`) } }
  async returnTrace() {}

  hexify(s: Uint8Array): string {
    return Array.from(s).map(b => b.toString(16).padStart(2, "0")).join("")
  }
  hexConvert(a: Uint8Array): string { return this.hexify(a) }

  slipWriter(data: Uint8Array): Uint8Array {
    const out: number[] = [SLIP_END]
    for (const b of data) {
      if (b === SLIP_ESC) out.push(SLIP_ESC, SLIP_ESC_ESC)
      else if (b === SLIP_END) out.push(SLIP_ESC, SLIP_ESC_END)
      else out.push(b)
    }
    out.push(SLIP_END)
    return Uint8Array.from(out)
  }

  private call(fn: (cb: (err?: Error | null) => void) => void): Promise<void> {
    return new Promise((resolve, reject) => fn(err => (err ? reject(err) : resolve())))
  }

  async connect(baud = 115200) {
    this.baudrate = baud
    this.buffer = new Uint8Array(0)
    const port = this.openPort(this.path, baud)
    port.on('data', (chunk: Buffer) => {
      const next = new Uint8Array(this.buffer.length + chunk.length)
      next.set(this.buffer)
      next.set(chunk, this.buffer.length)
      this.buffer = next
    })
    port.on('error', (e: Error) => this.trace(`port error: ${e.message}`))
    await this.call(cb => port.open(cb))
    this.port = port
  }

  async disconnect() {
    const port = this.port
    this.port = null
    if (port && port.isOpen) {
      await this.call(cb => port.close(cb)).catch(() => {})
    }
  }

  // data arrives through 'data' events; esptool-js starts this and never awaits it
  async readLoop() {
    if (!this.port) { return }
    await new Promise<void>(resolve => this.port?.once('close', () => resolve()))
  }

  async changeBaudrate(baud: number) {
    if (!this.port) { throw new Error("port is not open") }
    await this.call(cb => this.port.update({ baudRate: baud }, cb))
    this.baudrate = baud
  }

  async write(data: Uint8Array) {
    if (!this.port) { throw new Error("port is not open") }
    const out = Buffer.from(this.slipWriter(data))
    this.trace(`write ${out.length} bytes`)
    await this.call(cb => this.port.write(out, cb))
    await this.call(cb => this.port.drain(cb))
  }

  flushInput() { this.buffer = new Uint8Array(0) }
  inWaiting() { return this.buffer.length }
  peek() { return this.buffer }

  async drainInput(quietMs = 100, maxMs = 400) {
    const deadline = Date.now() + maxMs
    let last = -1
    while (Date.now() < deadline && this.buffer.length !== last) {
      last = this.buffer.length
      await sleep(quietMs)
    }
    this.flushInput()
  }

  // the next complete SLIP packet, like esptool-js's Transport.read
  async read(timeout: number): Promise<Uint8Array> {
    let packet: number[] | null = null
    let escaping = false
    while (true) {
      const started = Date.now()
      let bytes = new Uint8Array(0)
      while (Date.now() - started < timeout) {
        if (this.buffer.length > 0) {
          bytes = this.buffer
          this.buffer = new Uint8Array(0)
          break
        }
        await sleep(1)
      }
      if (bytes.length === 0) {
        throw new Error(packet === null ? "Serial data stream stopped: Possible serial noise or corruption." : "No serial data received.")
      }
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i]
        if (packet === null) {
          if (b === SLIP_END) { packet = [] }
          else { throw new Error(`Invalid head of packet (0x${b.toString(16)}): Possible serial noise or corruption.`) }
        } else if (escaping) {
          escaping = false
          if (b === SLIP_ESC_END) packet.push(SLIP_END)
          else if (b === SLIP_ESC_ESC) packet.push(SLIP_ESC)
          else throw new Error(`Invalid SLIP escape (0xdb, 0x${b.toString(16)})`)
        } else if (b === SLIP_ESC) {
          escaping = true
        } else if (b === SLIP_END) {
          // whatever follows belongs to the next packet
          if (i + 1 < bytes.length) {
            const rest = bytes.slice(i + 1)
            const next = new Uint8Array(rest.length + this.buffer.length)
            next.set(rest)
            next.set(this.buffer, rest.length)
            this.buffer = next
          }
          return Uint8Array.from(packet)
        } else {
          packet.push(b)
        }
      }
    }
  }

  private async applySignals() {
    if (!this.port) { throw new Error("port is not open") }
    await this.call(cb => this.port.set({ dtr: this.dtr, rts: this.rts }, cb))
  }
  async setDTR(state: boolean) {
    this.dtr = state
    await this.applySignals()
  }
  async setRTS(state: boolean) {
    this.rts = state
    await this.applySignals()
    // esptool's work-around for usbser.sys on Windows: a DTR write makes the RTS change take
    await this.applySignals()
  }
  async setSignals(dtr: boolean, rts: boolean) {
    this.dtr = dtr
    this.rts = rts
    await this.applySignals()
  }
}

export default NodeSerialTransport
