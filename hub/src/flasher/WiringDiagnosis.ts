import { Channel, HardwareProfile, LightProfile, Off, PINS, Rgb, Role } from './HardwareProfile'

// One thing the hub shows on the light and asks the person about.
export type WiringCheck = {
  id: string
  role: Role
  kind: "board" | "dark" | "colour" | "pixels"
  channel?: Channel // for "colour"
  blink?: boolean // blink the board's own LED while asking
  operator: Rgb
  stage: Rgb
  question: string
  answers: { id: string, label: string }[]
}

export type WiringAnswer = { checkId: string, answer: string }

export type Finding = {
  severity: "ok" | "fix" | "info"
  role: Role
  text: string
  // board pins the text names, so the wiring diagram can ring them
  pins?: string[]
  // when the hub can correct the profile itself
  fixPolarity?: "anode" | "cathode"
  fixOrder?: "grb" | "rgb"
  fixPixels?: number
}

const CHANNEL_NAME: Record<Channel, string> = { R: "red", G: "green", B: "blue" }
const roleName = (role: Role) => (role === "operator" ? "operator light" : "stage light")
const colour = (c: Channel): Rgb => [c === "R" ? 255 : 0, c === "G" ? 255 : 0, c === "B" ? 255 : 0]

const colourAnswers = [
  { id: "R", label: "Red" },
  { id: "G", label: "Green" },
  { id: "B", label: "Blue" },
  { id: "white", label: "White / several colours" },
  { id: "nothing", label: "Nothing" },
]

// the checks to run for one light, in order
export function checksFor(profile: HardwareProfile): WiringCheck[] {
  // first a control: proves the hub's commands reach a running tally program at all
  const checks: WiringCheck[] = [{
    id: "board-led", role: "operator", kind: "board", blink: true, operator: Off, stage: Off,
    question: "Look at the small LED next to the USB socket on the board. Is it blinking?",
    answers: [{ id: "yes", label: "Yes, it blinks" }, { id: "no", label: "No" }],
  }]
  const roles: Role[] = ["operator", "stage"]
  for (const role of roles) {
    const light: LightProfile = profile[role]
    if (light.kind === "none") continue
    const forRole = (rgb: Rgb) => (role === "operator" ? { operator: rgb, stage: Off } : { operator: Off, stage: rgb })
    checks.push({
      id: `${role}-dark`, role, kind: "dark", ...forRole(Off),
      question: `Everything should be off now. Is the ${roleName(role)} dark?`,
      answers: [{ id: "dark", label: "Yes, dark" }, { id: "lit", label: "No, it is lit" }],
    })
    for (const channel of ["R", "G", "B"] as Channel[]) {
      checks.push({
        id: `${role}-${channel}`, role, kind: "colour", channel, ...forRole(colour(channel)),
        question: `The ${roleName(role)} should be ${CHANNEL_NAME[channel]} now. What do you see?`,
        answers: colourAnswers,
      })
    }
    if (light.kind === "ws2812") {
      checks.push({
        id: `${role}-pixels`, role, kind: "pixels", ...forRole([255, 0, 0]),
        question: `All ${roleName(role)} pixels should be red. How many pixels are lit?`,
        answers: Array.from({ length: 11 }, (_, n) => ({ id: String(n), label: String(n) })),
      })
    }
  }
  return checks
}

// A strip that stays dark while the board follows the hub: the checks, most likely first.
function stripDarkAdvice(name: string): string {
  return `No pixel of the ${name} lit, although the board follows the hub. Check in this order: ` +
    `1) the wire from ${PINS.ws2812} goes to the strip's DIN pad, at the end its arrows point away from; ` +
    `2) the strip's GND goes to a GND pin on the board; 3) the strip's +5V goes to VU (on boards that have it) or VIN, and that pin has 5 V while USB is plugged in. ` +
    `4) Some strips ignore the board's 3.3 V signal while they run on 5 V. To test, move the strip's + wire from VIN to 3V3 and run the test again. ` +
    `If it lights then, put it back on VIN with a 1N4001 diode in that + wire (stripe towards the strip), or use a 74AHCT125 level shifter on the data wire.`
}

function pinFor(role: Role, channel: Channel): string {
  return PINS[role][channel]
}

// Turns the answers into plain-language findings. Pure: easy to test, nothing touches hardware.
export function diagnose(profile: HardwareProfile, checks: WiringCheck[], answers: WiringAnswer[]): Finding[] {
  const findings: Finding[] = []
  const answerFor = (id: string) => answers.find(a => a.checkId === id)?.answer
  const roles: Role[] = ["operator", "stage"]

  if (answerFor("board-led") === "no") {
    // nothing else means anything: the lights cannot follow commands that do not arrive
    return [{
      severity: "fix", role: "operator",
      text: "The board did not blink its own LED when the hub told it to, so the tally software is not running on it and no light can come on, however it is wired. Go back to \"Plug it in\" and install the tally software (or the firmware, if it asks for that), then run the test again.",
    }]
  }

  for (const role of roles) {
    const light = profile[role]
    if (light.kind === "none") continue
    const name = roleName(role)
    const roleChecks = checks.filter(c => c.role === role && c.kind !== "board")
    if (!roleChecks.every(c => answerFor(c.id) !== undefined)) {
      continue // not finished yet
    }

    const dark = answerFor(`${role}-dark`)
    const seen: Partial<Record<Channel, string>> = {}
    for (const channel of ["R", "G", "B"] as Channel[]) {
      seen[channel] = answerFor(`${role}-${channel}`)
    }
    const values = Object.values(seen)

    // lit when it should be dark, and dark-ish otherwise: the common pin is wired the other way round
    if (light.kind === "rgb" && dark === "lit" && values.every(v => v === "nothing" || v === "white")) {
      const fixPolarity = light.polarity === "anode" ? "cathode" : "anode"
      findings.push({
        severity: "fix", role, fixPolarity,
        text: `The ${name} is on when it should be off and off when it should be on. Its common pin is wired as common ${fixPolarity} (${fixPolarity === "cathode" ? "to GND" : "to 3V3"}); the hub will drive it that way from now on. Run the test again.`,
      })
      continue
    }
    if (values.every(v => v === "nothing")) {
      findings.push({
        severity: "fix", role,
        text: light.kind === "ws2812"
          ? stripDarkAdvice(name)
          : `The ${name} never lit. Check its common pin (${light.polarity === "anode" ? "to 3V3" : "to GND"}) and that the LED is not in backwards.`,
      })
      continue
    }
    if (dark === "lit") {
      findings.push({
        severity: "fix", role,
        text: `The ${name} is lit while everything should be off. One colour is probably stuck on: a short between a colour pin and ${light.polarity === "anode" ? "GND" : "3V3"}, or a solder bridge.`,
      })
    }

    if (light.kind === "rgb") {
      let allGood = true
      for (const channel of ["R", "G", "B"] as Channel[]) {
        const got = seen[channel]
        if (got === channel) continue
        allGood = false
        if (got === "nothing") {
          findings.push({ severity: "fix", role, pins: [pinFor(role, channel)], text: `The ${CHANNEL_NAME[channel]} of the ${name} never lit. Check the wire from ${pinFor(role, channel)} to the LED's ${CHANNEL_NAME[channel]} leg.` })
        } else if (got === "white") {
          findings.push({ severity: "fix", role, pins: [pinFor(role, channel)], text: `Several colours lit when only ${CHANNEL_NAME[channel]} should. Look for a solder bridge between ${pinFor(role, channel)} and its neighbours.` })
        } else {
          const wrong = got as Channel
          if (seen[wrong] === channel) {
            // the two legs are simply swapped: say it once, for the pair
            if (channel < wrong) {
              findings.push({ severity: "fix", role, pins: [pinFor(role, channel), pinFor(role, wrong)], text: `The ${CHANNEL_NAME[channel]} and ${CHANNEL_NAME[wrong]} legs of the ${name} are swapped. Swap the wires on ${pinFor(role, channel)} and ${pinFor(role, wrong)}.` })
            }
          } else {
            findings.push({ severity: "fix", role, pins: [pinFor(role, channel), pinFor(role, wrong)], text: `${pinFor(role, channel)} should drive ${CHANNEL_NAME[channel]} but lights the ${CHANNEL_NAME[wrong]} leg. Move that wire to ${pinFor(role, wrong)}.` })
          }
        }
      }
      if (allGood && dark !== "lit") {
        findings.push({ severity: "ok", role, text: `The ${name} is wired correctly.` })
      }
    } else {
      // ws2812: the order of the colours and the number of pixels
      const sawRed = seen.R, sawGreen = seen.G
      let orderFix: "grb" | "rgb" | undefined
      if (sawRed === "G" && sawGreen === "R") {
        orderFix = light.order === "grb" ? "rgb" : "grb"
        findings.push({ severity: "fix", role, fixOrder: orderFix, text: `The ${name} strip swaps red and green: it is a "${orderFix.toUpperCase()}" strip. The hub will send colours in that order from now on. Run the test again.` })
      } else if (sawRed !== "R" || sawGreen !== "G" || seen.B !== "B") {
        findings.push({ severity: "fix", role, text: `The ${name} strip shows the wrong colours. Check the strip type; most are GRB or RGB.` })
      }
      const lit = parseInt(answerFor(`${role}-pixels`) || "", 10)
      if (!isNaN(lit) && lit !== light.pixels) {
        if (lit === 0) {
          findings.push({
            severity: "fix", role, pins: [PINS.ws2812, "VIN", "GND"],
            text: stripDarkAdvice(name),
          })
        } else {
          findings.push({ severity: "fix", role, fixPixels: lit, text: `${lit} pixel${lit === 1 ? "" : "s"} lit, ${light.pixels} expected. The hub will use ${lit} from now on.` })
        }
      } else if (!orderFix && sawRed === "R" && sawGreen === "G" && seen.B === "B" && dark !== "lit") {
        findings.push({ severity: "ok", role, text: `The ${name} strip is wired correctly.` })
      }
    }
  }
  return findings
}

// applies the fixes the hub can make itself; returns the new profile
export function applyFixes(profile: HardwareProfile, findings: Finding[]): HardwareProfile {
  const next: HardwareProfile = JSON.parse(JSON.stringify(profile))
  for (const f of findings) {
    if (f.fixPolarity) next[f.role].polarity = f.fixPolarity
    if (f.fixOrder) next[f.role].order = f.fixOrder
    if (f.fixPixels !== undefined) next[f.role].pixels = f.fixPixels
  }
  return next
}

export function wiringPassed(findings: Finding[], profile: HardwareProfile): boolean {
  const roles = (["operator", "stage"] as Role[]).filter(r => profile[r].kind !== "none")
  return roles.every(role => findings.some(f => f.role === role && f.severity === "ok")) && !findings.some(f => f.severity === "fix")
}
