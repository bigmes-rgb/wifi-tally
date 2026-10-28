import { useEffect, useState } from 'react'
import { OtherHubType } from '../lib/HubInfo'
import { socket } from './useSocket'

// other vTally hubs heard on the network (see tally/HubBeacon): more than one makes lights go missing
function useOtherHubs(): OtherHubType[] {
  const [others, setOthers] = useState<OtherHubType[]>([])

  useEffect(() => {
    const onOthers = (list: OtherHubType[]) => setOthers(list)
    socket.on('hub.others', onOthers)
    socket.emit('hub.others.get')
    return () => {
      socket.off('hub.others', onOthers)
    }
  }, [])

  return others
}

export default useOtherHubs
