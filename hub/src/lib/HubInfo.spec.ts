import { listLanAddresses } from './HubInfo'

const iface = (address: string, family: any = "IPv4", internal = false) => ({
  address, family, internal, netmask: "255.255.255.0", mac: "00:00:00:00:00:00", cidr: null,
})

test("it lists only external IPv4 addresses, private ranges first", () => {
  const addresses = listLanAddresses({
    lo: [iface("127.0.0.1", "IPv4", true), iface("::1", "IPv6", true)],
    wifi: [iface("192.168.1.42"), iface("fe80::1", "IPv6")],
    vpn: [iface("10.8.0.3")],
    docker: [iface("172.17.0.1")],
    dead: [iface("169.254.10.10")],
    weird: [iface("8.8.8.8")],
  })
  expect(addresses).toEqual(["192.168.1.42", "10.8.0.3", "172.17.0.1", "8.8.8.8", "169.254.10.10"])
})

test("it accepts the numeric family newer node versions report", () => {
  expect(listLanAddresses({ eth: [iface("192.168.0.5", 4)] })).toEqual(["192.168.0.5"])
})

test("it copes with an interface without entries", () => {
  expect(listLanAddresses({ eth: undefined })).toEqual([])
})
