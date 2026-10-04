import { Channel, HardwareProfile, LightProfile, Off, PINS, Rgb, Role } from './HardwareProfile'

// One thing the hub shows on the light and asks the person about.
export type WiringCheck = {
  id: string
  role: Role
  kind: "dark" | "colour" | "pixels"
  channel?: Channel // for "colour"
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
  const checks: WiringCheck[] = []
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

function pinFor(role: Role, channel: Channel): string {
  return PINS[role][channel]
}

// Turns the answers into plain-language findings. Pure: easy to test, nothing touches hardware.
export function diagnose(profile: HardwareProfile, checks: WiringCheck[], answers: WiringAnswer[]): Finding[] {
  const findings: Finding[] = []
  const answerFor = (id: string) => answers.find(a => a.checkId === id)?.answer
  const roles: Role[] = ["operator", "stage"]

  for (const role of roles) {
    const light = profile[role]
    if (light.kind === "none") continue
    const name = roleName(role)
    const roleChecks = checks.filter(c => c.role === role)
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
          ? `The ${name} never lit. Check that the strip's data wire is on ${PINS.ws2812}, its + on VIN (5 V) and its − on GND, and that the first pixel's arrow points away from the board.`
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
          findings.push({ severity: "fix", role, text: `The ${CHANNEL_NAME[channel]} of the ${name} never lit. Check the wire from ${pinFor(role, channel)} to the LED's ${CHANNEL_NAME[channel]} leg.` })
        } else if (got === "white") {
          findings.push({ severity: "fix", role, text: `Several colours lit when only ${CHANNEL_NAME[channel]} should. Look for a solder bridge between ${pinFor(role, channel)} and its neighbours.` })
        } else {
          const wrong = got as Channel
          if (seen[wrong] === channel) {
            // the two legs are simply swapped: say it once, for the pair
            if (channel < wrong) {
              findings.push({ severity: "fix", role, text: `The ${CHANNEL_NAME[channel]} and ${CHANNEL_NAME[wrong]} legs of the ${name} are swapped. Swap the wires on ${pinFor(role, channel)} and ${pinFor(role, wrong)}.` })
            }
          } else {
            findings.push({ severity: "fix", role, text: `${pinFor(role, channel)} should drive ${CHANNEL_NAME[channel]} but lights the ${CHANNEL_NAME[wrong]} leg. Move that wire to ${pinFor(role, wrong)}.` })
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
          findings.push({ severity: "fix", role, text: `No pixel lit for the ${name}. Check the data wire on ${PINS.ws2812} and the strip's power.` })
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
