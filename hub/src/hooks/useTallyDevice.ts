import { useEffect, useState } from 'react'
import TallyDevice, { TallyDeviceObjectType } from '../flasher/TallyDevice'
import { socket } from './useSocket'

// the tally plugged into the hub's USB port. Every change of `refresh` asks the hub again.
function useTallyDevice(refresh: number) {
  const [tallyDevice, setTallyDevice] = useState<TallyDevice>(undefined)

  useEffect(() => {
    const onFlasherDevice = (device: TallyDeviceObjectType) => {
      setTallyDevice(TallyDevice.fromJson(device))
    }
    socket.on('flasher.device', onFlasherDevice)

    setTallyDevice(undefined)
    socket.emit('flasher.device.get')
    return () => {
      socket.off('flasher.device', onFlasherDevice)
    }
  }, [refresh])

  return tallyDevice
}

export default useTallyDevice
