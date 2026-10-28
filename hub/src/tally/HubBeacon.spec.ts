import HubBeacon, { broadcastAddresses } from './HubBeacon'

const port = 40000 + Math.floor(Math.random() * 20000)
const loopback = () => ["127.0.0.1"]
const until = (check: () => boolean, ms = 3000) => new Promise<void>((resolve, reject) => {
  const started = Date.now()
  const timer = setInterval(() => {
    if (check()) { clearInterval(timer); resolve() }
    else if (Date.now() - started > ms) { clearInterval(timer); reject(new Error("did not happen in time")) }
  }, 20)
})

test("two hubs hear each other, and forget one that went quiet", async () => {
  // two ports: on one machine, two sockets on the same port would not both hear a packet
  const booth = new HubBeacon(port, "BOOTH-PC", 100, 400, loopback, port + 1)
  const laptop = new HubBeacon(port + 1, "LAPTOP", 100, 400, loopback, port)
  const boothSaw: any[] = []
  booth.on('change', others => boothSaw.push(others))
  booth.start()
  laptop.start()
  try {
    await until(() => booth.list().length === 1 && laptop.list().length === 1)
    expect(booth.list()).toEqual([{ address: "127.0.0.1", hostname: "LAPTOP" }])
    expect(laptop.list()).toEqual([{ address: "127.0.0.1", hostname: "BOOTH-PC" }])
    expect(boothSaw).toEqual([[{ address: "127.0.0.1", hostname: "LAPTOP" }]])
    laptop.stop()
    await until(() => booth.list().length === 0)
    expect(boothSaw[boothSaw.length - 1]).toEqual([])
  } finally {
    booth.stop()
    laptop.stop()
  }
})

test("a hub ignores its own announcement and anything else on the port", () => {
  const hub = new HubBeacon(port, "ME", 100, 400, loopback)
  const changes: any[] = []
  hub.on('change', o => changes.push(o))
  hub.hear(`vtally-hub "${hub.id}" "ME"`, "192.168.1.5")
  hub.hear("tally-ho \"Tally1\"", "192.168.1.20")
  expect(hub.list()).toEqual([])
  hub.hear('vtally-hub "abc" "OTHER"', "192.168.1.6")
  hub.hear('vtally-hub "abc" "OTHER"', "192.168.1.6") // heard again: no second change
  expect(hub.list()).toEqual([{ address: "192.168.1.6", hostname: "OTHER" }])
  expect(changes).toHaveLength(1)
})

test("broadcasts go to every network this computer is on", () => {
  const addresses = broadcastAddresses({
    "Ethernet": [{ address: "192.168.1.5", netmask: "255.255.255.0", family: "IPv4", internal: false } as any],
    "Wi-Fi": [{ address: "10.0.4.7", netmask: "255.255.252.0", family: "IPv4", internal: false } as any],
    "Loopback": [{ address: "127.0.0.1", netmask: "255.0.0.0", family: "IPv4", internal: true } as any],
  })
  expect(addresses).toEqual(["255.255.255.255", "192.168.1.255", "10.0.7.255"])
})
