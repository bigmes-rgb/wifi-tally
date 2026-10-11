import { Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, makeStyles, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import RefreshIcon from '@material-ui/icons/Refresh'
import React, { useEffect, useRef, useState } from 'react'
import TallyDevice from '../../flasher/TallyDevice'
import { hubAddressesIn } from '../../flasher/BoardListener'
import { nextStepFor } from '../../flasher/BoardAdvice'
import { FirmwareJob, TallyProgramProgressType } from '../../flasher/NodeMcuConnector'
import { FirmwareProgressType } from '../../flasher/FirmwareFlasher'
import { socket } from '../../hooks/useSocket'
import useFirmwareJob from '../../hooks/useFirmwareJob'
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

// what the install is doing, in a few words
export function installStep(progress: FirmwareProgressType): string {
  switch (progress.phase) {
    case "connecting": return "Connecting to the board…"
    case "erasing": return "Erasing the board…"
    case "writing": return `Writing… ${progress.percent}%`
    case "restarting": return "Restarting the board…"
    case "done": return "Firmware installed and checked."
    default: return "Installing the firmware failed."
  }
}

// For a page that waits for its board check while the hub installs the firmware: what the hub is doing, instead
// of a bare spinner. The install goes on in the hub whatever the page does.
export function InstallRunning({ job, action }: { job: FirmwareJob, action?: React.ReactNode }) {
  return <Alert severity="info" style={{ marginBottom: 16 }} action={action} data-testid="device-install-running">
    The hub is installing the NodeMCU firmware on {job.path}: {installStep(job.progress)}
    {job.progress.pressReset && <> It is waiting for the board to restart: press its RST button once (do not hold FLASH), or unplug the board and plug it back in.</>}
    {" "}This page carries on when it is done.
    <LinearProgress variant="determinate" value={job.progress.percent} style={{ marginTop: 8 }} />
  </Alert>
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
  // newBoard: another board was plugged in, so the hub forgets the install it did on the last one
  onReload: (options?: { newBoard?: boolean }) => void
}

export const deviceIsReady = (device: TallyDevice | undefined) => device?.nodeMcuVersion !== undefined && device?.update !== "updateable" && !device?.firmwareProblem

// Finds the light on USB and puts the tally program on it if it is missing or old.
function DevicePanel({ device, onReload }: Props) {
  const classes = useStyles()
  const hub = useHubInfo()
  const [progress, setProgress] = useState<TallyProgramProgressType>(undefined)
  const [programming, setProgramming] = useState(false)
  // The install belongs to the hub: the dialog shows the one this page started, or one that was already running
  // when the page was opened or reloaded. Hiding it does not stop the install.
  const job = useFirmwareJob()
  const [hidden, setHidden] = useState(false)
  // an install that failed before the firmware was on the board: the dialog stays on it until closed
  const [failed, setFailed] = useState<FirmwareProgressType | undefined>(undefined)
  // An install that ends with the firmware on the board goes on to the board's first start: whoever holds the board
  // asks the hub again (useTallyDevice), on whichever step the page is. A failure stays in the dialog.
  const watching = useRef(false)
  useEffect(() => {
    if (!job) return
    if (job.running) { watching.current = true; return }
    if (!watching.current) return
    watching.current = false
    if (job.progress.phase !== "done") {
      setFailed(job.progress)
      setHidden(false)
    }
  }, [job])
  const firmware = job?.running ? job.progress : failed
  const busy = programming || !!job?.running
  // the dialog fades out after it is closed; keep showing what it said until then
  const lastFirmware = useRef<FirmwareProgressType>(undefined)
  if (firmware) lastFirmware.current = firmware
  const shownFirmware = firmware || lastFirmware.current

  const isLoading = device === undefined
  // while the hub installs, what the board said before the install is out of date: the install shows instead
  const installing = !!job?.running
  const hasLua = device?.nodeMcuVersion !== undefined
  const needsSoftware = device?.update === "updateable"
  // a board on USB that does not run Lua: straight from the box, or wedged
  const needsFirmware = !isLoading && device?.path !== undefined && !hasLua

  const installFirmware = () => {
    setFailed(undefined)
    setHidden(false)
    socket.emit('flasher.firmware', device.path)
  }

  const installSoftware = () => {
    setProgress(undefined)
    setProgramming(true)
    const onProgress = (p: TallyProgramProgressType) => {
      setProgress({ ...p })
      if (p.allDone || p.error) {
        socket.off('flasher.program.progress', onProgress)
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

    <Dialog open={!!firmware && !hidden}>
      <DialogTitle>Installing the NodeMCU firmware{job?.path ? ` on ${job.path}` : ""}</DialogTitle>
      <DialogContent>
        {shownFirmware && <>
          <LinearProgress variant="determinate" value={shownFirmware.percent} className={classes.block} />
          <Typography paragraph data-testid="firmware-phase">{installStep(shownFirmware)}</Typography>
          {shownFirmware.pressReset && shownFirmware.phase === "restarting"
            ? <Alert severity="warning" className={classes.block} data-testid="firmware-press-reset"
                action={<Button color="inherit" size="small" onClick={() => socket.emit('flasher.firmware.restarted')} data-testid="firmware-restarted">Done</Button>}>
                The firmware is installed and checked, but this board did not restart by itself.
                {" "}<strong>Press its RST button once</strong> (the small button next to the USB socket; do not hold FLASH),
                {" "}<strong>or unplug the board and plug it back in</strong>. Then press Done.
              </Alert>
            : shownFirmware.message && shownFirmware.phase !== "error" && <Typography color="textSecondary">{shownFirmware.message}</Typography>}
          {shownFirmware.phase === "error" && <Alert severity="error" className={classes.block}>
            {shownFirmware.message}<br />
            Unplug the board, plug it back in and try again. Some boards need help: hold the <strong>FLASH</strong> button, tap <strong>RST</strong>, release FLASH, then start the install.
          </Alert>}
        </>}
      </DialogContent>
      <DialogActions>
        {job?.running
          ? <Button onClick={() => setHidden(true)} data-testid="firmware-hide">Hide</Button>
          : <Button onClick={() => setFailed(undefined)} data-testid="firmware-close">Close</Button>}
      </DialogActions>
    </Dialog>

    <Typography paragraph color="textSecondary">
      Use a USB <em>data</em> cable into the computer the hub runs on. A brand-new board straight from the box is fine.
    </Typography>
    <div className={classes.block}>
      {installing ? <InstallRunning job={job} action={hidden && <Button color="inherit" size="small" onClick={() => setHidden(false)}>Show</Button>} />
      : isLoading ? (job?.firstStart
        ? <Alert severity="info" className={classes.block} data-testid="device-first-start">
            {job.progress.restart === "timeout"
              ? <>Firmware installed and checked. The hub has not seen the board restart yet: press its RST button once (do not hold FLASH), or unplug
                  it and plug it back in. It then sets up its storage, which can take up to two minutes. Leave it plugged in; this page carries on by itself.</>
              : <>Firmware installed. The board is now starting for the first time and setting up its storage, which can take up
                  to two minutes. Leave it plugged in; this page carries on by itself.</>}
            <LinearProgress color="secondary" style={{ marginTop: 8 }} />
          </Alert>
        : <Spinner />) : (
        needsFirmware && device.firmwareAvailable ? (() => {
          // the next step for this board: never the remedy that was just tried for the same symptom (BoardAdvice.ts)
          const next = nextStepFor(device)
          const hubs = device.boardState === "twoHubs" ? hubAddressesIn(device.boardOutput || "") : []
          const install = <Button color="inherit" size="small" onClick={installFirmware} disabled={busy} data-testid="device-firmware">Install firmware</Button>
          const check = <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={() => onReload()} disabled={busy} data-testid="device-check">Check again</Button>
          // the hub keeps what it did to the last board; another board must not be told installing is pointless
          const otherBoard = <Button color="inherit" size="small" onClick={() => onReload({ newBoard: true })} disabled={busy} data-testid="device-other-board">Check the other board</Button>
          const action = next.action === "install" ? install : next.action === "hardware" ? <>{check}{otherBoard}</> : check
          return <>
            <Alert severity={next.severity} className={classes.block} action={action} data-testid={`device-state-${device.boardState || "unknown"}`}>
              Found a board on {device.path}, but nothing answers on it. {next.text}
              {hubs.length >= 2 && <> {twoHubsText(hubs, hub?.addresses || [])}</>}
            </Alert>
            {device.boardOutput && <details className={classes.block} data-testid="device-output">
              <summary><Typography variant="caption" color="textSecondary" component="span">What the board printed</Typography></summary>
              <pre className={classes.output}>{device.boardOutput}</pre>
            </details>}
            {device.errorMessage && <Typography variant="caption" color="textSecondary" display="block" data-testid="device-error">{device.errorMessage}</Typography>}
            {/* the firmware is in but nothing answers: the chip's own start-up message says why */}
            {["silent", "otherFirmware", "crashing", "restarting"].includes(device.boardState) && <BootMessageReader path={device.path} />}
            <Typography variant="caption" color="textSecondary">
              {next.action === "install" && <>Already installed it? Press the board's RST button once, or unplug it and plug it back in, and <Button size="small" onClick={() => onReload()} disabled={busy}>check again</Button>.</>}
              {next.action === "check" && !device.recentInstall && <>Still the same after two minutes? <Button size="small" onClick={installFirmware} disabled={busy}>Install the firmware again</Button>.</>}
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
    {!installing && hasLua && device.firmwareProblem && <Alert severity="error" className={classes.block} data-testid="device-firmware-problem"
      action={device.firmwareAvailable && <Button color="inherit" size="small" onClick={installFirmware} disabled={busy} data-testid="device-firmware">Install firmware</Button>}>
      {device.firmwareProblem} Install the NodeMCU firmware first; it takes one to two minutes. The light's name and Wi-Fi come back at "Name and Wi-Fi".
    </Alert>}
    {!installing && hasLua && !device.firmwareProblem && <div className={classes.block}>
      {needsSoftware && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={installSoftware} disabled={busy} data-testid="device-install">Install now</Button>}>
        This light does not have the current tally software. Installing takes about a minute.
      </Alert>}
      {device.update === "up-to-date" && <Alert severity="success">The tally software on this light is current.</Alert>}
      {device.update === "not-available" && <Alert severity="info">This hub was started without the tally software bundle, so it cannot install it. The light keeps whatever it has.</Alert>}
    </div>}
  </div>
}

export default DevicePanel
