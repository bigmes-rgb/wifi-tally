import { useState, useEffect } from 'react';
import {socket} from './useSocket'
import MixerTracker from './tracker/mixer'

const mixerTracker = new MixerTracker(socket)

// the hook
function useMixerInfo() {
  const [isMixerConnected, setIsMixerConnected] = useState(mixerTracker.connectionState)

  useEffect(() => {
    const onConnectionChange = (isConnected: boolean) => {
      setIsMixerConnected(isConnected)
    }
    mixerTracker.on("connection", onConnectionChange)
    return () => {
      // cleanup
      mixerTracker.off("connection", onConnectionChange)
    }
  }, [])

  return isMixerConnected
}

export default useMixerInfo

// why the mixer is not connected, or null
export function useMixerProblem() {
  const [problem, setProblem] = useState<string | null>(mixerTracker.problem)

  useEffect(() => {
    const onProblem = (p: string | null) => setProblem(p)
    mixerTracker.on("problem", onProblem)
    setProblem(mixerTracker.problem)
    return () => {
      mixerTracker.off("problem", onProblem)
    }
  }, [])

  return problem
}
