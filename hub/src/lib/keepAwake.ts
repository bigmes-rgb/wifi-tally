import NoSleep from 'nosleep.js'

// One for the page: keeps a phone's screen on while it is a tally light. A browser allows it only from a tap, so the
// join page switches it on with its Start button, and the tally page offers a tap after a reload.
let noSleep: NoSleep | null = null
let on = false

export function keepAwake() {
  try {
    if (!noSleep) noSleep = new NoSleep()
    noSleep.enable()
    on = true
  } catch (e) {
    // a browser without the means: the page says to turn off auto-lock instead
  }
}

export function letSleep() {
  try { noSleep?.disable() } catch (e) { /* nothing to undo */ }
  on = false
}

export function isKeptAwake() {
  return on
}

// full screen as well, where the phone allows it (iPhones do not): the colour fills the screen
export function fullScreen() {
  try {
    const el = document.documentElement as any
    const request = el.requestFullscreen || el.webkitRequestFullscreen
    if (request && !document.fullscreenElement) request.call(el)?.catch?.(() => {})
  } catch (e) { /* stays a normal page */ }
}

// the name this phone joined as, so scanning again (or reopening the page) continues as the same tally
const KEY = "accTally.phoneName"
export function rememberedName(): string | null {
  try { return window.localStorage.getItem(KEY) } catch (e) { return null }
}
export function rememberName(name: string | null) {
  try {
    if (name) window.localStorage.setItem(KEY, name)
    else window.localStorage.removeItem(KEY)
  } catch (e) { /* a private window: it simply asks again */ }
}
