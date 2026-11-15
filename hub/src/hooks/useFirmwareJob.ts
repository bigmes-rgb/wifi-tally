import { useEffect, useState } from 'react'
import type { FirmwareJob } from '../flasher/NodeMcuConnector'
import { socket, socketEventEmitter } from './useSocket'

// The firmware install the hub runs, or ran last. The hub keeps it, so a page opened or reloaded in the middle of
// an install shows that install. undefined until the hub answered, null when it has not installed anything.
function useFirmwareJob(): FirmwareJob | null | undefined {
  const [job, setJob] = useState<FirmwareJob | null | undefined>(undefined)
  useEffect(() => {
    const onJob = (j: FirmwareJob | null) => setJob(j)
    socket.on('flasher.firmware.job', onJob)
    // asked again after a reconnect: a hub that restarted (an update, say) may answer differently
    const ask = () => socket.emit('flasher.firmware.job.get')
    ask()
    socketEventEmitter.on("connected", ask)
    return () => { socket.off('flasher.firmware.job', onJob); socketEventEmitter.off("connected", ask) }
  }, [])
  return job
}

export default useFirmwareJob
