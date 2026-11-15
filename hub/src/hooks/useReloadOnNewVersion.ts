import { useEffect, useRef } from 'react'
import useHubInfo from './useHubInfo'

// The hub updated itself (it restarted into another version), but an open page still runs the old version's code:
// the dock in OBS stays open for weeks. Once the page hears a version other than the one it was loaded with, it
// reloads, and shows what the hub now has. The hub restarted anyway, so nothing in the page is lost that the
// restart did not already end.
export function useReloadOnNewVersion(reload: () => void = () => window.location.reload()) {
  const info = useHubInfo()
  const loadedWith = useRef<string | undefined>(undefined)
  const version = info?.version
  useEffect(() => {
    if (!version) return
    if (loadedWith.current === undefined) {
      loadedWith.current = version
    } else if (version !== loadedWith.current) {
      reload()
    }
  }, [version, reload])
}

// for the routes: one place that every page goes through
export function ReloadOnNewVersion() {
  useReloadOnNewVersion()
  return null
}

export default useReloadOnNewVersion
