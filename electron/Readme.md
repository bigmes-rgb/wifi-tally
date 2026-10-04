# Electron wrapper

Packages the hub (`../hub`) as a desktop app: a tray icon with "Open in Browser"
and "Exit", plus the hub server running inside. This is what the
`vtally-<version>-win-x64-portable.exe` on the Releases page is.

Vendored from [wifi-tally/electron-dist](https://github.com/wifi-tally/electron-dist)
(MIT) so that one repository and one workflow produce every release artifact.

## Building locally

```bash
# 1. build the hub package
cd ../hub && npm ci && ./scripts/build.sh && cd dist && npm pack
# 2. point the wrapper at it and build the executable
cd ../../electron && npm ci
node scripts/prepare.js ../hub/dist/vtally-*.tgz
npx electron-rebuild
npm run dist -- --config.npmRebuild=false
```

The executable lands in `dist/`. Windows builds must run on Windows, because
the hub's `midi` and `serialport` modules are compiled for the host platform.

## Where the settings live

The app stores nothing next to the executable. Mixer settings and the tally
list are in `%USERPROFILE%\.wifi-tally.json`; logs are in
`%USERPROFILE%\AppData\Roaming\vtally-electron\logs\main.log`. Replacing the
executable with a newer release keeps both.
