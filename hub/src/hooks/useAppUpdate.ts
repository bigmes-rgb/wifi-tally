import { useEffect, useState } from 'react'
import { AppUpdateState } from '../lib/AppUpdate'
import { socket, socketEventEmitter } from './useSocket'

// the desktop app's own update: checking, downloading, ready to install (see lib/AppUpdate.ts)
function useAppUpdate(): AppUpdateState | undefined {
  const [state, setState] = useState<AppUpdateState | undefined>(undefined)

  useEffect(() => {
    const onState = (s: AppUpdateState) => setState(s)
    socket.on('app.update', onState)
    // asked again after a reconnect: a hub that restarted (an update, say) may answer differently
    const ask = () => socket.emit('app.update.get')
    ask()
    socketEventEmitter.on("connected", ask)
    return () => {
      socketEventEmitter.off("connected", ask)
      socket.off('app.update', onState)
    }
  }, [])

  return state
}

export default useAppUpdate
