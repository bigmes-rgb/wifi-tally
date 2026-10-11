import TallyContainer from './TallyContainer'
import ServerEventEmitter from '../lib/ServerEventEmitter';
import { AppConfiguration } from '../lib/AppConfiguration';
import WebTallyDriver from './WebTallyDriver';

test('it writes changes to configuration', () => {
    const emitter = new ServerEventEmitter()
    const configuration = new AppConfiguration(emitter)
    const container = new TallyContainer(configuration, emitter)
    new WebTallyDriver(configuration, container)

    // check that it is initially empty
    expect(configuration.getTallies()).toEqual([])

    const tally = container.getOrCreate("Foobar", "web")

    // tally was created
    expect(configuration.getTallies()).toHaveLength(1)
    expect(configuration.getTallies()[0].name).toEqual("Foobar")
    expect(configuration.getTallies()[0].channelId).toBe(undefined)

    tally.channelId = "42"
    container.update(tally)
    expect(configuration.getTallies()).toHaveLength(1)
    expect(configuration.getTallies()[0].name).toEqual("Foobar")
    expect(configuration.getTallies()[0].channelId).toEqual("42")

    container.remove(tally.name, "web")
    expect(configuration.getTallies()).toEqual([])
})
test('a renamed light keeps its channel and settings under the new name, and the old name goes', () => {
    const emitter = new ServerEventEmitter()
    const configuration = new AppConfiguration(emitter)
    const container = new TallyContainer(configuration, emitter)
    const removed: string[] = []
    emitter.on('tally.removed', t => removed.push(t.name))
    const tally = container.getOrCreate("Cam 1", "udp")
    tally.channelId = "3"
    container.update(tally)

    container.rename("Cam 1", "udp", "Stage left")

    expect(container.get("Cam 1", "udp")).toBeUndefined()
    expect(container.get("Stage left", "udp")?.channelId).toBe("3")
    expect(configuration.getTallies().map(t => t.name)).toEqual(["Stage left"])
    expect(removed).toEqual(["Cam 1"])
})

test('a light is not renamed onto a name another light has', () => {
    const emitter = new ServerEventEmitter()
    const configuration = new AppConfiguration(emitter)
    const container = new TallyContainer(configuration, emitter)
    container.getOrCreate("Cam 1", "udp")
    container.getOrCreate("Cam 2", "udp")
    container.rename("Cam 1", "udp", "Cam 2")
    expect(container.getTallies().map(t => t.name).sort()).toEqual(["Cam 1", "Cam 2"])
})
