import CommandParser from './CommandParser'
import { LogCommand, TallyHoCommand } from './CommandParser'


test('fails if command is invalid #1', () => {
    expect(() => {
        CommandParser.parse("this is an invalid command")
    }).toThrowError("Received an invalid command: \"this is an invalid command\"")
})

describe('tally-ho command', () => {
    test('parses a simple command', () => {
        const result = CommandParser.parse('tally-ho "Tally Name"')

        expect(result.command).toEqual("tally-ho")
        const { tallyName } = result as TallyHoCommand
        expect(tallyName).toBe("Tally Name")
    })
    test('fails if command is invalid', () => {
        expect(() => {
            CommandParser.parse("tally-ho Tally")
        }).toThrowError("Received an invalid command: \"tally-ho Tally\"")
    })
})
describe('log command', () => {
    test('parses an info log', () => {
        const result = CommandParser.parse('log "Tally Name" INFO "Hello World"')

        expect(result.command).toEqual("log")
        const { tallyName, log } = result as LogCommand
        expect(tallyName).toBe("Tally Name")
        expect(log.isInfo()).toBe(true)
        expect(log.message).toBe("Hello World")
    })
    test('logs as error if log level is invalid', () => {
        const result = CommandParser.parse('log "Tally Name" UNKNOWN "Hello World"')
        expect(result.command).toEqual("log")
        const { tallyName, log } = result as LogCommand
        expect(tallyName).toBe("Tally Name")
        expect(log.isError()).toBe(true)
        expect(log.message).toBe("Hello World")
    })
    test('fails if command is invalid', () => {
        expect(() => {
            CommandParser.parse("log this invalid log")
        }).toThrowError("Received an invalid command: \"log this invalid log\"")
    })
})

describe('name answer', () => {
    test('a light that saved its new name answers under the old one, with the new one', () => {
        const result = CommandParser.parse('name-saved "Cam 1" "Stage left"') as any
        expect(result).toEqual({ command: "name-answer", tallyName: "Cam 1", newName: "Stage left", saved: true })
    })
    test('a light that could not save it says so', () => {
        const result = CommandParser.parse('name-failed "Cam 1" ""') as any
        expect(result).toEqual({ command: "name-answer", tallyName: "Cam 1", newName: "", saved: false })
    })
    test('a light that could not load the code that saves it answers without the new name', () => {
        const result = CommandParser.parse('name-failed "Cam 1"') as any
        expect(result).toEqual({ command: "name-answer", tallyName: "Cam 1", newName: "", saved: false })
    })
    test('a garbled answer is invalid', () => {
        expect(() => CommandParser.parse('name-saved Cam 1')).toThrowError("invalid command")
    })
})

describe('tally-ho with the build the light runs', () => {
    test('reads the build when the light says it, and leaves it out when it does not', () => {
        const withBuild = CommandParser.parse('tally-ho "Cam 1" "0123456789abcdef"') as TallyHoCommand
        expect(withBuild.tallyName).toBe("Cam 1")
        expect(withBuild.program).toBe("0123456789abcdef")
        const fromFiles = CommandParser.parse('tally-ho "Cam 1" "files"') as TallyHoCommand
        expect(fromFiles.program).toBe("files")
        const old = CommandParser.parse('tally-ho "Cam 1"') as TallyHoCommand
        expect(old.tallyName).toBe("Cam 1")
        expect(old.program).toBeUndefined()
    })
})

describe('update answers', () => {
    test('parses saved, done and failed, with and without the stamp', () => {
        expect(CommandParser.parse('update-saved "Cam 1" "0123456789abcdef"')).toEqual({ command: "update-answer", tallyName: "Cam 1", stamp: "0123456789abcdef", outcome: "saved" })
        expect(CommandParser.parse('update-done "Cam 1" "0123456789abcdef"')).toEqual({ command: "update-answer", tallyName: "Cam 1", stamp: "0123456789abcdef", outcome: "done" })
        expect(CommandParser.parse('update-failed "Cam 1" ""')).toEqual({ command: "update-answer", tallyName: "Cam 1", stamp: "", outcome: "failed" })
        // the light could not even load the code that fetches it
        expect(CommandParser.parse('update-failed "Cam 1"')).toEqual({ command: "update-answer", tallyName: "Cam 1", stamp: "", outcome: "failed" })
    })
    test('rejects a garbled answer', () => {
        expect(() => CommandParser.parse('update-maybe "Cam 1" "x"')).toThrow()
    })
})
