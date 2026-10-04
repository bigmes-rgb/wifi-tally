import os from 'os'

export type HubInfoType = {
  hostname: string
  addresses: string[]
  tallyPort: number
}

// private ranges first: that is where the tallies are
const rank = (ip: string) => {
  if (ip.startsWith("192.168.")) return 0
  if (ip.startsWith("10.")) return 1
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return 2
  if (ip.startsWith("169.254.")) return 9 // link-local: no DHCP, unlikely to be the church network
  return 5
}

// the IPv4 addresses other machines on the LAN could reach this hub on
export function listLanAddresses(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()): string[] {
  const addresses: string[] = []
  Object.values(interfaces).forEach(infos => {
    (infos || []).forEach(info => {
      // node < 18 reports the family as "IPv4", newer versions as 4
      const isV4 = info.family === "IPv4" || (info.family as unknown) === 4
      if (isV4 && !info.internal) {
        addresses.push(info.address)
      }
    })
  })
  return addresses.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

export function getHubInfo(tallyPort: number): HubInfoType {
  return {
    hostname: os.hostname(),
    addresses: listLanAddresses(),
    tallyPort,
  }
}
