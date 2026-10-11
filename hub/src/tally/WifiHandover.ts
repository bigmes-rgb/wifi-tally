// What a light can join: a network name of 1 to 32 bytes, and no password (an open network) or a
// WPA2 password of 8 to 63 characters. Checked before anything is sent, so no light saves a network
// it could never join. Returns what is wrong, in words for the person, or null.
export function wifiProblem(ssid: unknown, password: unknown): string | null {
  if (typeof ssid !== "string" || typeof password !== "string") return "Type the network name and password."
  const ssidBytes = Buffer.byteLength(ssid, "utf8")
  if (ssid.trim() === "" || ssidBytes > 32) return "The network name must be 1 to 32 characters."
  if (ssid !== ssid.trim() || password !== password.trim()) return "Remove the spaces at the start or end of the name or password."
  if (password.length > 0 && (password.length < 8 || password.length > 63)) return "A Wi-Fi password has 8 to 63 characters (or none, for an open network)."
  return null
}
