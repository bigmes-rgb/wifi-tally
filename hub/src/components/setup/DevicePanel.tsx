import { Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, makeStyles, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import RefreshIcon from '@material-ui/icons/Refresh'
import React, { useEffect, useRef, useState } from 'react'
import TallyDevice from '../../flasher/TallyDevice'
import { BoardState, hubAddressesIn } from '../../flasher/BoardListener'
import { TallyProgramProgressType } from '../../flasher/NodeMcuConnector'
import { FirmwareProgressType } from '../../flasher/FirmwareFlasher'
import { socket } from '../../hooks/useSocket'
import useHubInfo from '../../hooks/useHubInfo'
import Help from '../flasher/Help'
import BootMessageReader from './BootMessageReader'
import ProgramProgress from '../flasher/ProgramProgress'
import Spinner from '../layout/Spinner'

const useStyles = makeStyles(theme => ({
  block: {
    marginBottom: theme.spacing(2),
  },
  output: {
    maxHeight: 220,
    overflow: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    fontSize: "0.8em",
    background: theme.palette.background.default,
    padding: theme.spacing(1),
    borderRadius: 4,
  },
}))

// What to tell someone holding a board that does not answer, from what it printed.
type Advice = { severity: "info" | "warning" | "error", text: string, wait: boolean }
export const ADVICE: Record<BoardState, Advice> = {
  ready: { severity: "info", text: "The board answers.", wait: true },
  formatting: { severity: "info", wait: true, text: "The firmware is installed. The board is setting up its storage for the first time and answers nothing until it is done. Leave it plugged in, wait a minute, then check again." },
  busy: { severity: "info", wait: true, text: "The NodeMCU firmware is running but has not answered yet. Wait a few seconds and check again." },
  silent: { severity: "warning", wait: false, text: "The board is not saying anything. If you just installed the firmware, press the board's RST button once (do not hold FLASH), wait a minute, then check again. If it stays silent, install the firmware again." },
  crashing: { severity: "error", wait: false, text: "The board keeps crashing and restarting: the firmware did not install cleanly. Install it again." },
  otherFirmware: { severity: "warning", wait: false, text: "The board runs something other than the NodeMCU firmware, as boards straight from the box do. Install the firmware; it takes one to two minutes." },
  tallyBusy: { severity: "info", wait: true, text: "The tally software is running on it (it is printing its log) but did not answer in time. Press Check again." },
  twoHubs: { severity: "warning", wait: true, text: "The light is on the Wi-Fi but hears a vTally hub at two addresses, and switches between them so fast that it cannot answer." },
}

// What to do about a light that hears a hub at two addresses. The hub knows its own addresses, so
// it can tell "this computer is on the network twice" from "another computer runs vTally".
export function twoHubsText(heard: string[], own: string[]): string {
  const others = heard.filter(a => !own.includes(a))
  const after = "press RST on the board, wait a minute, then Check again."
  if (own.length > 0 && others.length === 0) {
    return `${heard.length === 2 ? "Both" : "All"}, ${heard.join(" and ")}, are this computer: it is on the network twice, by cable and by Wi-Fi. Unplug its network cable or turn its Wi-Fi off, ${after}`
  }
  if (own.length > 0) {
    return `${others.join(" and ")} ${others.length === 1 ? "is another computer" : "are other computers"} running vTally. Close vTally there, ${after}`
  }
  return `The addresses are ${heard.join(" and ")}. Either another computer on this network runs vTally (close it there), or this computer is on the network twice, by cable and by Wi-Fi (unplug the cable or turn its Wi-Fi off). Then ${after}`
}

type Props = {
  device: TallyDevice | undefined
  // afterFirmware: the board was just flashed; give it time for its first start
  onReload: (options?: { afterFirmware?: boolean }) => void
}

export const deviceIsReady = (device: TallyDevice | undefined) => device?.nodeMcuVersion !== undefined && device?.update !== "updateable" && !device?.firmwareProblem

// Finds the light on USB and puts the tally program on it if it is missing or old.
function DevicePanel({ device, onReload }: Props) {
  const classes = useStyles()
  const hub = useHubInfo()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<TallyProgramProgressType>(undefined)
  const [firmware, setFirmware] = useState<FirmwareProgressType>(undefined)
  const [programming, setProgramming] = useState(false)
  // the board was just flashed and is on its first start; cleared when the hub reports back
  const [firstStart, setFirstStart] = useState(false)
  useEffect(() => { if (device !== undefined) setFirstStart(false) }, [device])
  // the dialog fades out after it is closed; keep showing what it said until then
  const lastFirmware = useRef<FirmwareProgressType>(undefined)
  if (firmware) lastFirmware.current = firmware
  const shownFirmware = firmware || lastFirmware.current

  const isLoading = device === undefined
  const hasLua = device?.nodeMcuVersion !== undefined
  const needsSoftware = device?.update === "updateable"
  // a board on USB that does not run Lua: straight from the box, or wedged
  const needsFirmware = !isLoading && device?.path !== undefined && !hasLua

  const installFirmware = () => {
    setFirmware({ phase: "connecting", percent: 0 })
    setBusy(true)
    const onProgress = (p: FirmwareProgressType) => {
      setFirmware({ ...p })
      if (p.phase === "done" || p.phase === "error") {
        socket.off('flasher.firmware.progress', onProgress)
        setBusy(false)
        if (p.phase === "done") { setFirmware(undefined); setFirstStart(true); onReload({ afterFirmware: true }) }
      }
    }
    socket.on('flasher.firmware.progress', onProgress)
    socket.emit('flasher.firmware', device.path)
  }

  const installSoftware = () => {
    setProgress(undefined)
    setBusy(true)
    setProgramming(true)
    const onProgress = (p: TallyProgramProgressType) => {
      setProgress({ ...p })
      if (p.allDone || p.error) {
        socket.off('flasher.program.progress', onProgress)
        setBusy(false)
        setProgramming(false)
        if (!p.error) { setProgress(undefined); onReload() }
      }
    }
    socket.on('flasher.program.progress', onProgress)
    socket.emit('flasher.program', device.path)
  }

  return <div data-testid="device-panel">
    <Dialog open={programming || !!progress?.error}>
      <DialogTitle>Installing the tally software</DialogTitle>
      <DialogContent>
        {progress && <ProgramProgress progress={progress} />}
        {progress?.error && <Alert severity="error" className={classes.block}>That did not work. Unplug the light, plug it back in and try again.</Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={() => setProgress(undefined)}>Close</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={!!firmware}>
      <DialogTitle>Installing the NodeMCU firmware</DialogTitle>
      <DialogContent>
        {shownFirmware && <>
          <LinearProgress variant="determinate" value={shownFirmware.percent} className={classes.block} />
          <Typography paragraph data-testid="firmware-phase">
            {shownFirmware.phase === "connecting" && "Connecting to the board…"}
            {shownFirmware.phase === "writing" && `Writing… ${shownFirmware.percent}%`}
            {shownFirmware.phase === "restarting" && "Restarting the board…"}
            {shownFirmware.phase === "done" && "Firmware installed."}
            {shownFirmware.phase === "error" && "Installing the firmware failed."}
          </Typography>
          {shownFirmware.pressReset && shownFirmware.phase === "restarting"
            ? <Alert severity="warning" className={classes.block} data-testid="firmware-press-reset">
                <strong>Press the RST button on the board once</strong>: the small button next to the USB socket. Do not hold FLASH.
                The firmware is installed, but this board did not restart by itself. The install carries on as soon as it does.
              </Alert>
            : shownFirmware.message && shownFirmware.phase !== "error" && <Typography color="textSecondary">{shownFirmware.message}</Typography>}
          {shownFirmware.phase === "error" && <Alert severity="error" className={classes.block}>
            {shownFirmware.message}<br />
            Unplug the board, plug it back in and try again. Some boards need help: hold the <strong>FLASH</strong> button, tap <strong>RST</strong>, release FLASH, then start the install.
          </Alert>}
        </>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={() => setFirmware(undefined)}>Close</Button>
      </DialogActions>
    </Dialog>

    <Typography paragraph color="textSecondary">
      Use a USB <em>data</em> cable into the computer the hub runs on. A brand-new board straight from the box is fine.
    </Typography>
    <div className={classes.block}>
      {isLoading ? (firstStart
        ? <Alert severity="info" className={classes.block} data-testid="device-first-start">
            Firmware installed. The board is now starting for the first time and setting up its storage, which can take up
            to two minutes. Leave it plugged in; this page carries on by itself.
            <LinearProgress color="secondary" style={{ marginTop: 8 }} />
          </Alert>
        : <Spinner />) : (
        needsFirmware && device.firmwareAvailable ? (() => {
          const advice = device.boardState ? ADVICE[device.boardState] : undefined
          const hubs = device.boardState === "twoHubs" ? hubAddressesIn(device.boardOutput || "") : []
          const install = <Button color="inherit" size="small" onClick={installFirmware} disabled={busy} data-testid="device-firmware">Install firmware</Button>
          const check = <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={() => onReload()} disabled={busy} data-testid="device-check">Check again</Button>
          return <>
            <Alert severity={advice?.severity || "warning"} className={classes.block} action={advice?.wait ? check : install} data-testid={`device-state-${device.boardState || "unknown"}`}>
              Found a board on {device.path}, but nothing answers on it. {advice ? advice.text : "A board straight from the box needs the NodeMCU firmware first; this takes one to two minutes."}
              {hubs.length >= 2 && <> {twoHubsText(hubs, hub?.addresses || [])}</>}
            </Alert>
            {device.boardOutput && <details className={classes.block} data-testid="device-output">
              <summary><Typography variant="caption" color="textSecondary" component="span">What the board printed</Typography></summary>
              <pre className={classes.output}>{device.boardOutput}</pre>
            </details>}
            {device.errorMessage && <Typography variant="caption" color="textSecondary" display="block" data-testid="device-error">{device.errorMessage}</Typography>}
            {/* the firmware is in but nothing answers: the chip's own start-up message says why */}
            {(device.boardState === "silent" || device.boardState === "otherFirmware" || device.boardState === "crashing") && <BootMessageReader path={device.path} />}
            <Typography variant="caption" color="textSecondary">
              {advice?.wait
                ? <>Still the same after two minutes? <Button size="small" onClick={installFirmware} disabled={busy}>Install the firmware again</Button>.</>
                : <>Already installed it? Press the board's RST button, wait a minute and <Button size="small" onClick={() => onReload()} disabled={busy}>check again</Button>.</>}
            </Typography>
          </>
        })() :
        !hasLua ? <Help tallyDevice={device} onReload={() => onReload()} /> : (
          <Alert severity="success" action={<Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={() => onReload()} disabled={busy}>Check again</Button>}>
            Found a light on {device.path}{device.tallySettings?.getTallyName() ? <>, currently named <strong>{device.tallySettings.getTallyName()}</strong></> : ", not set up yet"}.
          </Alert>
        )
      )}
    </div>
    {hasLua && device.firmwareProblem && <Alert severity="error" className={classes.block} data-testid="device-firmware-problem"
      action={device.firmwareAvailable && <Button color="inherit" size="small" onClick={installFirmware} disabled={busy} data-testid="device-firmware">Install firmware</Button>}>
      {device.firmwareProblem} Install the NodeMCU firmware first; it takes one to two minutes. The light's name and Wi-Fi come back at "Name and Wi-Fi".
    </Alert>}
    {hasLua && !device.firmwareProblem && <div className={classes.block}>
      {needsSoftware && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={installSoftware} disabled={busy} data-testid="device-install">Install now</Button>}>
        This light does not have the current tally software. Installing takes about a minute.
      </Alert>}
      {device.update === "up-to-date" && <Alert severity="success">The tally software on this light is current.</Alert>}
      {device.update === "not-available" && <Alert severity="info">This hub was started without the tally software bundle, so it cannot install it. The light keeps whatever it has.</Alert>}
    </div>}
  </div>
}

export default DevicePanel
