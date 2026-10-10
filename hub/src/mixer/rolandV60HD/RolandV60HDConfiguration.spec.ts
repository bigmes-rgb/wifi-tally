import RolandV60HDConfiguration from './RolandV60HDConfiguration'
import ipPort from '../../domain/IpPort'
import ipAddress from '../../domain/IpAddress'

function createDefaultRolandV60HDConfiguration() {
    return new RolandV60HDConfiguration()
}

describe('getRequestInterval/setRequestInterval', () => {
    it("has a default", () => {
        const conf = createDefaultRolandV60HDConfiguration()
        expect(conf.getRequestInterval()).toBeTruthy()
    })
    it("allows to set String", () => {
        const conf = createDefaultRolandV60HDConfiguration()
        conf.setRequestInterval("300")
        expect(conf.getRequestInterval()).toEqual(300)
    })
    it("allows to set number", () => {
        const conf = createDefaultRolandV60HDConfiguration()
        conf.setRequestInterval(300)
        expect(conf.getRequestInterval()).toEqual(300)
    })
    it("allows to restore the default", () => {
        const conf = createDefaultRolandV60HDConfiguration()
        conf.setRequestInterval(300)
        expect(conf.getRequestInterval()).toEqual(300)
        conf.setRequestInterval(null)
        expect(conf.getRequestInterval()).toBeTruthy()
    })
})

describe('getPort/setPort', () => {
    it("has a default", () => {
        const conf = createDefaultRolandV60HDConfiguration()
        expect(conf.getPort()).toBeTruthy()
    })
    it("allows to set an IpPort", () => {
        const conf = createDefaultRolandV60HDConfiguration()
        conf.setPort(ipPort(1234))
        expect(conf.getPort().toNumber()).toEqual(1234)
    })
    it("allows to set a number", () => {
        const conf = createDefaultRolandV60HDConfiguration()
        conf.setPort(1234)
        expect(conf.getPort().toNumber()).toEqual(1234)
    })
    it("allows to restore the default", () => {
        const conf = createDefaultRolandV60HDConfiguration()
        conf.setPort(1234)
        expect(conf.getPort().toNumber()).toEqual(1234)
        conf.setPort(null)
        expect(conf.getPort()).toBeTruthy()
    })
})

describe('getIp/setIp', () => {
    it("has a default", () => {
        const conf = createDefaultRolandV60HDConfiguration()
        expect(conf.getIp()).toBeTruthy()
    })
    it("allows to set an IpPort", () => {
        const conf = createDefaultRolandV60HDConfiguration()
        conf.setIp(ipAddress("1.2.3.4"))
        expect(conf.getIp().toString()).toEqual("1.2.3.4")
    })
    it("allows to set a number", () => {
        const conf = createDefaultRolandV60HDConfiguration()
        conf.setIp("1.2.3.4")
        expect(conf.getIp().toString()).toEqual("1.2.3.4")
    })
    it("allows to restore the default", () => {
        const conf = createDefaultRolandV60HDConfiguration()
        conf.setIp("1.2.3.4")
        expect(conf.getIp().toString()).toEqual("1.2.3.4")
        conf.setIp(null)
        expect(conf.getIp()).toBeTruthy()
    })
})

describe('fromJson/toJson', () => {
    it("does work", () => {
        const conf = createDefaultRolandV60HDConfiguration()
        conf.setIp("1.2.3.4")
        conf.setPort(1234)
        conf.setRequestInterval(300)
        const loadedConf = createDefaultRolandV60HDConfiguration()
        loadedConf.fromJson(conf.toJson())

        expect(loadedConf.getIp().toString()).toEqual("1.2.3.4")
        expect(loadedConf.getPort().toNumber()).toEqual(1234)
        expect(loadedConf.getRequestInterval()).toEqual(300)
    })
})

describe('clone', () => {
    it("does work", () => {
        const conf = createDefaultRolandV60HDConfiguration()
        conf.setIp("1.2.3.4")
        conf.setPort(1234)
        conf.setRequestInterval(300)
        const clone = conf.clone()
        conf.setIp("2.3.4.5") // it should be a new instance

        expect(clone.getIp().toString()).toEqual("1.2.3.4")
        expect(clone.getPort().toNumber()).toEqual(1234)
        expect(clone.getRequestInterval()).toEqual(300)
    })
})

describe('the request interval only takes values the V-60HD can serve', () => {
    test.each([0, -5, 1, 99, 2001, 100.5])("%p ms is refused", value => {
        expect(() => new RolandV60HDConfiguration().setRequestInterval(value)).toThrow("100 to 2000 milliseconds")
    })
    test("'1', meant as one second, is refused rather than flooding the switcher with 8 requests per millisecond", () => {
        expect(() => new RolandV60HDConfiguration().setRequestInterval("1")).toThrow("milliseconds")
    })
    test.each([100, 250, 2000])("%p ms is accepted", value => {
        const conf = new RolandV60HDConfiguration()
        conf.setRequestInterval(value)
        expect(conf.getRequestInterval()).toEqual(value)
    })
    test("a saved value outside the range falls back to the default instead of being used", () => {
        const conf = new RolandV60HDConfiguration()
        conf.fromJson({ ip: "192.168.1.20", port: 80, requestInterval: 1 })
        expect(conf.getRequestInterval()).toEqual(250)
    })
})
