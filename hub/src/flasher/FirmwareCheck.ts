// The tally software ships as .lc bytecode compiled for NodeMCU 3.0 with floating-point numbers,
// and it calls these firmware modules. A light running anything else would load nothing after an
// update, and sit dark in the booth. So the hub checks before it uploads.

export const REQUIRED_MODULES = ["file", "gpio", "net", "node", "pwm2", "tmr", "wifi", "ws2812"]

export type NumberType = "float" | "integer" | "unknown"

export interface FirmwareFacts {
  version?: string // "3.0.0"
  modules?: string | null // "file,gpio,..."; null on NodeMCU 1.x/2.x, which do not report them
  numberType: NumberType
}

// "print(1/2)" answers 0.5 on a float build and 0 on an integer build
export const numberTypeFrom = (answer: string | null | undefined): NumberType => {
  const text = (answer || "").trim()
  if (/^0\.5\b/.test(text)) return "float"
  if (/^0\b/.test(text)) return "integer"
  return "unknown"
}

// Says in words what is wrong with the light's firmware, or null when the tally software can run on it.
export function firmwareProblem(facts: FirmwareFacts): string | null {
  const major = parseInt((facts.version || "").split(".")[0], 10)
  if (!(major >= 3)) {
    return `This light runs NodeMCU ${facts.version || "of an unknown version"}; the tally software needs NodeMCU 3.0.`
  }
  if (facts.numberType === "integer") {
    return "This light runs the whole-number (integer) build of NodeMCU; the tally software needs the standard (float) build."
  }
  if (facts.modules) {
    const present = facts.modules.split(",").map(m => m.trim().toLowerCase())
    const missing = REQUIRED_MODULES.filter(m => !present.includes(m))
    if (missing.length > 0) {
      return `This light's firmware lacks ${missing.length === 1 ? "the module" : "the modules"} ${missing.join(", ")}, which the tally software needs.`
    }
  }
  return null
}
