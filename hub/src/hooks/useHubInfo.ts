import { useEffect, useState } from 'react'
import { HubInfoType } from '../lib/HubInfo'
import { socket } from './useSocket'

// what the hub knows about itself: name and addresses on the network
function useHubInfo() {
  const [info, setInfo] = useState<HubInfoType|undefined>(undefined)

  useEffect(() => {
    const onInfo = (newInfo: HubInfoType) => setInfo(newInfo)
    socket.on('hub.info', onInfo)
    socket.emit('hub.info.get')
    return () => {
      socket.off('hub.info', onInfo)
    }
  }, [])

  return info
}

export default useHubInfo
