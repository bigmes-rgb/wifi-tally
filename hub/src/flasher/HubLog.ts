// Small helpers for the hub's own log (main.log in the Windows app), so that one file tells what happened to a
// board: what the hub did, what the board printed, what the page told the operator. Every line is bounded, and a
// board that keeps restarting must not fill the log.

export const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`

// a Wi-Fi password never goes into the log, whatever printed it
export const redact = (text: string) => text.replace(/(password\s*[=:]\s*)[^\r\n]*/gi, "$1•••")

// why node-serialport closed a port: it passes an error with disconnected=true when a read failed, which is what
// an unplugged board (or Windows dropping the port) looks like
export const portClosedReason = (err?: { message?: string, disconnected?: boolean } | null) =>
  err ? `: ${err.message || err}${err.disconnected ? " (the board is gone: unplugged, or Windows dropped the port)" : ""}` : " (no reason given)"

// The same warning at most once a minute: a port that fails over and over says so once.
const lastWarned = new Map<string, number>()
export function warnRarely(line: string, now = Date.now()) {
  const before = lastWarned.get(line)
  if (before !== undefined && now - before < 60000) return
  lastWarned.set(line, now)
  if (lastWarned.size > 50) lastWarned.delete(lastWarned.keys().next().value)
  console.warn(line)
}

export const OUTPUT_CHARS = 1500 // what the page shows under "What the board printed", too
const OUTPUT_LINES = 40
const LINE_CHARS = 160

// the end of what a board printed, as indented lines under the line that explains it
export function outputBlock(text: string, chars = OUTPUT_CHARS): string {
  const tail = redact(text.slice(-chars)).replace(/\r\n?/g, "\n").replace(/\n+$/, "")
  let lines = tail.split("\n").map(l => (l.length > LINE_CHARS ? `${l.slice(0, LINE_CHARS)}…` : l))
  if (lines.length > OUTPUT_LINES) lines = ["…", ...lines.slice(-OUTPUT_LINES)]
  return lines.map(l => `  | ${l}`).join("\n")
}

const clock = (at: number) => new Date(at).toTimeString().slice(0, 8)

// What a board printed during a check, written once. A board that restarts over and over prints the same lines
// each time, only cut at different places: when the same lines come from the same port within ten minutes, the
// log points back to where it showed them instead of showing them again.
export class BoardOutputLog {
  private last = new Map<string, { lines: string, at: number }>()
  constructor(private now = () => Date.now()) {}

  write(path: string, text: string) {
    const all = redact(text.slice(-OUTPUT_CHARS)).split(/\r\n?|\n/)
    // the first and last line may be cut off in the middle; the lines in between say what the board printed
    const lines = [...new Set(all.slice(1, -1).map(l => l.trim()).filter(Boolean))].sort().join("\n")
    const before = this.last.get(path)
    const t = this.now()
    if (before && lines && before.lines === lines && t - before.at < 10 * 60 * 1000) {
      console.info(`[board ${path}] printed the same lines as at ${clock(before.at)}`)
      return
    }
    this.last.set(path, { lines, at: t })
    console.info(`[board ${path}] printed (the last ${Math.min(text.length, OUTPUT_CHARS)} characters):\n${outputBlock(text)}`)
  }
}
