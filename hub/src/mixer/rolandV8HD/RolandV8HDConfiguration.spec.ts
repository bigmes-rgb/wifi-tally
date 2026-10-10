import RolandV8HDConfiguration from './RolandV8HDConfiguration'

function createDefaultRolandV8HDConfiguration() {
    return new RolandV8HDConfiguration()
}

describe('getRequestInterval/setRequestInterval', () => {
    it("has a default", () => {
        const conf = createDefaultRolandV8HDConfiguration()
        expect(conf.getRequestInterval()).toBeTruthy()
    })
    it("allows to set String", () => {
        const conf = createDefaultRolandV8HDConfiguration()
        conf.setRequestInterval("300")
        expect(conf.getRequestInterval()).toEqual(300)
    })
    it("allows to restore the default", () => {
        const conf = createDefaultRolandV8HDConfiguration()
        conf.setRequestInterval(300)
        expect(conf.getRequestInterval()).toEqual(300)
        conf.setRequestInterval(null)
        expect(conf.getRequestInterval()).toBeTruthy()
    })
})

describe('fromJson/toJson', () => {
    it("does work", () => {
        const conf = createDefaultRolandV8HDConfiguration()
        conf.setRequestInterval(300)
        const loadedConf = createDefaultRolandV8HDConfiguration()
        loadedConf.fromJson(conf.toJson())

        expect(loadedConf.getRequestInterval().toString()).toEqual("300")
    })
})

describe('clone', () => {
    it("does work", () => {
        const conf = createDefaultRolandV8HDConfiguration()
        conf.setRequestInterval("424")
        const clone = conf.clone()
        conf.setRequestInterval("434") // it should be a new instance

        expect(clone.getRequestInterval().toString()).toEqual("424")
    })
})

describe('the request interval only takes values the V-8HD connection survives', () => {
    test.each([0, -5, 1, 49, 1001, 5000, 100.5])("%p ms is refused", value => {
        expect(() => new RolandV8HDConfiguration().setRequestInterval(value)).toThrow("50 to 1000 milliseconds")
    })
    test.each([50, 100, 1000])("%p ms is accepted", value => {
        expect(new RolandV8HDConfiguration().setRequestInterval(value).getRequestInterval()).toEqual(value)
    })
    test("a saved value outside the range falls back to the default instead of being used", () => {
        const conf = new RolandV8HDConfiguration()
        conf.fromJson({ requestInterval: 1 })
        expect(conf.getRequestInterval()).toEqual(100)
    })
})
