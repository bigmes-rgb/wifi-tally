import { Tally, UdpTally } from '../domain/Tally'

// Which lights can take the hub's current program over the network (see tally/src/my-update.lua), which already
// run it, and which must be brought to the computer once: a light that does not say which build it runs
// predates the update over the network and does not understand it.
export type UpdatePlan = {
  behind: string[] // run an older build, or run from their files: an update is offered
  current: string[]
  needUsb: string[]
}

export function updatePlan(tallies: Tally[], hubStamp: string | undefined): UpdatePlan {
  const plan: UpdatePlan = { behind: [], current: [], needUsb: [] }
  if (!hubStamp) return plan
  tallies.forEach(tally => {
    if (!(tally instanceof UdpTally) || !tally.isConnected()) return
    if (tally.program === undefined) plan.needUsb.push(tally.name)
    else if (tally.program === hubStamp) plan.current.push(tally.name)
    else plan.behind.push(tally.name)
  })
  const byName = (a: string, b: string) => a.localeCompare(b)
  plan.behind.sort(byName); plan.current.sort(byName); plan.needUsb.sort(byName)
  return plan
}

// The address the light fetches from: this computer's address on the light's own network, when it has one
// there (a computer on two networks has two), else its first address.
export function hubAddressFor(lightAddress: string | undefined, hubAddresses: string[]): string | undefined {
  if (hubAddresses.length === 0) return undefined
  if (lightAddress) {
    const subnet = lightAddress.split(".").slice(0, 3).join(".")
    const same = hubAddresses.find(a => a.split(".").slice(0, 3).join(".") === subnet)
    if (same) return same
  }
  return hubAddresses[0]
}
