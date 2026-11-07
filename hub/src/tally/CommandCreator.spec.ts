import {UdpTally} from '../domain/Tally'
import CommandCreator from './CommandCreator'
import { DefaultTallyConfiguration } from './TallyConfiguration'
import 'jest-extended'


describe('default case', () => {
    const defaultConfig = new DefaultTallyConfiguration()
    test('it shows HIGHLIGHT regardless of anything else', () => {
        const tally = new UdpTally("test", "channel")
        tally.setHighlight(true)
        expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig)).toEqual("O255/255/255 S255/255/255 0xAA 125")
    })
    test('it shows PREVIEW in green by default', () => {
        const tally = new UdpTally("test", "channel")
        expect(CommandCreator.createStateCommand(tally, ["other-channel"], ["channel"], defaultConfig)).toEqual("O000/255/000 S000/255/000")
    })
    test('it shows PROGRAM', () => {
        const tally = new UdpTally("test", "channel")
        expect(CommandCreator.createStateCommand(tally, ["channel"], ["other-channel"], defaultConfig)).toEqual("O255/000/000 S255/000/000")
    })
    test('it shows PROGRAM if channel is in preview and on-air', () => {
        const tally = new UdpTally("test", "channel")
        expect(CommandCreator.createStateCommand(tally, ["channel"], ["channel"], defaultConfig)).toEqual("O255/000/000 S255/000/000")
    })
    test('it shows RELEASE if tally is patched and it is not on-air or in preview', () => {
        const tally = new UdpTally("test", "channel")
        expect(CommandCreator.createStateCommand(tally, ["other-channel"], [], defaultConfig)).toEqual("O000/001/000 S000/000/000")
    })
    test('it shows RELEASE if tally is not patched', () => {
        const tally = new UdpTally("test")
        expect(CommandCreator.createStateCommand(tally, ["other-channel"], ["channel"], defaultConfig)).toEqual("O000/001/000 S000/000/000")
    })
    test('it shows UNKNOWN if program is null and tally is patched', () => {
        const tally = new UdpTally("test", "channel")
        expect(CommandCreator.createStateCommand(tally, null, null, defaultConfig)).toEqual("O000/000/255 S000/000/000 0x80 250")
    })
    test('it shows RELEASE if program is null and tally is NOT patched', () => {
        const tally = new UdpTally("test")
        expect(CommandCreator.createStateCommand(tally, null, null, defaultConfig)).toEqual("O000/001/000 S000/000/000")
    })
})


describe("stageLightBrightness()", () => {
    const defaultConfig = new DefaultTallyConfiguration()
    defaultConfig.setStageLightBrightness(50)
    describe('it uses the default', () => {
        const tally = new UdpTally("test", "channel")
        test('for PREVIEW', () => {
            expect(CommandCreator.createStateCommand(tally, ["other-channel"], ["channel"], defaultConfig)).toEqual("O000/255/000 S000/128/000")
        })
        test('for PROGRAM', () => {
            expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig)).toEqual("O255/000/000 S128/000/000")
        })
        test('for RELEASE', () => {
            expect(CommandCreator.createStateCommand(tally, [], [], defaultConfig)).toEqual("O000/001/000 S000/000/000")
        })
    })
    describe('it can be overridden by a tally configuration', () => {
        const tally = new UdpTally("test", "channel")
        tally.configuration.setStageLightBrightness(25)
        test('for PREVIEW', () => {
            expect(CommandCreator.createStateCommand(tally, ["other-channel"], ["channel"], defaultConfig)).toEqual("O000/255/000 S000/064/000")
        })
        test('for PROGRAM', () => {
            expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig)).toEqual("O255/000/000 S064/000/000")
        })
    })
    describe('it can be turned completely off', () => {
        const tally = new UdpTally("test", "channel")
        tally.configuration.setStageLightBrightness(0)
        test('for PREVIEW', () => {
            expect(CommandCreator.createStateCommand(tally, ["other-channel"], ["channel"], defaultConfig)).toEqual("O000/255/000 S000/000/000")
        })
        test('for PROGRAM', () => {
            expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig)).toEqual("O255/000/000 S000/000/000")
        })
    })
})
describe("operatorLightBrightness()", () => {
    const defaultConfig = new DefaultTallyConfiguration()
    defaultConfig.setOperatorLightBrightness(50)
    describe('it uses the default', () => {
        const tally = new UdpTally("test", "channel")
        test('for PREVIEW', () => {
            expect(CommandCreator.createStateCommand(tally, ["other-channel"], ["channel"], defaultConfig)).toEqual("O000/128/000 S000/255/000")
        })
        test('for PROGRAM', () => {
            expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig)).toEqual("O128/000/000 S255/000/000")
        })
    })
    describe('it can be overridden by a tally configuration', () => {
        const tally = new UdpTally("test", "channel")
        tally.configuration.setOperatorLightBrightness(25)
        test('for PREVIEW', () => {
            expect(CommandCreator.createStateCommand(tally, ["other-channel"], ["channel"], defaultConfig)).toEqual("O000/064/000 S000/255/000")
        })
        test('for PROGRAM', () => {
            expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig)).toEqual("O064/000/000 S255/000/000")
        })
    })
})
describe("stageColorScheme()", () => {
    const defaultConfig = new DefaultTallyConfiguration()
    defaultConfig.setStageColorScheme("yellow-pink")
    describe('it uses the default', () => {
        const tally = new UdpTally("test", "channel")
        test('for PREVIEW', () => {
            expect(CommandCreator.createStateCommand(tally, ["other-channel"], ["channel"], defaultConfig)).toEqual("O000/255/000 S255/000/255")
        })
        test('for PROGRAM', () => {
            expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig)).toEqual("O255/000/000 S255/255/000")
        })
    })
    describe('it can be overridden by a tally configuration', () => {
        const tally = new UdpTally("test", "channel")
        tally.configuration.setStageColorScheme("default")
        test('for PREVIEW', () => {
            expect(CommandCreator.createStateCommand(tally, ["other-channel"], ["channel"], defaultConfig)).toEqual("O000/255/000 S000/255/000")
        })
        test('for PROGRAM', () => {
            expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig)).toEqual("O255/000/000 S255/000/000")
        })
    })
})
describe("operatorColorScheme()", () => {
    const defaultConfig = new DefaultTallyConfiguration()
    defaultConfig.setOperatorColorScheme("yellow-pink")
    describe('it uses the default', () => {
        const tally = new UdpTally("test", "channel")
        test('for PREVIEW', () => {
            expect(CommandCreator.createStateCommand(tally, ["other-channel"], ["channel"], defaultConfig)).toEqual("O255/000/255 S000/255/000")
        })
        test('for PROGRAM', () => {
            expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig)).toEqual("O255/255/000 S255/000/000")
        })
    })
    describe('it can be overridden by a tally configuration', () => {
        const tally = new UdpTally("test", "channel")
        tally.configuration.setOperatorColorScheme("default")
        test('for PREVIEW', () => {
            expect(CommandCreator.createStateCommand(tally, ["other-channel"], ["channel"], defaultConfig)).toEqual("O000/255/000 S000/255/000")
        })
        test('for PROGRAM', () => {
            expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig)).toEqual("O255/000/000 S255/000/000")
        })
    })
})
describe("stageShowPreview()", () => {
    describe('it uses the default', () => {
        const defaultConfig = new DefaultTallyConfiguration()
        defaultConfig.setStageShowsPreview(false)
        const tally = new UdpTally("test", "channel")
        test('for PREVIEW', () => {
            expect(CommandCreator.createStateCommand(tally, ["other-channel"], ["channel"], defaultConfig)).toEqual("O000/255/000 S000/000/000")
        })
        test('for PROGRAM', () => {
            expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig)).toEqual("O255/000/000 S255/000/000")
        })
    })
    describe('it can be overridden by a tally configuration', () => {
        const defaultConfig = new DefaultTallyConfiguration()
        defaultConfig.setStageShowsPreview(true)
        const tally = new UdpTally("test", "channel")
        tally.configuration.setStageShowsPreview(false)
        test('for PREVIEW', () => {
            expect(CommandCreator.createStateCommand(tally, ["other-channel"], ["channel"], defaultConfig)).toEqual("O000/255/000 S000/000/000")
        })
        test('for PROGRAM', () => {
            expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig)).toEqual("O255/000/000 S255/000/000")
        })
    })
})
describe("operatorShowsIdle()", () => {
    describe('it uses the default', () => {
        const defaultConfig = new DefaultTallyConfiguration()
        defaultConfig.setOperatorShowsIdle(false)
        const tally = new UdpTally("test", "channel")
        test('for PROGRAM', () => {
            expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig)).toEqual("O255/000/000 S255/000/000")
        })
        test('for RELEASE', () => {
            expect(CommandCreator.createStateCommand(tally, [], [], defaultConfig)).toEqual("O000/000/000 S000/000/000")
        })
    })
    describe('it can be overridden by a tally configuration', () => {
        const defaultConfig = new DefaultTallyConfiguration()
        defaultConfig.setOperatorShowsIdle(true)
        const tally = new UdpTally("test", "channel")
        tally.configuration.setOperatorShowsIdle(false)
        test('for PROGRAM', () => {
            expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig)).toEqual("O255/000/000 S255/000/000")
        })
        test('for RELEASE', () => {
            expect(CommandCreator.createStateCommand(tally, [], [], defaultConfig)).toEqual("O000/000/000 S000/000/000")
        })
    })
})
describe('the dimmer: one brightness on top of every light\'s own', () => {
    const defaultConfig = new DefaultTallyConfiguration()
    test('dims program, preview and highlight alike', () => {
        const tally = new UdpTally("test", "channel")
        expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig, 50)).toEqual("O128/000/000 S128/000/000")
        expect(CommandCreator.createStateCommand(tally, [], ["channel"], defaultConfig, 20)).toEqual("O000/051/000 S000/051/000")
        tally.setHighlight(true)
        expect(CommandCreator.createStateCommand(tally, [], [], defaultConfig, 10)).toEqual("O026/026/026 S026/026/026 0xAA 125")
    })
    test('multiplies with the light\'s own brightness, and never puts the operator light out', () => {
        const tally = new UdpTally("test", "channel")
        tally.configuration.setOperatorLightBrightness(50)
        tally.configuration.setStageLightBrightness(0)
        expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig, 50)).toEqual("O064/000/000 S000/000/000")
        tally.configuration.setOperatorLightBrightness(1)
        expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig, 10)).toEqual("O003/000/000 S000/000/000")
    })
    test('100 and no dimmer are the same', () => {
        const tally = new UdpTally("test", "channel")
        expect(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig, 100)).toEqual(CommandCreator.createStateCommand(tally, ["channel"], [], defaultConfig))
    })
})
