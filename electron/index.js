// override logging
// @see https://github.com/megahertz/electron-log#overriding-consolelog
Object.assign(console, require('electron-log').functions);

console.log("Using Electron Runner for vTally");
console.log("================================");
console.log("");


const { app, dialog } = require('electron')

let appLock = app.requestSingleInstanceLock()
if (!appLock) {
    dialog.showErrorBox(
        'Multiple instances',
        'Another instance of vTally is already running. Please close the other instance first.'
    )
    app.quit()
    return
}

// The hub runs in this process. Electron's own answer to an uncaught error is a modal box that
// stops all of the hub's JavaScript (the lights' keep-alives, the switcher, the web page) until
// someone clicks OK, in the middle of a service. Log it to the log file and keep going instead.
// Only an error that keeps the hub from starting at all is shown, and then vTally quits.
const onUnexpected = (kind) => (err) => {
    console.error(`${kind}: ${(err && err.stack) || err}`)
    if (err && err.code === 'EADDRINUSE') {
        dialog.showErrorBox('vTally cannot start', String(err.message))
        app.exit(1)
    }
}
process.on('uncaughtException', onUnexpected('Uncaught exception'))
process.on('unhandledRejection', onUnexpected('Unhandled promise rejection'))

// start vTally
process.env.NODE_ENV = 'production'
require('vtally/src/server')
require('./src/tray')
