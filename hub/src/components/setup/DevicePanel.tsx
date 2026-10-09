import { Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, makeStyles, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import RefreshIcon from '@material-ui/icons/Refresh'
import React, { useState } from 'react'
import TallyDevice from '../../flasher/TallyDevice'
import { TallyProgramProgressType } from '../../flasher/NodeMcuConnector'
import { FirmwareProgressType } from '../../flasher/FirmwareFlasher'
import { socket } from '../../hooks/useSocket'
import Help from '../flasher/Help'
import ProgramProgress from '../flasher/ProgramProgress'
import Spinner from '../layout/Spinner'

const useStyles = makeStyles(theme => ({
  block: {
    marginBottom: theme.spacing(2),
  },
}))

type Props = {
  device: TallyDevice | undefined
  onReload: () => void
}

export const deviceIsReady = (device: TallyDevice | undefined) => device?.nodeMcuVersion !== undefined && device?.update !== "updateable"

// Finds the light on USB and puts the tally program on it if it is missing or old.
function DevicePanel({ device, onReload }: Props) {
  const classes = useStyles()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<TallyProgramProgressType>(undefined)
  const [firmware, setFirmware] = useState<FirmwareProgressType>(undefined)

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
        if (p.phase === "done") { setFirmware(undefined); onReload() }
      }
    }
    socket.on('flasher.firmware.progress', onProgress)
    socket.emit('flasher.firmware', device.path)
  }

  const installSoftware = () => {
    setProgress(undefined)
    setBusy(true)
    const onProgress = (p: TallyProgramProgressType) => {
      setProgress({ ...p })
      if (p.allDone || p.error) {
        socket.off('flasher.program.progress', onProgress)
        setBusy(false)
        if (!p.error) { setProgress(undefined); onReload() }
      }
    }
    socket.on('flasher.program.progress', onProgress)
    socket.emit('flasher.program', device.path)
  }

  return <div data-testid="device-panel">
    <Dialog open={busy || !!progress?.error}>
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
        {firmware && <>
          <LinearProgress variant="determinate" value={firmware.percent} className={classes.block} />
          <Typography paragraph data-testid="firmware-phase">
            {firmware.phase === "connecting" && "Connecting to the board…"}
            {firmware.phase === "writing" && `Writing… ${firmware.percent}%`}
            {firmware.phase === "restarting" && "Restarting the board…"}
            {firmware.phase === "error" && "Installing the firmware failed."}
          </Typography>
          {firmware.message && firmware.phase !== "error" && <Typography color="textSecondary">{firmware.message}</Typography>}
          {firmware.phase === "error" && <Alert severity="error" className={classes.block}>
            {firmware.message}<br />
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
      {isLoading ? <Spinner /> : (
        needsFirmware && device.firmwareAvailable ? <>
          <Alert severity="warning" className={classes.block} action={<Button color="inherit" size="small" onClick={installFirmware} disabled={busy} data-testid="device-firmware">Install firmware</Button>}>
            Found a board on {device.path}, but nothing answers on it. A board straight from the box needs the NodeMCU firmware first; this takes one to two minutes.
          </Alert>
          {device.errorMessage && <Typography variant="caption" color="textSecondary" display="block" data-testid="device-error">The board said: {device.errorMessage}</Typography>}
          <Typography variant="caption" color="textSecondary">Already installed it and still here? Press the board's RST button and <Button size="small" onClick={onReload} disabled={busy}>check again</Button>.</Typography>
        </> :
        !hasLua ? <Help tallyDevice={device} onReload={onReload} /> : (
          <Alert severity="success" action={<Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={onReload} disabled={busy}>Check again</Button>}>
            Found a light on {device.path}{device.tallySettings?.getTallyName() ? <>, currently named <strong>{device.tallySettings.getTallyName()}</strong></> : ", not set up yet"}.
          </Alert>
        )
      )}
    </div>
    {hasLua && <div className={classes.block}>
      {needsSoftware && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={installSoftware} disabled={busy} data-testid="device-install">Install now</Button>}>
        This light does not have the current tally software. Installing takes about a minute.
      </Alert>}
      {device.update === "up-to-date" && <Alert severity="success">The tally software on this light is current.</Alert>}
      {device.update === "not-available" && <Alert severity="info">This hub was started without the tally software bundle, so it cannot install it. The light keeps whatever it has.</Alert>}
    </div>}
  </div>
}

export default DevicePanel
