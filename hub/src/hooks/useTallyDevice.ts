import { useEffect, useState } from 'react'
import TallyDevice, { TallyDeviceObjectType } from '../flasher/TallyDevice'
import { socket } from './useSocket'

// the tally plugged into the hub's USB port. Every change of `refresh` asks the hub again.
// listenMs: how long the hub listens to a board that does not answer before reporting.
// path: the board picked when several are plugged in; otherwise the hub picks the likeliest.
function useTallyDevice(refresh: number, listenMs?: number, path?: string) {
  const [tallyDevice, setTallyDevice] = useState<TallyDevice>(undefined)

  useEffect(() => {
    const onFlasherDevice = (device: TallyDeviceObjectType) => {
      setTallyDevice(TallyDevice.fromJson(device))
    }
    socket.on('flasher.device', onFlasherDevice)

    setTallyDevice(undefined)
    socket.emit('flasher.device.get', listenMs || path ? { listenMs, path } : undefined)
    return () => {
      socket.off('flasher.device', onFlasherDevice)
    }
  }, [refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  return tallyDevice
}

export default useTallyDevice
