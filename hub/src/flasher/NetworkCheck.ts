// Reads what a freshly configured light prints over USB while it joins the Wi-Fi and looks for
// the hub (see tally/src/my-wifi.lua and my-tally.lua), and says where it got to and why it
// stopped. Plugged into USB, a light can tell us what no amount of waiting at the hub can.

export type NetworkStage = "starting" | "joining" | "address" | "searching" | "found"

export type NetworkProblem =
  | "noSettings" // no tally-settings.ini on the light
  | "noNetwork" // the network was not found: wrong name, 5 GHz, out of range
  | "wrongPassword" // the network refused the password
  | "noAddress" // joined, but the router gave no address
  | "noHub" // on the network, but the hub does not answer (firewall, other network)
  | "otherNetwork" // its address is on a different network than any of this computer's

export interface NetworkReport {
  stage: NetworkStage
  ssid?: string
  associated: boolean // the network accepted the password at least once
  ip?: string
  hubIp?: string
  disconnectReason?: string // NodeMCU's name for it, e.g. NO_AP_FOUND
  problem?: NetworkProblem
}

const PASSWORD_REASONS = ["AUTH_FAIL", "4WAY_HANDSHAKE_TIMEOUT", "HANDSHAKE_TIMEOUT", "MIC_FAILURE", "802_1X_AUTH_FAILED", "AUTH_EXPIRE", "NOT_AUTHED"]

const sameSubnet = (a: string, b: string) => a.split(".").slice(0, 3).join(".") === b.split(".").slice(0, 3).join(".")

// secondsSinceAddress: how long the light has had an address without finding the hub
export function readNetworkReport(text: string, hubAddresses: string[] = [], secondsSinceAddress = 0): NetworkReport {
  const report: NetworkReport = { stage: "starting", associated: false }
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    let m: RegExpMatchArray | null
    if ((m = line.match(/Connect to WiFi (.+?)\s*$/))) { report.stage = "joining"; report.ssid = m[1] }
    else if ((m = line.match(/Connected to (.+?)\. Waiting for IP/))) { report.stage = "joining"; report.ssid = m[1]; report.associated = true; report.disconnectReason = undefined }
    else if ((m = line.match(/Got disconnected from .*?\. Reason (\S+)/))) { report.disconnectReason = m[1]; if (report.stage !== "found") report.stage = "joining" }
    else if ((m = line.match(/Got IP (\d+\.\d+\.\d+\.\d+)/))) { report.stage = "address"; report.ip = m[1]; report.associated = true; report.disconnectReason = undefined }
    else if (/Searching for hub by broadcast|Contacting hub on/.test(line)) { if (report.stage === "address") report.stage = "searching" }
    else if ((m = line.match(/Found hub at (\d+\.\d+\.\d+\.\d+)/))) { report.stage = "found"; report.hubIp = m[1] }
    else if (/Configuration file .* does not exist|Could not open settings file/.test(line)) { report.problem = "noSettings" }
  }

  if (report.stage === "found") { report.problem = undefined; return report }
  if (report.problem === "noSettings") return report
  if (report.disconnectReason && (report.stage === "joining" || report.stage === "starting")) {
    if (report.disconnectReason === "NO_AP_FOUND" || report.disconnectReason === "BEACON_TIMEOUT") report.problem = "noNetwork"
    else if (PASSWORD_REASONS.includes(report.disconnectReason)) report.problem = "wrongPassword"
  }
  if (/DHCP timeout/.test(text) && !report.ip) report.problem = "noAddress"
  if (report.ip && (report.stage === "address" || report.stage === "searching")) {
    if (hubAddresses.length > 0 && !hubAddresses.some(a => sameSubnet(a, report.ip as string))) report.problem = "otherNetwork"
    else if (secondsSinceAddress >= 20) report.problem = "noHub"
  }
  return report
}

// What to tell the person holding the light.
export function adviceFor(report: NetworkReport, hubAddresses: string[] = []): string | null {
  const net = report.ssid ? `"${report.ssid}"` : "the network"
  switch (report.problem) {
    case "noSettings": return "The light has no name or Wi-Fi saved. Go back to \"Name and Wi-Fi\" and save."
    case "noNetwork": return `The light cannot see ${net}. Check the name letter for letter (capitals count), and that it is a 2.4 GHz network: these boards cannot use 5 GHz. Then go back a step and save again.`
    case "wrongPassword": return `${net} refused the password. Check it and go back a step to save again. The network must use a plain password (WPA2-Personal), not a username and password.`
    case "noAddress": return `The light joined ${net} but the router gave it no address. The router may block new devices; ask whoever runs the network.`
    case "otherNetwork": return `The light got the address ${report.ip}, but this computer is on ${hubAddresses.join(", ")}. They are on different networks (a guest Wi-Fi?). Put the light on the network this computer uses.`
    case "noHub": return `The light is on ${net} with the address ${report.ip}, but the hub does not answer it. Usually Windows Firewall is blocking vTally: open "Allow an app through Windows Firewall", find vTally Hub and tick Private (and Public if the church network is marked Public).`
    default: return null
  }
}
