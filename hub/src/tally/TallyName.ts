// What a light can be called: 1 to 26 characters (the light cuts longer names), no quotes or line breaks (the
// messages between light and hub put the name in quotes, one per line), no leading ";" (a comment in the light's
// settings file), and not a name another light already has. Returns what is wrong, in words, or null.
export function nameProblem(newName: unknown, taken: string[], current?: string): string | null {
  if (typeof newName !== "string" || newName.trim() === "") return "Type a name."
  if (newName !== newName.trim()) return "Remove the spaces at the start or end of the name."
  if (Buffer.byteLength(newName, "utf8") > 26) return "The name must be 26 characters or fewer."
  if (/["\r\n]/.test(newName)) return "The name cannot contain quotes."
  if (newName.startsWith(";")) return "The name cannot start with a semicolon."
  if (newName === current) return "That is the name it has."
  if (taken.includes(newName)) return `Another light is already called "${newName}".`
  return null
}
