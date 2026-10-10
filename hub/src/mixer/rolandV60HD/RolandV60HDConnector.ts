import http from 'http'
import { MixerCommunicator } from '../../lib/MixerCommunicator'
import { Connector } from '../interfaces'
import RolandV60HDConfiguration from './RolandV60HDConfiguration'

// the three answers of the Smart Tally API
const TALLY_WORDS = ["onair", "selected", "unselected"]

// @see https://static.roland.com/assets/media/pdf/V-60HD_smart_tally_eng02_W.pdf
class RolandV60HDConnector implements Connector {
    configuration: RolandV60HDConfiguration
    communicator: MixerCommunicator
    sourceConnections: any
    connected: boolean
    input_status: number[]
    // a request may take this long before the switcher counts as not answering. Without a limit an
    // unreachable switcher takes about 21 s to fail on Windows, and requests pile up meanwhile.
    requestTimeoutMs = 2000
    private stopped = false
    private pending: (http.ClientRequest | null)[] = []

    constructor(configuration: RolandV60HDConfiguration, communicator: MixerCommunicator) {
        this.configuration = configuration
        this.communicator = communicator
        this.sourceConnections = []
        this.connected = false
        //input status array.
        // 0 = off
        // 1 = program
        // 2 = preview
        this.input_status = [0,0,0,0,0,0,0,0]
    }
    connect() {
        console.log(`Connecting to RolandV60HD at ${this.configuration.getIp().toString()}:${this.configuration.getPort().toString()}`)
        this.stopped = false
        for(let i = 0; i < 8; i++){
          this.sourceConnections[i] = setInterval(function() {this.checkRolandV60HDStatus(this.communicator, this.configuration.getIp().toString(), this.configuration.getPort().toString(), i + 1)}.bind(this), this.configuration.getRequestInterval())
        }
        // "connected" only once the switcher has answered like a V-60HD (see processResponse)
    }

    private checkRolandV60HDStatus(communicator: MixerCommunicator, ip: string, port: string, address: number){
      // one question per input at a time: a slow switcher is not sent more while it is still busy
      if (this.pending[address - 1]) { return }
      const request = http.get(`http://${ip}:${port}/tally/${address.toString()}/status`, { timeout: this.requestTimeoutMs }, res => {
        let body = ""
        res.setEncoding('utf8')
        res.on('data', data => { body += data })
        res.on('end', () => {
          this.pending[address - 1] = null
          if (res.statusCode !== 200 || !TALLY_WORDS.includes(body.trim())) {
            this.processResponseError(new Error(`answered HTTP ${res.statusCode} "${body.trim().slice(0, 40)}"`), "Something answers at this address, but it is not a V-60HD's Smart Tally. Check the IP address and port.")
          } else {
            this.processResponse(body.trim(), address)
          }
        })
      })
      request.on('timeout', () => request.destroy(new Error(`no answer within ${this.requestTimeoutMs} ms`)))
      request.on('error', error => {
        this.pending[address - 1] = null
        this.processResponseError(error)
      })
      this.pending[address - 1] = request
    }

    private processResponse(response: string, address: number){
      // a reply that arrives after disconnect() belongs to a mixer that is no longer selected
      if (this.stopped) { return }
      // if we get response, reconnect mixer in hub
      if(!this.connected){
        this.connected = true
        this.communicator.notifyMixerIsConnected()
      }

      // RolandV60HD encodes tally states as words
      // unselected = off
      // onair = program
      // selected = preview
      switch(response){
        case "onair":
          this.input_status[address - 1] = 1
          //programs.push(`${address}`)
          break;
        case "selected":
          this.input_status[address - 1] = 2
          //previews.push(`${address}`)
          break;
        case "unselected":
          this.input_status[address - 1] = 0
          break;
        default:
          this.input_status[address - 1] = 0
          break;
      }
      // Only Process Tally Information after full iteration
      if(address === 8){
        this.processInputStatus(this.communicator)
      }
    }

    private processResponseError(error: any, problem?: string){
      if (this.stopped) { return }
      // set mixer as disconnected
      console.log(`RolandV60HD Smart Tally Error: ${error}`)
      this.communicator.notifyMixerIsDisconnected(problem)
      if (this.connected) {
        this.connected = false
      }
    }

    private processInputStatus(communicator: MixerCommunicator){
      let programs: string[] = []
      let previews: string[] = []
      // iterate through input status array
      for(let i = 0; i < 8; i++){
        // process program
        if(this.input_status[i] === 1){
          programs.push(`${i + 1}`)
        }
        // process preview
        if(this.input_status[i] === 2){
          previews.push(`${i + 1}`)
        }
      }
      communicator.notifyProgramPreviewChanged(programs, previews)
    }

    disconnect() {
      this.stopped = true
      //clean servers
      for(let i = 0; i < 8; i++){
        clearInterval(this.sourceConnections[i]);
      }
      this.pending.forEach(request => request?.destroy())
      this.pending = []
      console.log(`RolandV60HD Smart Tally connection closed`);
      this.connected = false
      this.communicator.notifyMixerIsDisconnected()
      return true
    }

    isConnected() {
        return this.connected
    }

    static readonly ID: "rolandV60HD" = "rolandV60HD"
}

export default RolandV60HDConnector
