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
