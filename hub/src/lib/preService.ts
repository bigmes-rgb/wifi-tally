import Channel from '../domain/Channel'
import { Tally, UdpTally } from '../domain/Tally'
import { OtherHubType } from './HubInfo'
import { updatePlan } from './LightUpdates'

// The pre-service check: what must be true for the lights to do their job in a service, read from what the hub
// knows right now, and said in one line each. "fail" is something that stops a light from working, "warn" is
// something to look at, "ok" needs nothing.
export type FindingStatus = "ok" | "warn" | "fail"

export type Finding = {
  id: "switcher" | "lights" | "inputs" | "hubs" | "program" | "brightness"
  status: FindingStatus
  title: string
  detail?: string
  // the page offers a one-click fix for this
  action?: "full-brightness"
}

export type PreServiceInput = {
  mixerConnected: boolean
  mixerProblem?: string | null
  tallies: Tally[]
  channels: Channel[]
  otherHubs: OtherHubType[]
  programStamp?: string
  dimmer?: number
}

export const channelLabel = (channelId: string | undefined, channels: Channel[]): string => {
  if (channelId === undefined) return "no input"
  const channel = channels.find(c => c.id === channelId)
  return channel?.name || `Channel ${channelId}`
}

const names = (tallies: Tally[]) => tallies.map(t => t.name).sort((a, b) => a.localeCompare(b)).join(", ")
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

export function preServiceFindings(input: PreServiceInput): Finding[] {
  const findings: Finding[] = []
  const { tallies, channels } = input

  findings.push(input.mixerConnected
    ? { id: "switcher", status: "ok", title: "Switcher connected" }
    : { id: "switcher", status: "fail", title: "Switcher not connected", detail: input.mixerProblem || "The hub keeps trying on its own. Check that the switcher is on and its cable is in." })

  // the lights that matter for the service are the ones on an input
  const onInput = tallies.filter(t => t.isPatched())
  const offline = onInput.filter(t => !t.isConnected())
  if (onInput.length === 0) {
    findings.push({ id: "lights", status: "warn", title: "No light is on an input yet", detail: "Pick each light's input on its card." })
  } else if (offline.length > 0) {
    findings.push({ id: "lights", status: "fail", title: `${offline.length} of ${plural(onInput.length, "light")} not online`, detail: `${names(offline)}: check ${offline.length === 1 ? "its" : "their"} power and Wi-Fi.` })
  } else {
    findings.push({ id: "lights", status: "ok", title: onInput.length === 1 ? "The light is online" : `All ${onInput.length} lights online` })
  }

  // every light on its own input; a light that is on but on no input helps nobody
  const spare = tallies.filter(t => !t.isPatched() && t.isConnected())
  const byInput = new Map<string, Tally[]>()
  onInput.forEach(t => byInput.set(t.channelId as string, [...(byInput.get(t.channelId as string) || []), t]))
  const doubled = Array.from(byInput.entries()).filter(([, ts]) => ts.length > 1)
  if (doubled.length > 0) {
    findings.push({ id: "inputs", status: "warn", title: "Two lights on the same input", detail: doubled.map(([id, ts]) => `${names(ts)} are both on ${channelLabel(id, channels)}.`).join(" ") + " Meant? Then this is fine." })
  } else if (spare.length > 0) {
    findings.push({ id: "inputs", status: "warn", title: `${plural(spare.length, "light")} on no input`, detail: `${names(spare)} ${spare.length === 1 ? "is" : "are"} on but will show nothing. Pick an input on the card, or switch it off.` })
  } else if (onInput.length > 0) {
    findings.push({ id: "inputs", status: "ok", title: "Every light on its own input" })
  }

  findings.push(input.otherHubs.length > 0
    ? { id: "hubs", status: "fail", title: `Another ACC Tally is running on ${input.otherHubs.map(h => h.hostname).join(" and ")}`, detail: "Lights follow one hub only and go missing on the other. Close ACC Tally there." }
    : { id: "hubs", status: "ok", title: "Only this ACC Tally on the network" })

  if (input.programStamp) {
    const plan = updatePlan(tallies.filter(t => t instanceof UdpTally), input.programStamp)
    const behind = plan.behind.length + plan.needUsb.length
    findings.push(behind > 0
      ? { id: "program", status: "warn", title: `${plural(behind, "light")} on an older program`, detail: "They work; update them after the service, from the notice at the top of the page." }
      : { id: "program", status: "ok", title: "Lights on the current program" })
  }

  if (input.dimmer !== undefined && input.dimmer < 100) {
    findings.push({ id: "brightness", status: "warn", title: `Lights dimmed to ${input.dimmer}%`, detail: "Left over from an evening service? Set them back to full.", action: "full-brightness" })
  } else {
    findings.push({ id: "brightness", status: "ok", title: "Lights at full brightness" })
  }

  return findings
}

export type Verdict = { status: FindingStatus, title: string }

export function verdict(findings: Finding[]): Verdict {
  const fails = findings.filter(f => f.status === "fail").length
  const warns = findings.filter(f => f.status === "warn").length
  if (fails > 0) return { status: "fail", title: `${plural(fails, "thing")} to fix before the service` }
  if (warns > 0) return { status: "warn", title: `Ready, with ${plural(warns, "thing")} to look at` }
  return { status: "ok", title: "Ready for the service" }
}
