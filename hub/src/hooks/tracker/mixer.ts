import {EventEmitter} from 'events'
import { ClientSideSocket } from '../../lib/SocketEvents'

class MixerTracker extends EventEmitter{
    connectionState: boolean | null
    problem: string | null = null

    constructor(socket: ClientSideSocket, socketEventEmitter: EventEmitter) {
        super()
        this.connectionState = null
        
        socket.on('mixer.state', ({isConnected, problem}) => {
            this.connectionState = isConnected
            this.problem = isConnected ? null : (problem || null)
            this.emit('connection', this.connectionState)
            this.emit('problem', this.problem)
        })
        socket.emit('events.mixer.subscribe')
        // the hub keeps subscriptions per connection: after it restarted (an update, say) it has to be asked again
        socketEventEmitter.on("connected", () => {
            socket.emit('events.mixer.subscribe')
        })
    }
}

export default MixerTracker
