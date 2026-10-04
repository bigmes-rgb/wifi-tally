import { EventEmitter } from 'events'
import NodeSerialTransport, { SerialPortLike } from './NodeSerialTransport'

// a serial port that records what was asked of it and lets the test feed bytes in
class FakePort extends EventEmitter implements SerialPortLike {
  isOpen = false
  written: Buffer[] = []
  signals: { dtr: boolean, rts: boolean }[] = []
  baudRates: number[] = []
  open(cb) { this.isOpen = true; cb(null) }
  close(cb) { this.isOpen = false; this.emit('close'); cb(null) }
  write(data, cb) { this.written.push(data); cb(null) }
  drain(cb) { cb(null) }
  set(options, cb) { this.signals.push({ ...options }); cb(null) }
  update(options, cb) { this.baudRates.push(options.baudRate); cb(null) }
}

const setup = async () => {
  const port = new FakePort()
  const transport = new NodeSerialTransport("COM9", () => port)
  await transport.connect(115200)
  return { port, transport }
}

test("it opens the port, writes SLIP-framed packets and closes again", async () => {
  const { port, transport } = await setup()
  expect(port.isOpen).toBe(true)
  await transport.write(Uint8Array.from([0x01, 0xc0, 0xdb, 0x02]))
  expect(Array.from(port.written[0])).toEqual([0xc0, 0x01, 0xdb, 0xdc, 0xdb, 0xdd, 0x02, 0xc0])
  await transport.disconnect()
  expect(port.isOpen).toBe(false)
})

test("it reads one SLIP packet at a time and keeps the rest for the next read", async () => {
  const { port, transport } = await setup()
  port.emit('data', Buffer.from([0xc0, 0x10, 0xdb, 0xdc, 0x11, 0xc0, 0xc0, 0x20]))
  expect(Array.from(await transport.read(100))).toEqual([0x10, 0xc0, 0x11])
  port.emit('data', Buffer.from([0x21, 0xc0]))
  expect(Array.from(await transport.read(100))).toEqual([0x20, 0x21])
})

test("it gives up when nothing arrives in time", async () => {
  const { transport } = await setup()
  await expect(transport.read(30)).rejects.toThrow("Serial data stream stopped")
})

test("noise before a packet is an error, not silently swallowed", async () => {
  const { port, transport } = await setup()
  port.emit('data', Buffer.from([0x55, 0xc0, 0x01, 0xc0]))
  await expect(transport.read(100)).rejects.toThrow("Invalid head of packet (0x55)")
})

test("DTR and RTS are always sent together, because serialport resets what is left out", async () => {
  const { port, transport } = await setup()
  await transport.setDTR(true)
  await transport.setRTS(true)
  await transport.setSignals(false, true)
  expect(port.signals[0]).toEqual({ dtr: true, rts: false })
  expect(port.signals[1]).toEqual({ dtr: true, rts: true })
  expect(port.signals[port.signals.length - 1]).toEqual({ dtr: false, rts: true })
})

test("changing the baud rate goes to the port", async () => {
  const { port, transport } = await setup()
  await transport.changeBaudrate(460800)
  expect(port.baudRates).toEqual([460800])
  expect(transport.baudrate).toBe(460800)
})

test("flushInput and drainInput discard what has arrived", async () => {
  const { port, transport } = await setup()
  port.emit('data', Buffer.from([1, 2, 3]))
  expect(transport.inWaiting()).toBe(3)
  transport.flushInput()
  expect(transport.inWaiting()).toBe(0)
  port.emit('data', Buffer.from([4]))
  await transport.drainInput(5, 50)
  expect(transport.peek().length).toBe(0)
})
