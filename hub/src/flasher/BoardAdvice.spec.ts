import { nextStepFor } from './BoardAdvice'
import { BoardState } from './BoardListener'
import { RestartOutcome } from './FirmwareFlasher'

const STATES: BoardState[] = ["ready", "formatting", "busy", "restarting", "crashing", "otherFirmware", "tallyBusy", "twoHubs", "silent"]
const RESTARTS: RestartOutcome[] = ["restarted", "portClosed", "operator", "timeout"]
const installed = (restart: RestartOutcome = "restarted", checks = 1) => ({ path: "COM6", restart, checks })

describe("nextStepFor(): the same remedy is never offered twice for the same symptom", () => {
  test("after an install that was read back, no state and no restart leads to the same install", () => {
    for (const boardState of STATES) {
      for (const restart of RESTARTS) {
        for (const checks of [1, 2, 5]) {
          expect(nextStepFor({ boardState, recentInstall: installed(restart, checks) }).action).not.toBe("install")
        }
      }
    }
  })
  test("a board that keeps restarting after the install is sent to its power, cable, wiring, then another board", () => {
    const next = nextStepFor({ boardState: "restarting", recentInstall: installed() })
    expect(next.action).toBe("hardware")
    expect(next.text).toContain("installing it again would not change anything")
    for (const step of ["Unplug the board and plug it back in", "LED wires", "another USB cable", "another USB socket", "use another board"]) {
      expect(next.text).toContain(step)
    }
  })
  test("silent after an install whose restart was not seen: unplug and plug back in once, then the hardware", () => {
    expect(nextStepFor({ boardState: "silent", recentInstall: installed("timeout", 1) }).action).toBe("replug")
    expect(nextStepFor({ boardState: "silent", recentInstall: installed("timeout", 2) }).action).toBe("hardware")
    // it was unplugged already during the install: not asked again
    expect(nextStepFor({ boardState: "silent", recentInstall: installed("portClosed", 1) }).action).toBe("hardware")
  })
  test("starting up and busy are worth a look again, before and after an install", () => {
    for (const boardState of ["formatting", "busy", "tallyBusy", "twoHubs"] as BoardState[]) {
      expect(nextStepFor({ boardState }).action).toBe("check")
      expect(nextStepFor({ boardState, recentInstall: installed() }).action).toBe("check")
    }
  })
})

describe("a board this hub has not just installed", () => {
  test("is offered the install", () => {
    for (const boardState of [undefined, "silent", "restarting", "crashing", "otherFirmware"] as (BoardState | undefined)[]) {
      expect(nextStepFor({ boardState }).action).toBe("install")
    }
  })
  test("restarting says the firmware works, names what restarts it, and that the install clears the program", () => {
    const text = nextStepFor({ boardState: "restarting" }).text
    expect(text).toContain("The NodeMCU firmware is on this board and starts")
    expect(text).toContain("light program on it or its settings")
    expect(text).toContain("it erases the board first, which clears the program")
  })
  test("crashing never says the install was not clean, and never 'again'", () => {
    const text = nextStepFor({ boardState: "crashing" }).text
    expect(text).toContain("keeps crashing")
    expect(text).not.toMatch(/did not install cleanly|again/i)
  })
})

test("no advice contradicts the hub's own check that the firmware was read back correctly", () => {
  for (const boardState of STATES) {
    for (const restart of RESTARTS) {
      const text = nextStepFor({ boardState, recentInstall: installed(restart) }).text
      expect(text).not.toMatch(/did not install|damaged|install it again|install the firmware/i)
    }
  }
})
