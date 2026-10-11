import { OpenPort, SerialPortLike } from './NodeSerialTransport'
import { portClosedReason, warnRarely } from './HubLog'

// Listens to what a board prints on its serial port. When nothing answers the hub's Lua
// commands, this is the only way to tell "still starting up" from "keeps crashing" from
// "not running NodeMCU at all" from "silent".

export type BoardState =
  | "ready" // Lua answered with its prompt
  | "formatting" // NodeMCU's first start after installing: it formats its storage and answers nothing meanwhile
  | "busy" // NodeMCU started but did not give a prompt yet
  | "restarting" // NodeMCU starts, then something restarts it: the program on it, its settings, its power, a person
  | "crashing" // crash text from something that is not NodeMCU
  | "otherFirmware" // it prints, but not NodeMCU: a board from the box, or a damaged install
  | "tallyBusy" // the tally software is running and logging, too busy to answer in time
  | "twoHubs" // the tally software hears a hub at two addresses and keeps switching
  | "silent" // nothing at all

export interface HeardFromBoard {
  text: string // printable, with unreadable bytes shown as "·"
  sawPrompt: boolean // the Lua prompt came back after a newline
  bytes: number
  // the port closed before the time was up, or could not be opened: unplugged, or dropped by Windows
  closed?: boolean
}

export interface ListenOptions {
  path: string
  ms: number // listen at most this long
  untilPrompt?: boolean // stop as soon as the Lua prompt shows
  pokeEveryMs?: number // send a newline this often, so a running Lua answers with its prompt
  openPort?: OpenPort
}

const MAX_KEEP = 8000

// Ports the hub opens only to listen leave the board's reset and FLASH lines alone. node-serialport's default
// (hupcl) switches DTR on when it opens a port on Windows, and on NodeMCU's auto-reset circuit DTR alone holds
// GPIO0, the FLASH pin, low: pressing RST then started the chip's flashing mode instead of NodeMCU, and the board
// looked silent. hupcl:false keeps DTR off from the start; the explicit set() switches both off on every system,
// because set() switches on whatever it is not told.
export const openToListen: OpenPort = (path, baudRate) => {
  const SerialPort = require('serialport')
  return new SerialPort(path, { baudRate, autoOpen: false, hupcl: false })
}
export const releaseResetLines = (port: SerialPortLike) => port.set({ dtr: false, rts: false }, () => {})

export const printable = (buf: Buffer): string => {
  let out = ""
  for (const b of buf) {
    if (b === 10 || b === 13 || b === 9 || (b >= 32 && b < 127)) out += String.fromCharCode(b)
    else if (!out.endsWith("·")) out += "·"
  }
  return out
}

// the Lua prompt: ">" at the start of a line, followed by a space or the end of what arrived
export const hasPrompt = (text: string) => /(^|[\r\n])>( |$)/.test(text)

export function listenToBoard({ path, ms, untilPrompt = true, pokeEveryMs = 3000, openPort = openToListen }: ListenOptions): Promise<HeardFromBoard> {
  return new Promise(resolve => {
    const port = openPort(path, 115200)
    let raw = Buffer.alloc(0)
    let done = false
    let closed = false
    let poker: ReturnType<typeof setInterval> | undefined
    let stopper: ReturnType<typeof setTimeout> | undefined

    const finish = () => {
      if (done) return
      done = true
      if (poker) clearInterval(poker)
      if (stopper) clearTimeout(stopper)
      port.removeAllListeners('data')
      const text = printable(raw)
      const result: HeardFromBoard = { text, sawPrompt: hasPrompt(text), bytes: raw.length, ...(closed ? { closed } : {}) }
      if (port.isOpen) port.close(() => resolve(result))
      else resolve(result)
    }
    const poke = () => { if (port.isOpen) port.write(Buffer.from("\r\n"), () => {}) }
    // a port that goes away while the hub listens: the board was unplugged (which restarts it) or Windows dropped it
    const lost = (why: string, gone = true) => { if (done) return; warnRarely(`[serial ${path}] ${why}`); closed = gone; finish() }

    port.on('data', (chunk: Buffer) => {
      raw = Buffer.concat([raw, chunk])
      if (raw.length > MAX_KEEP) raw = raw.subarray(raw.length - MAX_KEEP)
      if (untilPrompt && hasPrompt(printable(raw))) finish()
    })
    port.on('error', (e: Error) => lost(`port error: ${e.message}`, !port.isOpen))
    port.on('close', (err?: any) => lost(`port closed${portClosedReason(err)}`))
    port.open(err => {
      if (err) { lost(`could not open the port: ${err.message}`); return }
      releaseResetLines(port)
      poke()
      poker = setInterval(poke, pokeEveryMs)
      stopper = setTimeout(finish, ms)
    })
  })
}

// the hub addresses a tally logged with "Found hub at ...", in the order first seen
export const hubAddressesIn = (text: string): string[] => {
  const found: string[] = []
  for (const m of text.matchAll(/Found hub at (\d+\.\d+\.\d+\.\d+)/g)) {
    if (!found.includes(m[1])) found.push(m[1])
  }
  return found
}

// What the output says about the board, for someone holding it.
export function classifyBoardOutput(heard: HeardFromBoard): BoardState {
  const text = heard.text
  if (heard.sawPrompt) return "ready"
  if (/Formatting file system/i.test(text)) return "formatting"
  // the dots NodeMCU prints while it formats, for a listen that began after its "Formatting" line
  if (/^[.\s]*\.{3,}[.\s]*$/.test(text)) return "formatting"
  // NodeMCU prints its banner only once it is up, file system included. Two of them mean the firmware works and
  // something restarted the board, which installing the same firmware cannot change.
  const starts = (text.match(/NodeMCU (\d+\.\d+|custom build)/gi) || []).length
  const crashText = /Fatal exception|Exception \(\d+\)|stack>>>|PANIC:/i
  if (starts >= 2 || (starts === 1 && crashText.test(text))) return "restarting"
  const crashes = (text.match(/Fatal exception|Exception \(\d+\)|stack>>>|wdt reset|rst cause:\s*[2-4]/gi) || []).length
  if (crashes >= 2 || crashText.test(text)) return "crashing"
  if (heard.bytes === 0) return "silent"
  if (hubAddressesIn(text).length >= 2) return "twoHubs"
  if (/\[(INFO|WARN|ERROR)\]/.test(text)) return "tallyBusy"
  if (/NodeMCU/.test(text)) return "busy"
  return "otherFirmware"
}

export interface StreamOptions {
  path: string
  ms: number // stop after this long at most
  writeFirst?: string // sent once the port is open, e.g. a restart command
  onText: (text: string) => void // every printable chunk as it arrives
  stopWhen?: (allText: string) => boolean
  openPort?: OpenPort
  baudRate?: number // 115200 for NodeMCU; 74880 for the chip's own start-up message
}

// Passes along what a board prints, live, until stopWhen says so, time runs out, or stop() is called.
export function streamFromBoard({ path, ms, writeFirst, onText, stopWhen, openPort = openToListen, baudRate = 115200 }: StreamOptions) {
  let stop: () => void = () => {}
  const done = new Promise<string>(resolve => {
    const port = openPort(path, baudRate)
    let all = ""
    let finished = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      if (finished) return
      finished = true
      if (timer) clearTimeout(timer)
      port.removeAllListeners('data')
      if (port.isOpen) port.close(() => resolve(all))
      else resolve(all)
    }
    stop = finish
    port.on('data', (chunk: Buffer) => {
      const text = printable(chunk)
      all += text
      if (all.length > 20000) all = all.slice(-20000)
      onText(text)
      if (stopWhen && stopWhen(all)) finish()
    })
    const lost = (why: string) => { if (!finished) warnRarely(`[serial ${path}] ${why}`); finish() }
    port.on('error', (e: Error) => lost(`port error: ${e.message}`))
    port.on('close', (err?: any) => lost(`port closed${portClosedReason(err)}`))
    port.open(err => {
      if (err) { lost(`could not open the port: ${err.message}`); return }
      releaseResetLines(port)
      if (writeFirst) port.write(Buffer.from(writeFirst), () => {})
      timer = setTimeout(finish, ms)
    })
  })
  return { done, stop: () => stop() }
}
