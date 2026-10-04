import {EventEmitter} from 'events'
import { ClientSideSocket } from '../../lib/SocketEvents'

class MixerTracker extends EventEmitter{
    connectionState: boolean | null
    problem: string | null = null

    constructor(socket: ClientSideSocket) {
        super()
        this.connectionState = null
        
        socket.on('mixer.state', ({isConnected, problem}) => {
            this.connectionState = isConnected
            this.problem = isConnected ? null : (problem || null)
            this.emit('connection', this.connectionState)
            this.emit('problem', this.problem)
        })
        socket.emit('events.mixer.subscribe')
    }
}

export default MixerTracker
