import { useEffect, useState } from 'react'
import { AppUpdateState } from '../lib/AppUpdate'
import { socket } from './useSocket'

// the desktop app's own update: checking, downloading, ready to install (see lib/AppUpdate.ts)
function useAppUpdate(): AppUpdateState | undefined {
  const [state, setState] = useState<AppUpdateState | undefined>(undefined)

  useEffect(() => {
    const onState = (s: AppUpdateState) => setState(s)
    socket.on('app.update', onState)
    socket.emit('app.update.get')
    return () => {
      socket.off('app.update', onState)
    }
  }, [])

  return state
}

export default useAppUpdate
