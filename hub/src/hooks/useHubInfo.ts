import { useEffect, useState } from 'react'
import { HubInfoType } from '../lib/HubInfo'
import { socket, socketEventEmitter } from './useSocket'

// what the hub knows about itself: name and addresses on the network
function useHubInfo() {
  const [info, setInfo] = useState<HubInfoType|undefined>(undefined)

  useEffect(() => {
    const onInfo = (newInfo: HubInfoType) => setInfo(newInfo)
    socket.on('hub.info', onInfo)
    // asked again after a reconnect: a hub that restarted (an update, say) may answer differently
    const ask = () => socket.emit('hub.info.get')
    ask()
    socketEventEmitter.on("connected", ask)
    return () => {
      socketEventEmitter.off("connected", ask)
      socket.off('hub.info', onInfo)
    }
  }, [])

  return info
}

export default useHubInfo
