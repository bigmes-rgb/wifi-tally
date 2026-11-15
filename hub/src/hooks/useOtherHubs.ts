import { useEffect, useState } from 'react'
import { OtherHubType } from '../lib/HubInfo'
import { socket, socketEventEmitter } from './useSocket'

// other ACC Tally hubs heard on the network (see tally/HubBeacon): more than one makes lights go missing
function useOtherHubs(): OtherHubType[] {
  const [others, setOthers] = useState<OtherHubType[]>([])

  useEffect(() => {
    const onOthers = (list: OtherHubType[]) => setOthers(list)
    socket.on('hub.others', onOthers)
    // asked again after a reconnect: a hub that restarted (an update, say) may answer differently
    const ask = () => socket.emit('hub.others.get')
    ask()
    socketEventEmitter.on("connected", ask)
    return () => {
      socketEventEmitter.off("connected", ask)
      socket.off('hub.others', onOthers)
    }
  }, [])

  return others
}

export default useOtherHubs
