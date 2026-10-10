import { MixerCommunicator } from './MixerCommunicator'
import { AppConfiguration } from './AppConfiguration'
import { EventEmitter } from 'events'

describe('MixerCommunicator', () => {
    describe('notifyProgramPreviewChanged', () => {
        test('sends an event and fills getters', () => {
            const emitter = new EventEmitter()
            let eventSeen = 0

            let expectedPrograms = ["1"]
            let expectedPreviews = ["2"]
            emitter.on("program.changed", ({programs, previews}) => {
                eventSeen++
                expect(programs).toEqual(expectedPrograms)
                expect(previews).toEqual(expectedPreviews)
            })
            const config = new AppConfiguration(emitter)

            const communicator = new MixerCommunicator(config, emitter)

            expect(eventSeen).toEqual(0)
            communicator.notifyProgramPreviewChanged(["1"], ["2"])
            expect(eventSeen).toEqual(1)
            expect(communicator.getCurrentPrograms()).toEqual(["1"])
            expect(communicator.getCurrentPreviews()).toEqual(["2"])

            expectedPreviews = null
            expectedPrograms = null
            communicator.notifyProgramPreviewChanged(null, null)
            expect(eventSeen).toEqual(2)
            expect(communicator.getCurrentPrograms()).toEqual(null)
            expect(communicator.getCurrentPreviews()).toEqual(null)
        })
        test('debounces', () => {
            const emitter = new EventEmitter()
            let eventSeen = 0
            emitter.on("program.changed", _ => eventSeen++)
            const config = new AppConfiguration(emitter)

            const communicator = new MixerCommunicator(config, emitter)

            expect(eventSeen).toEqual(0)
            communicator.notifyProgramPreviewChanged(["1"], ["2"])
            expect(eventSeen).toEqual(1)
            // same settings again
            communicator.notifyProgramPreviewChanged(["1"], ["2"])
            expect(eventSeen).toEqual(1)
            // preview has changed
            communicator.notifyProgramPreviewChanged(["1"], ["3"])
            expect(eventSeen).toEqual(2)
            // program has changed
            communicator.notifyProgramPreviewChanged(["2"], ["3"])
            expect(eventSeen).toEqual(3)
            // preview added
            communicator.notifyProgramPreviewChanged(["2"], ["3","4"])
            expect(eventSeen).toEqual(4)
            // same settings again
            communicator.notifyProgramPreviewChanged(["2"], ["3","4"])
            expect(eventSeen).toEqual(4)
            // program removed
            communicator.notifyProgramPreviewChanged([], ["3","4"])
            expect(eventSeen).toEqual(5)
            // same settings again
            communicator.notifyProgramPreviewChanged([], ["3","4"])
            expect(eventSeen).toEqual(5)
        })
    })
    describe('notifyChannelNames', () => {
        test('sends an event', () => {
            const emitter = new EventEmitter()
            let eventSeen = 0

            emitter.on("config.changed", () => eventSeen++)
            const config = new AppConfiguration(emitter)
            config.save = async () => {} // mock it away

            const communicator = new MixerCommunicator(config, emitter)

            expect(eventSeen).toEqual(0)

            communicator.notifyChannelNames(3)
            expect(eventSeen).toEqual(1)
            expect(config.getChannels()).toHaveLength(3)

            communicator.notifyChannelNames(3, {1: "foobar", 2: "baz", 3: "bar"})
            expect(eventSeen).toEqual(2)
            expect(config.getChannels()).toHaveLength(3)
            expect(config.getChannels().map(c => c.name)).toEqual(["foobar", "baz", "bar"])

            // can be nulled
            communicator.notifyChannelNames(null, null)
            expect(eventSeen).toEqual(3)
            expect(config.getChannels()).not.toHaveLength(3)
            expect(config.getChannels()).toEqual([])
        })
        test('debounces', () => {
            const emitter = new EventEmitter()
            let eventSeen = 0

            emitter.on("config.changed", () => eventSeen++)
            const config = new AppConfiguration(emitter)
            config.save = async () => {} // mock it away

            const communicator = new MixerCommunicator(config, emitter)

            expect(eventSeen).toEqual(0)

            communicator.notifyChannelNames(3)
            expect(eventSeen).toEqual(1)
            // do it again
            communicator.notifyChannelNames(3)
            expect(eventSeen).toEqual(1)
            // add channels
            communicator.notifyChannelNames(3, {1: "foobar", 2: "baz", 3: "bar"})
            expect(eventSeen).toEqual(2)
            // do it again
            communicator.notifyChannelNames(3, {1: "foobar", 2: "baz", 3: "bar"})
            expect(eventSeen).toEqual(2)
            // change in name
            communicator.notifyChannelNames(3, {1: "blubber", 2: "baz", 3: "bar"})
            expect(eventSeen).toEqual(3)
            // do it again
            communicator.notifyChannelNames(3, {1: "blubber", 2: "baz", 3: "bar"})
            expect(eventSeen).toEqual(3)
            // remove channel
            communicator.notifyChannelNames(2, {1: "blubber", 2: "baz"})
            expect(eventSeen).toEqual(4)
            // add channels
            communicator.notifyChannelNames(4, {1: "blubber", 2: "baz", 3: "bar", 4: "bluna"})
            expect(eventSeen).toEqual(5)
        })
    })
    describe('notifyMixerIsConnected/Disconnected', () => {
        test('sends an event', () => {
            const emitter = new EventEmitter()
            let connectEventSeen = 0
            let disconnectEventSeen = 0

            emitter.on("mixer.connected", () => connectEventSeen++)
            emitter.on("mixer.disconnected", () => disconnectEventSeen++)
            const config = new AppConfiguration(emitter)
            config.save = async () => {} // mock it away

            const communicator = new MixerCommunicator(config, emitter)

            expect(connectEventSeen).toEqual(0)
            expect(disconnectEventSeen).toEqual(0)

            communicator.notifyMixerIsConnected()
            expect(connectEventSeen).toEqual(1)
            expect(disconnectEventSeen).toEqual(0)

            communicator.notifyMixerIsDisconnected()
            expect(connectEventSeen).toEqual(1)
            expect(disconnectEventSeen).toEqual(1)
        })
        test('debounces', () => {
            const emitter = new EventEmitter()
            let connectEventSeen = 0
            let disconnectEventSeen = 0

            emitter.on("mixer.connected", () => connectEventSeen++)
            emitter.on("mixer.disconnected", () => disconnectEventSeen++)
            const config = new AppConfiguration(emitter)
            config.save = async () => {} // mock it away

            const communicator = new MixerCommunicator(config, emitter)

            expect(connectEventSeen).toEqual(0)
            expect(disconnectEventSeen).toEqual(0)

            communicator.notifyMixerIsConnected()
            expect(connectEventSeen).toEqual(1)
            expect(disconnectEventSeen).toEqual(0)
            communicator.notifyMixerIsConnected()
            expect(connectEventSeen).toEqual(1)
            expect(disconnectEventSeen).toEqual(0)
            communicator.notifyMixerIsConnected()
            expect(connectEventSeen).toEqual(1)
            expect(disconnectEventSeen).toEqual(0)

            communicator.notifyMixerIsDisconnected()
            expect(connectEventSeen).toEqual(1)
            expect(disconnectEventSeen).toEqual(1)
            communicator.notifyMixerIsDisconnected()
            expect(connectEventSeen).toEqual(1)
            expect(disconnectEventSeen).toEqual(1)

            communicator.notifyMixerIsConnected()
            expect(connectEventSeen).toEqual(2)
            expect(disconnectEventSeen).toEqual(1)
        })
    })

    describe('a mixer that is lost', () => {
        const setup = () => {
            const emitter = new EventEmitter()
            const seen: any[] = []
            emitter.on("program.changed", state => seen.push(state))
            const communicator = new MixerCommunicator(new AppConfiguration(emitter), emitter)
            communicator.notifyMixerIsConnected()
            communicator.notifyProgramPreviewChanged(["1"], ["2"])
            return { communicator, seen }
        }
        beforeEach(() => jest.useFakeTimers())
        afterEach(() => jest.useRealTimers())

        test('stops showing its last program after the grace period, so no light stays "on air"', () => {
            const { communicator, seen } = setup()
            communicator.notifyMixerIsDisconnected()
            jest.advanceTimersByTime(communicator.lostMixerGraceMs - 1)
            expect(communicator.getCurrentPrograms()).toEqual(["1"])
            jest.advanceTimersByTime(1)
            expect(communicator.getCurrentPrograms()).toBeNull()
            expect(communicator.getCurrentPreviews()).toBeNull()
            expect(seen[seen.length - 1]).toEqual({ programs: null, previews: null })
        })
        test('that comes back within the grace period keeps its state: a blip does not flash the lights', () => {
            const { communicator, seen } = setup()
            communicator.notifyMixerIsDisconnected()
            jest.advanceTimersByTime(communicator.lostMixerGraceMs / 2)
            communicator.notifyMixerIsConnected()
            jest.advanceTimersByTime(communicator.lostMixerGraceMs * 5)
            expect(communicator.getCurrentPrograms()).toEqual(["1"])
            expect(seen).toHaveLength(1)
        })
        test('reporting a new problem while still lost does not restart the grace period', () => {
            const { communicator } = setup()
            communicator.notifyMixerIsDisconnected()
            jest.advanceTimersByTime(communicator.lostMixerGraceMs - 10)
            communicator.notifyMixerIsDisconnected("The V-8HD stopped answering.")
            jest.advanceTimersByTime(10)
            expect(communicator.getCurrentPrograms()).toBeNull()
        })
        test('shows its programs again as soon as it is back and reports', () => {
            const { communicator } = setup()
            communicator.notifyMixerIsDisconnected()
            jest.advanceTimersByTime(communicator.lostMixerGraceMs)
            communicator.notifyMixerIsConnected()
            communicator.notifyProgramPreviewChanged(["1"], ["2"])
            expect(communicator.getCurrentPrograms()).toEqual(["1"])
        })
    })
})
