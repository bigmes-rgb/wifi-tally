import { useEffect, useRef, useState } from 'react'
import TallyDevice, { TallyDeviceObjectType } from '../flasher/TallyDevice'
import type { FirmwareJob } from '../flasher/NodeMcuConnector'
import { socket } from './useSocket'

// the tally plugged into the hub's USB port. Every change of `refresh` asks the hub again.
// path: the board picked when several are plugged in; otherwise the hub picks the likeliest.
// newBoard: another board was plugged in, so what the hub did to the last one does not apply (read at refresh).
//
// A board read before a firmware install ended is out of date once it ends. The page that started the install may
// show another step by then, or another window started it: whoever holds the board asks again, once, as the same
// board. A check still waiting when the install ends waits behind it and brings the board anyway.
function useTallyDevice(refresh: number, path?: string, newBoard?: boolean) {
  const [tallyDevice, setTallyDevice] = useState<TallyDevice>(undefined)
  const holding = useRef(false) // a board is shown, and no check is under way
  const pathNow = useRef(path)
  pathNow.current = path

  const ask = (options?: { path?: string, newBoard?: boolean }) => {
    holding.current = false
    setTallyDevice(undefined)
    socket.emit('flasher.device.get', options?.path || options?.newBoard ? options : undefined)
  }

  useEffect(() => {
    const onFlasherDevice = (device: TallyDeviceObjectType) => {
      holding.current = true
      setTallyDevice(TallyDevice.fromJson(device))
    }
    let sawRunning = false
    const onFirmwareJob = (job: FirmwareJob | null) => {
      if (job?.running) { sawRunning = true; return }
      if (!sawRunning) return
      sawRunning = false
      if (job?.progress.phase === "done" && holding.current) ask(pathNow.current ? { path: pathNow.current } : undefined)
    }
    socket.on('flasher.device', onFlasherDevice)
    socket.on('flasher.firmware.job', onFirmwareJob)
    return () => {
      socket.off('flasher.device', onFlasherDevice)
      socket.off('flasher.firmware.job', onFirmwareJob)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ask({ path, newBoard })
  }, [refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  return tallyDevice
}

export default useTallyDevice
