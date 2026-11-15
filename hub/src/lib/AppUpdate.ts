import { EventEmitter } from 'events'

// The installed desktop app keeping itself up to date. electron/src/updates.js does the work (it looks for a newer
// release, downloads it, and restarts into it when asked); the hub only shows what it says and passes the
// operator's "Restart and update" back. Outside the installed Windows app (the npm package, development, the old
// portable exe) nothing attaches, the status stays "unsupported", and the pages show nothing.
export type AppUpdateStatus = "unsupported" | "checking" | "current" | "downloading" | "ready" | "error"

export type AppUpdateState = {
  status: AppUpdateStatus
  // the version running now
  current?: string
  // the version being downloaded, or ready to install
  version?: string
  percent?: number
  problem?: string
}

export class AppUpdate extends EventEmitter {
  private state: AppUpdateState = { status: "unsupported" }
  private installer: (() => void) | null = null
  private checker: (() => void) | null = null

  get(): AppUpdateState {
    return this.state
  }

  set(state: AppUpdateState) {
    this.state = state
    this.emit('change', state)
  }

  // the desktop app says how to restart into a downloaded version and how to look for a new one
  attach(install: () => void, check: () => void) {
    this.installer = install
    this.checker = check
  }

  // only once a version is downloaded: true when the restart was started
  install(): boolean {
    if (this.state.status !== "ready" || !this.installer) return false
    this.installer()
    return true
  }

  check(): boolean {
    if (!this.checker || this.state.status === "ready" || this.state.status === "downloading") return false
    this.checker()
    return true
  }
}

// One for the whole process. The desktop app and the hub's server load this file by different paths, so the
// instance hangs off the global object rather than relying on both paths meeting in node's module cache.
const shared = global as unknown as { accTallyAppUpdate?: AppUpdate }
const appUpdate: AppUpdate = shared.accTallyAppUpdate || (shared.accTallyAppUpdate = new AppUpdate())

export default appUpdate
