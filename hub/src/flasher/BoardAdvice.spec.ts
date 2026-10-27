import { nextStepFor } from './BoardAdvice'
import { BoardState } from './BoardListener'
import { RestartOutcome } from './FirmwareFlasher'

// "otherFirmware" is left out: the factory firmware cannot come back on a board that ran a checked install, so
// that is another board, and the install is the right offer (its own test below)
const STATES: BoardState[] = ["ready", "formatting", "busy", "restarting", "crashing", "tallyBusy", "twoHubs", "silent"]
const RESTARTS: RestartOutcome[] = ["restarted", "portClosed", "operator", "timeout"]
const installed = (restart: RestartOutcome = "restarted", checks = 1, more: { answered?: boolean, programmed?: boolean } = {}) => ({ path: "COM6", restart, checks, ...more })

describe("nextStepFor(): the same remedy is never offered twice for the same symptom", () => {
  test("after an install that was read back, no state and no restart leads to the same install", () => {
    for (const boardState of STATES) {
      for (const restart of RESTARTS) {
        for (const checks of [1, 2, 5]) {
          expect(nextStepFor({ boardState, recentInstall: installed(restart, checks) }).action).not.toBe("install")
          // nor once the board answered after it, with or without the light program back on it
          expect(nextStepFor({ boardState, recentInstall: installed(restart, checks, { answered: true }) }).action).not.toBe("install")
          expect(nextStepFor({ boardState, recentInstall: installed(restart, checks, { answered: true, programmed: true }) }).action).not.toBe("install")
        }
      }
    }
  })
  test("a board that keeps restarting after the install is sent to its wiring, cable, socket, then another board", () => {
    const next = nextStepFor({ boardState: "restarting", recentInstall: installed() })
    expect(next.action).toBe("hardware")
    expect(next.text).toContain("installing it again would not change anything")
    for (const step of ["LED wires", "another USB cable", "another USB socket", "plug in another board and press Check the other board"]) {
      expect(next.text).toContain(step)
    }
  })
  test("plugging the board in again is asked for once: the hardware step after it does not ask again", () => {
    const replug = nextStepFor({ boardState: "silent", recentInstall: installed("timeout", 1) })
    expect(replug.text).toContain("Unplug the board and plug it back in")
    for (const restart of RESTARTS) {
      for (const boardState of ["silent", "restarting", "crashing"] as BoardState[]) {
        const next = nextStepFor({ boardState, recentInstall: installed(restart, 2) })
        expect(next.action).toBe("hardware")
        expect(next.text).not.toContain("plug it back in")
      }
    }
  })
  test("a board that answered after the install and then stops: the LEDs and their power, not the install that erases the program again", () => {
    for (const boardState of ["silent", "restarting", "crashing"] as BoardState[]) {
      const next = nextStepFor({ boardState, recentInstall: installed("restarted", 3, { answered: true, programmed: true }) })
      expect(next.action).toBe("hardware")
      expect(next.text).toContain("This board answered after the firmware was installed")
      expect(next.text).toContain("once the light program went on")
      expect(next.text).toContain("Unplug the LED wires from the board and press Check again")
      expect(next.text).toContain("press Check the other board")
      expect(next.text).not.toMatch(/plug it back in|install the firmware/i)
    }
    // answered, but the program did not go on: the hub does not say it did
    expect(nextStepFor({ boardState: "restarting", recentInstall: installed("restarted", 2, { answered: true }) }).text).not.toContain("light program")
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
  test("crashing does not guess what crashed: crash text without a banner may well come from NodeMCU", () => {
    expect(nextStepFor({ boardState: "crashing" }).text).not.toMatch(/not the NodeMCU firmware|not NodeMCU/i)
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

test("a board from the box on the port of a finished install is taken for another board, and offered the install", () => {
  const next = nextStepFor({ boardState: "otherFirmware", recentInstall: { path: "COM6", restart: "restarted", checks: 2, answered: true, programmed: true } })
  expect(next.action).toBe("install")
  expect(next.text).toContain("another board")
  expect(next.text).not.toContain("would not change anything")
})
