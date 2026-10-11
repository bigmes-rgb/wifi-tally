import { useEffect, useState } from 'react'

// A value kept for this browser tab (sessionStorage), so reloading the page does not lose it. Storage that is not
// there (blocked, a private window) only means the value is not kept; a stored value that does not fit is not used.
function useSessionState<T>(key: string, initial: () => T, valid: (value: unknown) => boolean = () => true): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.sessionStorage.getItem(key)
      if (stored !== null) {
        const parsed = JSON.parse(stored)
        if (valid(parsed)) return parsed as T
      }
    } catch (e) {
      // not kept
    }
    return initial()
  })
  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      // not kept
    }
  }, [key, value])
  return [value, setValue]
}

export default useSessionState
