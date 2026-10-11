import type { FirmwareJob } from '../flasher/NodeMcuConnector'

// One line in the hub log when a browser page opens, and one when it closes: enough to see a page reloaded in the
// middle of an install, and that the install carried on.

// which page, from the address the browser came from: "/setup/light"
export function pagePath(referer?: string): string {
  try {
    return referer ? new URL(referer).pathname : "?"
  } catch (e) {
    return "?"
  }
}

const duration = (ms: number) => {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
}

export const pageOpenedLine = (page: string, open: number) => `[page] opened ${page} (${open} open)`

export function pageClosedLine(page: string, openMs: number, reason?: string, install?: FirmwareJob | null): string {
  const carriesOn = install?.running ? `; the firmware install on ${install.path} carries on` : ""
  return `[page] closed ${page} after ${duration(openMs)}${reason ? ` (${reason})` : ""}${carriesOn}`
}
