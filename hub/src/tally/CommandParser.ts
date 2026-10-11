import Log from "../domain/Log"

export type TallyHoCommand = {
  command: "tally-ho"
  tallyName: string
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

export type TallySentCommand = TallyHoCommand | LogCommand | WifiAnswerCommand

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
    } else {
        throw new InvalidCommandError(msg)
    }
  }

  private parseTallyHo = function(cmd: string) : TallyHoCommand {
    const result = cmd.match(/^([^ ]+) "(.+)"/)
    if (result === null) {
        throw new InvalidCommandError(cmd)
    } else {
        const [_, command, tallyName] = result
        if (command !== "tally-ho") {
            throw new InvalidCommandError(command)
        }
        return { command, tallyName }
    }
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
