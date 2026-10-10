import {Configuration} from '../interfaces'

export type RolandV8HDConfigurationSaveType = {
    requestInterval: number
}

class RolandV8HDConfiguration extends Configuration {
    requestInterval: number

    constructor() {
        super()
        this.requestInterval = RolandV8HDConfiguration.defaultRequestInterval
    }

    fromJson(data: RolandV8HDConfigurationSaveType): void {
        this.loadNumber("requestInterval", this.setRequestInterval.bind(this), data)
    }

    toJson(): RolandV8HDConfigurationSaveType {
        return {
            requestInterval: this.requestInterval,
        }
    }
    clone(): RolandV8HDConfiguration {
        const clone = new RolandV8HDConfiguration()
        clone.fromJson(this.toJson())
        return clone
    }

    setRequestInterval(requestInterval: string | number | null) {
        if (requestInterval === null) {
            requestInterval = RolandV8HDConfiguration.defaultRequestInterval
        }else if(typeof requestInterval === "string"){
            requestInterval = parseInt(requestInterval, 10)
            if(!Number.isFinite(requestInterval)) {
                throw new Error(`Could not parse "${requestInterval}" into a number.`)
            }
        }
        // milliseconds between two rounds of questions over USB. The connector treats 3 s without an
        // answer as a lost switcher, so more than 1000 makes a working V-8HD look unplugged.
        if (!Number.isInteger(requestInterval) || requestInterval < RolandV8HDConfiguration.minRequestInterval || requestInterval > RolandV8HDConfiguration.maxRequestInterval) {
            throw new Error(`Use ${RolandV8HDConfiguration.minRequestInterval} to ${RolandV8HDConfiguration.maxRequestInterval} milliseconds.`)
        }
        this.requestInterval = requestInterval

        return this
    }

    getRequestInterval() {
        return this.requestInterval
    }

    private static readonly defaultRequestInterval = 100
    static readonly minRequestInterval = 50
    static readonly maxRequestInterval = 1000
}

export default RolandV8HDConfiguration
