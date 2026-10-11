import { useEffect, useState } from 'react'
import TallyDevice, { TallyDeviceObjectType } from '../flasher/TallyDevice'
import { socket } from './useSocket'

// the tally plugged into the hub's USB port. Every change of `refresh` asks the hub again.
// path: the board picked when several are plugged in; otherwise the hub picks the likeliest.
// newBoard: another board was plugged in, so what the hub did to the last one does not apply (read at refresh).
function useTallyDevice(refresh: number, path?: string, newBoard?: boolean) {
  const [tallyDevice, setTallyDevice] = useState<TallyDevice>(undefined)

  useEffect(() => {
    const onFlasherDevice = (device: TallyDeviceObjectType) => {
      setTallyDevice(TallyDevice.fromJson(device))
    }
    socket.on('flasher.device', onFlasherDevice)

    setTallyDevice(undefined)
    socket.emit('flasher.device.get', path || newBoard ? { path, newBoard } : undefined)
    return () => {
      socket.off('flasher.device', onFlasherDevice)
    }
  }, [refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  return tallyDevice
}

export default useTallyDevice
