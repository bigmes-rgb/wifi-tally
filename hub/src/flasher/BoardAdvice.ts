import type { BoardState } from './BoardListener'
import type { RecentInstall } from './TallyDevice'

// What to tell someone holding a board that does not answer, from what it printed and from what the hub did to it
// last. The page shows it, and the hub log writes down what the page showed.
//
// The rule: never offer the same remedy for the same symptom twice. The install erases the whole board and reads
// the firmware back, so after one that was read back correctly, installing it again cannot change anything, and a
// board that still does not start needs a different step: plugging it in again (once), then its LED wiring, cable,
// socket and power, then another board. The same holds once the board has answered after the install and then
// stops again, typically when the light program switches on the Wi-Fi and the LEDs: the program came back with
// "Install now", so erasing it again would only go round.
export type NextAction =
  | "install" // put the NodeMCU firmware on it
  | "check" // it is starting or busy: look again
  | "replug" // the firmware is on it, but the board has not started it: unplug and plug back in, then look again
  | "hardware" // installing cannot help: its power, its cable, what is wired to it, or the board itself

export type NextStep = { action: NextAction, severity: "info" | "warning" | "error", text: string }

const WAIT: Partial<Record<BoardState, NextStep>> = {
  ready: { action: "check", severity: "info", text: "The board answers." },
  formatting: { action: "check", severity: "info", text: "The firmware is installed. The board is setting up its storage for the first time and answers nothing until it is done. Leave it plugged in, wait a minute, then check again." },
  busy: { action: "check", severity: "info", text: "The NodeMCU firmware is running but has not answered yet. Wait a few seconds and check again." },
  tallyBusy: { action: "check", severity: "info", text: "The tally software is running on it (it is printing its log) but did not answer in time. Press Check again." },
  twoHubs: { action: "check", severity: "warning", text: "The light is on the Wi-Fi but hears a vTally hub at two addresses, and switches between them so fast that it cannot answer." },
}

// a board this hub has not just installed
const BEFORE_INSTALL: Partial<Record<BoardState, NextStep>> = {
  silent: { action: "install", severity: "warning", text: "The board is not saying anything. Unplug it and plug it back in, or press its RST button once (do not hold FLASH), and check again. If it stays silent, install the firmware; it takes one to two minutes." },
  restarting: { action: "install", severity: "error", text: "The NodeMCU firmware is on this board and starts, but something restarts it over and over: usually the light program on it or its settings, sometimes its power or someone pressing RST. Install the firmware: it erases the board first, which clears the program and its settings, then puts a fresh NodeMCU on it. It takes one to two minutes." },
  crashing: { action: "install", severity: "error", text: "The board keeps crashing and restarting. Install the firmware: it erases the board first, which clears the program and settings on it, then puts a fresh NodeMCU on it. It takes one to two minutes." },
  otherFirmware: { action: "install", severity: "warning", text: "The board runs something other than the NodeMCU firmware, as boards straight from the box do. Install the firmware; it takes one to two minutes." },
}
const FROM_THE_BOX: NextStep = { action: "install", severity: "warning", text: "A board straight from the box needs the NodeMCU firmware first; this takes one to two minutes." }

const SYMPTOM: Partial<Record<BoardState, string>> = {
  silent: "says nothing",
  restarting: "starts NodeMCU and then restarts, over and over",
  crashing: "keeps crashing",
  otherFirmware: "does not start NodeMCU",
}

// the last rung, with the button that says so: the hub cannot tell one board from another until it answers
export const ANOTHER_BOARD = "If nothing helps, plug in another board and press Check the other board."

export function nextStepFor(device: { boardState?: BoardState, recentInstall?: RecentInstall }): NextStep {
  const state = device.boardState
  if (state && WAIT[state]) return WAIT[state]
  const install = device.recentInstall
  if (!install) return (state && BEFORE_INSTALL[state]) || FROM_THE_BOX
  const symptom = SYMPTOM[state] || "does not answer"
  if (install.answered) {
    return {
      action: "hardware",
      severity: "error",
      text: `This board answered after the firmware was installed on ${install.path} and read back correctly, so the firmware works, and installing it again would not change anything. Now it ${symptom}. ` +
        (install.programmed
          ? "That began once the light program went on. The program switches on the Wi-Fi and the LEDs, which need more power than the board alone. "
          : "That usually comes from its power or from what is connected to it. ") +
        "Unplug the LED wires from the board and press Check again. If it answers then, check the LED wires against the wiring diagram, and plug the board into another USB socket on the computer. " +
        "If it still does not answer, use another USB cable. " + ANOTHER_BOARD,
    }
  }
  const installed = `The firmware was installed on ${install.path} and read back correctly`
  if (state === "silent" && install.restart === "timeout" && install.checks <= 1) {
    return { action: "replug", severity: "warning", text: `${installed}, but the hub has not heard the board start it. Unplug the board and plug it back in, then press Check again.` }
  }
  // Plugging it in again was asked for already (the restart card, the first-start box, the step above), or the board
  // has restarted since the install anyway: not asked once more.
  return {
    action: "hardware",
    severity: "error",
    text: `${installed} (the board was erased first), so installing it again would not change anything. The board still ${symptom}: that comes from its power or from what is connected to it. ` +
      "Unplug the LED wires from the board, use another USB cable and another USB socket on the computer, and press Check again. " + ANOTHER_BOARD,
  }
}
