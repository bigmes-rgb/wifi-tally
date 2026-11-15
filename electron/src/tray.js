const { app, Tray, Menu, dialog, nativeImage } = require('electron')
const open = require("open")
const path = require("path")
const appUpdate = require('vtally/src/lib/AppUpdate').default

const httpPort = (typeof process.env.PORT === "string" && parseInt(process.env.PORT, 10)) || 3000
const assetsPath = app.isPackaged ? path.join(process.resourcesPath, "assets") : "assets";

const openBrowser = () => {
    open(`http://localhost:${httpPort}`)
}

const exitApp = () => {
    dialog.showMessageBox({
        title: "Really quit ACC Tally?",
        message: "Do you really want to stop ACC Tally?",
        buttons: ["No", "Yes"],
        defaultId: 0,
        cancelId: 0,
    }).then(({response}) => {
        if (response === 1) {
            app.quit()
        }
    })
}

const restartToUpdate = () => {
    const { version } = appUpdate.get()
    dialog.showMessageBox({
        title: "Update ACC Tally?",
        message: `Restart now to install ACC Tally ${version}?`,
        detail: "It takes about 20 seconds. Meanwhile the lights show they are looking for the hub, then carry on by themselves.",
        buttons: ["Not now", "Restart and update"],
        defaultId: 0,
        cancelId: 0,
    }).then(({response}) => {
        if (response === 1) appUpdate.install()
    })
}

// one line in the menu saying where the app's own update stands
const updateLine = (state) => {
    switch (state.status) {
        case "checking": return { label: "Checking for updates…", enabled: false }
        case "current": return { label: "Up to date", enabled: false }
        case "downloading": return { label: `Downloading ${state.version}… ${state.percent || 0}%`, enabled: false }
        case "ready": return { label: `Restart to update to ${state.version}`, click: restartToUpdate }
        case "error": return { label: "Could not check for updates", enabled: false }
        default: return null
    }
}

let tray = null
const buildMenu = () => {
    if (!tray) return
    const state = appUpdate.get()
    const line = updateLine(state)
    const canCheck = state.status === "current" || state.status === "error"
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: `ACC Tally ${app.getVersion()}`, enabled: false },
        ...(line ? [line] : []),
        ...(canCheck ? [{ label: "Check for updates", click: () => appUpdate.check() }] : []),
        { type: "separator" },
        {
            label: 'Open in Browser',
            toolTip: 'Opens ACC Tally in your default browser',
            click: openBrowser,
        },
        { type: "separator" },
        {
            label: 'Exit',
            click: exitApp
        }
    ]))
    tray.setToolTip(state.status === "ready" ? `ACC | Tally: ${state.version} ready to install` : 'ACC | Tally')
}

app.whenReady().then(() => {
    const icon = nativeImage.createFromPath(path.join(assetsPath, "icon.ico"))
    tray = new Tray(icon)
    buildMenu()
    appUpdate.on('change', buildMenu)
})
