import { adviceFor, readNetworkReport } from './NetworkCheck'

const boot = "[INFO]  booted because of SOFTWARE_RESTART\r\n"
const join = (ssid: string) => `[INFO]  Connect to WiFi ${ssid}\r\n`
const hub = ["192.168.1.10"]

test("a light that gets all the way says so", () => {
  const r = readNetworkReport(boot + join("Church") + "[INFO]  Connected to Church. Waiting for IP.\r\n[INFO]  Got IP 192.168.1.50\r\n[INFO]  Searching for hub by broadcast on port 7411\r\n[INFO]  Found hub at 192.168.1.10\r\n", hub)
  expect(r).toMatchObject({ stage: "found", ssid: "Church", ip: "192.168.1.50", hubIp: "192.168.1.10", associated: true })
  expect(r.problem).toBeUndefined()
})

test("a network it cannot see points at the name and 2.4 GHz", () => {
  const r = readNetworkReport(boot + join("Church5G") + "[ERROR] Got disconnected from Church5G. Reason NO_AP_FOUND\r\n", hub)
  expect(r.problem).toBe("noNetwork")
  expect(adviceFor(r, hub)).toContain("2.4 GHz")
})

test("a refused password says so", () => {
  const r = readNetworkReport(boot + join("Church") + "[ERROR] Got disconnected from Church. Reason AUTH_FAIL\r\n", hub)
  expect(r.problem).toBe("wrongPassword")
  expect(r.associated).toBe(false)
})

test("an address on another network is caught at once", () => {
  const r = readNetworkReport(boot + join("Guest") + "[INFO]  Connected to Guest. Waiting for IP.\r\n[INFO]  Got IP 10.0.0.23\r\n", hub)
  expect(r.problem).toBe("otherNetwork")
  expect(adviceFor(r, hub)).toContain("10.0.0.23")
})

test("on the right network but no hub after 20 seconds points at the firewall", () => {
  const text = boot + join("Church") + "[INFO]  Connected to Church. Waiting for IP.\r\n[INFO]  Got IP 192.168.1.50\r\n[INFO]  Searching for hub by broadcast on port 7411\r\n"
  expect(readNetworkReport(text, hub, 5).problem).toBeUndefined()
  const late = readNetworkReport(text, hub, 25)
  expect(late.problem).toBe("noHub")
  expect(adviceFor(late, hub)).toContain("Windows Firewall")
})

test("no settings file says to save them", () => {
  expect(readNetworkReport(boot + "[WARN]  Configuration file tally-settings.ini does not exist. Using defaults.\r\n").problem).toBe("noSettings")
})

test("a dropped connection that recovers is not a problem", () => {
  const r = readNetworkReport(boot + join("Church") + "[ERROR] Got disconnected from Church. Reason AUTH_EXPIRE\r\n" + join("Church") + "[INFO]  Connected to Church. Waiting for IP.\r\n", hub)
  expect(r.problem).toBeUndefined()
  expect(r.associated).toBe(true)
})
