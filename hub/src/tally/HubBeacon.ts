import dgram from 'dgram'
import { EventEmitter } from 'events'
import os from 'os'
import { OtherHubType } from '../lib/HubInfo'

export const HUB_BEACON_PORT = 7412

type Heard = OtherHubType & { lastSeen: number }

// The addresses a broadcast reaches every machine on, one per network this computer is on. On Windows a packet to
// 255.255.255.255 leaves on one interface only, so each network's own broadcast address is used as well.
export function broadcastAddresses(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()): string[] {
  const addresses = new Set<string>(["255.255.255.255"])
  Object.values(interfaces).forEach(infos => (infos || []).forEach(info => {
    const isV4 = info.family === "IPv4" || (info.family as unknown) === 4
    if (!isV4 || info.internal || !info.netmask) return
    const ip = info.address.split(".").map(Number)
    const mask = info.netmask.split(".").map(Number)
    if (ip.length !== 4 || mask.length !== 4) return
    addresses.add(ip.map((octet, i) => (octet | (~mask[i] & 255)) & 255).join("."))
  }))
  return Array.from(addresses)
}

// Every hub says "here I am" on the network a few times a minute and listens for the others. A light follows the
// first hub that answers it and talks to that one only, so with two hubs running each light shows up on one hub
// and goes "missing" on the other, with no reason given. The pages warn as soon as a second hub is heard, and
// stop warning once it has been quiet for a while.
// Emits 'change' with the list of other hubs whenever one appears or goes away.
export default class HubBeacon extends EventEmitter {
  readonly id = Math.random().toString(36).slice(2) + Date.now().toString(36)
  private socket: dgram.Socket | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private heard = new Map<string, Heard>()

  constructor(
    private port = HUB_BEACON_PORT,
    private hostname = os.hostname(),
    private intervalMs = 3000,
    private staleMs = 12000,
    private targets: () => string[] = broadcastAddresses,
    // where the others listen: the same port, except in tests on one machine
    private targetPort = port,
  ) {
    super()
  }

  start() {
    if (this.socket) return
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    socket.on('error', e => console.warn(`Could not listen for other vTally hubs on port ${this.port}: ${e.message}`))
    socket.on('message', (msg, rinfo) => this.hear(msg.toString(), rinfo.address))
    socket.bind(this.port, () => {
      socket.setBroadcast(true)
      this.announce()
      this.timer = setInterval(() => this.announce(), this.intervalMs)
    })
    this.socket = socket
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.socket) this.socket.close()
    this.socket = null
  }

  // the other hubs heard lately, nearest address first
  list(): OtherHubType[] {
    return Array.from(this.heard.values()).sort((a, b) => a.address.localeCompare(b.address))
      .map(({ address, hostname }) => ({ address, hostname }))
  }

  private announce() {
    const message = Buffer.from(`vtally-hub "${this.id}" "${this.hostname.replace(/"/g, "'")}"`)
    this.targets().forEach(target => {
      // a network that refuses the broadcast (no route, say) must not stop the others
      this.socket?.send(message, this.targetPort, target, () => {})
    })
    this.forget()
  }

  // what came in on the beacon port: our own announcement comes back too and is ignored
  hear(text: string, address: string) {
    const m = text.match(/^vtally-hub "([^"]+)" "([^"]*)"\s*$/)
    if (!m || m[1] === this.id) return
    const known = this.heard.get(address)
    this.heard.set(address, { address, hostname: m[2], lastSeen: Date.now() })
    if (!known || known.hostname !== m[2]) this.emit('change', this.list())
  }

  private forget() {
    const now = Date.now()
    let gone = false
    this.heard.forEach((hub, address) => {
      if (now - hub.lastSeen > this.staleMs) { this.heard.delete(address); gone = true }
    })
    if (gone) this.emit('change', this.list())
  }
}
