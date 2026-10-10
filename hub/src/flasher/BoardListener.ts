import { OpenPort, defaultOpenPort } from './NodeSerialTransport'

// Listens to what a board prints on its serial port. When nothing answers the hub's Lua
// commands, this is the only way to tell "still starting up" from "keeps crashing" from
// "not running NodeMCU at all" from "silent".

export type BoardState =
  | "ready" // Lua answered with its prompt
  | "formatting" // NodeMCU's first start after installing: it formats its storage and answers nothing meanwhile
  | "busy" // NodeMCU started but did not give a prompt yet
  | "crashing" // exceptions or repeated restarts
  | "otherFirmware" // it prints, but not NodeMCU: a board from the box, or a damaged install
  | "silent" // nothing at all

export interface HeardFromBoard {
  text: string // printable, with unreadable bytes shown as "·"
  sawPrompt: boolean // the Lua prompt came back after a newline
  bytes: number
}

export interface ListenOptions {
  path: string
  ms: number // listen at most this long
  untilPrompt?: boolean // stop as soon as the Lua prompt shows
  pokeEveryMs?: number // send a newline this often, so a running Lua answers with its prompt
  openPort?: OpenPort
}

const MAX_KEEP = 8000

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

export function listenToBoard({ path, ms, untilPrompt = true, pokeEveryMs = 3000, openPort = defaultOpenPort }: ListenOptions): Promise<HeardFromBoard> {
  return new Promise(resolve => {
    const port = openPort(path, 115200)
    let raw = Buffer.alloc(0)
    let done = false
    let poker: ReturnType<typeof setInterval> | undefined
    let stopper: ReturnType<typeof setTimeout> | undefined

    const finish = () => {
      if (done) return
      done = true
      if (poker) clearInterval(poker)
      if (stopper) clearTimeout(stopper)
      port.removeAllListeners('data')
      const text = printable(raw)
      const result = { text, sawPrompt: hasPrompt(text), bytes: raw.length }
      if (port.isOpen) port.close(() => resolve(result))
      else resolve(result)
    }
    const poke = () => { if (port.isOpen) port.write(Buffer.from("\r\n"), () => {}) }

    port.on('data', (chunk: Buffer) => {
      raw = Buffer.concat([raw, chunk])
      if (raw.length > MAX_KEEP) raw = raw.subarray(raw.length - MAX_KEEP)
      if (untilPrompt && hasPrompt(printable(raw))) finish()
    })
    port.on('error', () => finish())
    port.open(err => {
      if (err) { finish(); return }
      poke()
      poker = setInterval(poke, pokeEveryMs)
      stopper = setTimeout(finish, ms)
    })
  })
}

// What the output says about the board, for someone holding it.
export function classifyBoardOutput(heard: HeardFromBoard): BoardState {
  const text = heard.text
  if (heard.sawPrompt) return "ready"
  if (/Formatting file system/i.test(text)) return "formatting"
  const crashes = (text.match(/Fatal exception|Exception \(\d+\)|stack>>>|wdt reset|rst cause:\s*[2-4]|NodeMCU \d+\.\d+/gi) || []).length
  if (crashes >= 2 || /Fatal exception|Exception \(\d+\)|stack>>>/i.test(text)) return "crashing"
  if (heard.bytes === 0) return "silent"
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
export function streamFromBoard({ path, ms, writeFirst, onText, stopWhen, openPort = defaultOpenPort, baudRate = 115200 }: StreamOptions) {
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
    port.on('error', () => finish())
    port.open(err => {
      if (err) { finish(); return }
      if (writeFirst) port.write(Buffer.from(writeFirst), () => {})
      timer = setTimeout(finish, ms)
    })
  })
  return { done, stop: () => stop() }
}
