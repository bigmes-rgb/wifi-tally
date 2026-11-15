// Keeps the installed app up to date. It looks for a newer release of ACC Tally on GitHub shortly after it starts
// and every few hours, downloads it in the background, and tells the hub's pages and the tray that it is ready.
// It never restarts by itself: a service could be running. The operator picks the moment ("Restart and update"
// on the Tallies page, in the OBS dock or in the tray), or the new version installs the next time the app closes.
// Only the installed app can update itself; a development run says "unsupported" and the pages show nothing.
const { app } = require('electron')
const log = require('electron-log')
const appUpdate = require('vtally/src/lib/AppUpdate').default

const FIRST_CHECK_MS = 15 * 1000
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

function startUpdates() {
    const current = app.getVersion()
    if (!app.isPackaged || process.platform !== 'win32' || process.env.PORTABLE_EXECUTABLE_DIR) {
        appUpdate.set({ status: "unsupported", current })
        return
    }
    const { autoUpdater } = require('electron-updater')
    autoUpdater.logger = log
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    let coming = null // the version being downloaded
    let ready = null  // the version downloaded and waiting
    let lastPercent = -1
    const set = state => appUpdate.set({ current, ...state })
    // straight away, so the tray and the pages know from the start that this app can update itself
    set({ status: "checking" })

    // It keeps looking while a version waits: a fix published meanwhile replaces it, so the restart installs the
    // newest. Looking again finds the waiting version as well; that must not hide the "ready" it already said.
    autoUpdater.on('checking-for-update', () => { if (!ready) set({ status: "checking" }) })
    autoUpdater.on('update-not-available', () => { if (!ready) set({ status: "current" }) })
    autoUpdater.on('update-available', info => {
        if (info.version === ready) return
        coming = info.version
        // a newer one replaces the waiting one: nothing to restart into until it is downloaded
        ready = null
        lastPercent = 0
        log.info(`ACC Tally ${coming} is available; downloading it`)
        set({ status: "downloading", version: coming, percent: 0 })
    })
    autoUpdater.on('download-progress', progress => {
        if (ready) return
        // the tray shows it; no need to tell every page about each percent
        const percent = Math.floor(progress.percent / 10) * 10
        if (percent === lastPercent) return
        lastPercent = percent
        set({ status: "downloading", version: coming, percent })
    })
    autoUpdater.on('update-downloaded', info => {
        if (info.version === ready) return
        ready = info.version
        log.info(`ACC Tally ${ready} is downloaded and installs on the next restart`)
        set({ status: "ready", version: ready })
    })
    autoUpdater.on('error', e => {
        const problem = (e && e.message ? e.message : String(e)).split("\n")[0]
        log.warn(`Could not update ACC Tally: ${problem}`)
        if (!ready) set({ status: "error", problem })
    })

    const check = () => {
        autoUpdater.checkForUpdates().catch(() => { /* reported by the "error" event */ })
    }
    const install = () => {
        log.info(`Restarting to install ACC Tally ${ready}`)
        // silent install, then the new version starts by itself
        setImmediate(() => autoUpdater.quitAndInstall(true, true))
    }
    appUpdate.attach(install, check)
    setTimeout(check, FIRST_CHECK_MS)
    setInterval(check, CHECK_EVERY_MS)
}

module.exports = { startUpdates }
