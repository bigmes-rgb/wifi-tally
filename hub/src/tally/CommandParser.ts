import Log from "../domain/Log"

export type TallyHoCommand = {
  command: "tally-ho"
  tallyName: string
  // the build the light runs (see tally/src/init.lua): 16 hex characters, "files" when it runs from its files, and
  // left out by lights from before 0.9.24, which cannot be updated over the network
  program?: string
}

export type LogCommand = {
  command: "log"
  tallyName: string
  log: Log
}

// a light's answer to a new Wi-Fi sent by the hub
export type WifiAnswerCommand = {
  command: "wifi-answer"
  tallyName: string
  saved: boolean // "wifi-saved"; "wifi-failed" when the light could not save it
}

// a light's answer to a new name sent by the hub: it answers under its old name, then restarts under the new one
export type NameAnswerCommand = {
  command: "name-answer"
  tallyName: string
  newName: string
  saved: boolean // "name-saved"; "name-failed" when the light could not save it
}

// a light's answer to a new program offered by the hub (see tally/src/my-update.lua)
export type UpdateAnswerCommand = {
  command: "update-answer"
  tallyName: string
  stamp: string
  outcome: "saved" | "failed" | "done" // saved: fetched, restarting into it; done: already runs it
}

export type TallySentCommand = TallyHoCommand | LogCommand | WifiAnswerCommand | NameAnswerCommand | UpdateAnswerCommand

export class InvalidCommandError extends Error {
  constructor(...args) {
      super(...args)

      this.message = `Received an invalid command: "${this.message}"`
  }
}

class TallyCommandParser {
  parse(msg: string): TallySentCommand {
    if (msg.startsWith("tally-ho ")) {
        return this.parseTallyHo(msg)
    } else if (msg.startsWith("log ")) {
        return this.parseLog(msg)
    } else if (msg.startsWith("wifi-saved ") || msg.startsWith("wifi-failed ")) {
        const result = msg.match(/^(wifi-saved|wifi-failed) "(.+)"$/)
        if (result === null) { throw new InvalidCommandError(msg) }
        return { command: "wifi-answer", tallyName: result[2], saved: result[1] === "wifi-saved" }
    } else if (msg.startsWith("name-saved ") || msg.startsWith("name-failed ")) {
        // the new name is left out when the light could not even load the code that saves it
        const result = msg.match(/^(name-saved|name-failed) "([^"]+)"(?: "([^"]*)")?$/)
        if (result === null) { throw new InvalidCommandError(msg) }
        return { command: "name-answer", tallyName: result[2], newName: result[3] || "", saved: result[1] === "name-saved" }
    } else if (msg.startsWith("update-")) {
        const result = msg.match(/^update-(saved|failed|done) "([^"]+)"(?: "([^"]*)")?$/)
        if (result === null) { throw new InvalidCommandError(msg) }
        return { command: "update-answer", tallyName: result[2], stamp: result[3] || "", outcome: result[1] as "saved" | "failed" | "done" }
    } else {
        throw new InvalidCommandError(msg)
    }
  }

  private parseTallyHo = function(cmd: string) : TallyHoCommand {
    const result = cmd.match(/^tally-ho "([^"]+)"(?: "([^"]*)")?\s*$/)
    if (result === null) {
        throw new InvalidCommandError(cmd)
    }
    const command: TallyHoCommand = { command: "tally-ho", tallyName: result[1] }
    if (result[2]) command.program = result[2]
    return command
  }

  private parseLog = function(cmd: string) : LogCommand {
    const result = cmd.match(/^([^ ]+) "(.+)" ([^ ]+) "(.*)"/)

    if (result === null) {
        throw new InvalidCommandError(cmd)
    } else {
        const [_, command, tallyName, uncleanSeverity, message] = result
        if (command !== "log") {
            throw  new InvalidCommandError(command)
        }
        const severity = (() => {
          if (uncleanSeverity === "INFO" || uncleanSeverity === "WARN" || uncleanSeverity === "ERROR") {
            return uncleanSeverity
          } else {
            console.log(`Invalid severity "${uncleanSeverity}". Using ERROR instead.`)
            return "ERROR"
          }
        })()
        const log = new Log(new Date(), severity, message)
        return { command, tallyName, log }
    }
  }
}

export default new TallyCommandParser()
