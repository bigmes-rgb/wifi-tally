import { ConnectionState, UdpTally } from '../domain/Tally'
import dgram from 'dgram'
import { ChannelList } from '../lib/MixerCommunicator'
import { AppConfiguration } from '../lib/AppConfiguration'
import CommandParser, { InvalidCommandError } from './CommandParser'
import CommandCreator from './CommandCreator'
import TallyContainer from './TallyContainer'
import Log, { Severity } from '../domain/Log'

// - handles connections with Tallies.
// - emits signals when tallies connect, go missing or disconnect
class UdpTallyDriver {
    io: dgram.Socket
    container: TallyContainer
    configuration: AppConfiguration
    lastTallyReport: Map<string, Date> = new Map()
    // how long the page gets to show "renamed" before the light's card changes its name
    static renameDelayMs = 1500
    private timers: ReturnType<typeof setInterval>[] = []

    constructor(configuration: AppConfiguration, container: TallyContainer) {
        this.configuration = configuration
        this.container = container
        this.container.addUdpTallyDriver(this)

        this.io = dgram.createSocket('udp4')
        
        this.io.on('error', (err) => {
            console.log(`server error: ${err.stack}`);
            this.io.close();
        });
        
        this.io.on('message', (msg, rinfo) => {
            try {
                const command = CommandParser.parse(msg.toString().trim())
                if (command.command === "tally-ho") {
                    const {tallyName} = command
                    this.tallyReported(tallyName, rinfo)
                } else if (command.command === "log") {
                    const {tallyName, log} = command
                    this.tallyReported(tallyName, rinfo)
                    this.container.addLog(tallyName, "udp", log)
                } else if (command.command === "wifi-answer") {
                    this.tallyReported(command.tallyName, rinfo)
                    this.container.emitter.emit('tally.wifi', { tallyName: command.tallyName, saved: command.saved })
                } else if (command.command === "name-answer") {
                    this.tallyReported(command.tallyName, rinfo)
                    this.container.emitter.emit('tally.renamed', { tallyName: command.tallyName, newName: command.newName, saved: command.saved })
                    // The light restarts under its new name: its channel and settings move over to it. A moment
                    // after the answer, so the page can show "renamed" before the card changes its name; the
                    // light takes seconds to come back, so nothing reports under the new name before then.
                    if (command.saved && command.newName) {
                        const { tallyName, newName } = command
                        setTimeout(() => {
                            this.container.rename(tallyName, "udp", newName)
                            const at = this.lastTallyReport.get(tallyName)
                            if (at) this.lastTallyReport.set(newName, at)
                            this.lastTallyReport.delete(tallyName)
                        }, UdpTallyDriver.renameDelayMs)
                    }
                } else {
                    // typescript should complain if we missed a command
                    ((_: never) => {})(command)
                }
            } catch (e) {
                if (e instanceof InvalidCommandError) {
                    console.warn(e.message)
                } else {
                    throw e
                }
            }
        });
        
        this.io.on('listening', () => {
            const address = this.io.address()
            console.log(`Listening for Tallies on ${address.address}:${address.port}`)
        });
        
        this.io.bind(this.configuration.getTallyPort())

        // check that all tallies are still reporting regularily
        this.timers.push(setInterval(() => {
            const now = new Date()
            this.container.getUdpTallies().forEach(tally => {
                const lastTallyReportDate = this.lastTallyReport.get(tally.name)
                if(!lastTallyReportDate) {
                    tally.state = ConnectionState.DISCONNECTED
                } else {
                    const diff = now.getTime() - lastTallyReportDate.getTime() // milliseconds
                    if(diff > this.configuration.getTallyTimeoutDisconnected()) {
                        if(tally.state !== ConnectionState.DISCONNECTED) {
                            tally.state = ConnectionState.DISCONNECTED
                            this.container.update(tally)
                            this.container.addLog(tally.name, "udp", new Log(new Date(), Severity.STATUS, `Tally got disconnected after not reporting for ${diff}ms`))
                        }
                    } else if(diff > this.configuration.getTallyTimeoutMissing()) {
                        if(tally.state !== ConnectionState.MISSING) {
                            tally.state = ConnectionState.MISSING
                            this.container.update(tally)
                            this.container.addLog(tally.name, "udp", new Log(new Date(), Severity.STATUS, `Tally got missing. It has not reported for ${diff}ms`))
                        }
                    }
                }
            })
        }, 500))

        // send keep-alive messages
        // - show the tally, we are still here
        // - compensate for lost packages
        this.timers.push(setInterval(() => {
            this.container.getUdpTallies().forEach(tally => {
                this.updateTallyState(tally, this.container.lastPrograms, this.container.lastPreviews)
            })
        }, 1000 / this.configuration.getTallyKeepAlivesPerSecond()))
    }

    // stops the timers and the socket (tests; the hub itself runs until it exits)
    close() {
        this.timers.forEach(timer => clearInterval(timer))
        this.timers = []
        this.io.close()
    }

    private tallyReported(tallyName: string, rinfo: dgram.RemoteInfo) {
        this.lastTallyReport.set(tallyName, new Date())
        let tally = this.container.getOrCreate(tallyName, "udp") as UdpTally
        const oldState = tally.state
        const oldAddress = tally.address
        const oldPort = tally.port

        tally.state = ConnectionState.CONNECTED
        tally.address = rinfo.address
        tally.port = rinfo.port

        if (oldState !== tally.state || oldAddress !== tally.address || oldPort !== tally.port) {
            this.container.update(tally)
        }
        return tally
    }

    // Hands every connected light a new Wi-Fi, to use once its current network goes away (see the
    // tally's handleWifi). Name and password go as hex, so no character can break the message.
    // Returns the names of the lights it was sent to; each answers "wifi-saved" or "wifi-failed".
    sendWifi(ssid: string, password: string): string[] {
        const hex = (s: string) => Buffer.from(s, "utf8").toString("hex")
        const command = `wifi ${hex(ssid)} ${hex(password)}`
        const sentTo: string[] = []
        this.container.getTallies().forEach(tally => {
            if (tally instanceof UdpTally && tally.isConnected()) {
                this.io.send(command, tally.port, tally.address)
                sentTo.push(tally.name)
            }
        })
        return sentTo
    }

    // Sends one light a new name (see the tally's handleSetting). It answers "name-saved" and restarts under the new
    // name, or "name-failed". Returns false when the light is not on the network now.
    sendName(tallyName: string, newName: string): boolean {
        const tally = this.container.get(tallyName, "udp")
        if (!(tally instanceof UdpTally) || !tally.isConnected()) return false
        this.io.send(`name ${Buffer.from(newName, "utf8").toString("hex")}`, tally.port, tally.address)
        return true
    }

    updateTallyState(tally: UdpTally, programs: ChannelList, previews: ChannelList) {
        if(tally.isActive()) {
            const command = CommandCreator.createStateCommand(tally, programs, previews, this.configuration.getTallyConfiguration())
            this.io.send(command, tally.port, tally.address)
        }
    }
}

export default UdpTallyDriver