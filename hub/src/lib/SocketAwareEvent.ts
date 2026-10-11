import ServerEventEmitter, { EventHandlersDataMap } from './ServerEventEmitter'
import { ServerSideSocket } from './SocketEvents'

export interface SocketAwareEvent<EventName extends keyof EventHandlersDataMap> {
    constructor(eventEmitter: ServerEventEmitter, eventName: EventName, socket: ServerSideSocket, fnc: (socket: ServerSideSocket, ...args: Parameters<EventHandlersDataMap[EventName]>) => void)
}

/* Takes care that an event on the server is passed through
 * a socket to the browser.
 * 
 * The heavy lifting it does is making sure events are registered
 * and unregistered accordingly. This should prevent dangling event
 * listeners as much as possible.
 */
export class SocketAwareEvent<EventName> {
    eventEmitter: ServerEventEmitter
    socket: ServerSideSocket
    eventName: EventName
    eventListener // @TODO: i failed to infere the correct type here :(
    isRegistered: boolean
    
    constructor(eventEmitter: ServerEventEmitter, eventName: EventName, socket: ServerSideSocket, fnc: (socket: ServerSideSocket, ...args: Parameters<EventHandlersDataMap[EventName]>) => void) {
        this.eventEmitter = eventEmitter
        this.socket = socket
        this.eventName = eventName

        this.eventListener = (...args: Parameters<EventHandlersDataMap[EventName]>) : void => {
            fnc(socket, ...args)
        }
        this.isRegistered = false

    }

    // Says nothing in the log: these lines were a third of the operator's log, 16 for every page opened and
    // 16 for every page closed. The hub logs "[page] opened" and "[page] closed" once each instead.
    register() {
        if (!this.isRegistered) {
            this.eventEmitter.on(this.eventName, this.eventListener)
            this.socket.on("disconnect", () => this.unregister())
            this.isRegistered = true
        }   
    }

    unregister() {
        this.eventEmitter.off(this.eventName, this.eventListener)
        this.isRegistered = false
    }
}
