import { Button, Dialog, DialogActions, DialogContent, DialogTitle, makeStyles, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import RefreshIcon from '@material-ui/icons/Refresh'
import React, { useState } from 'react'
import TallyDevice from '../../flasher/TallyDevice'
import { TallyProgramProgressType } from '../../flasher/NodeMcuConnector'
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

  const isLoading = device === undefined
  const hasLua = device?.nodeMcuVersion !== undefined
  const needsSoftware = device?.update === "updateable"

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

    <Typography paragraph color="textSecondary">
      Use a USB <em>data</em> cable into the computer the hub runs on. A brand-new board straight from the box is fine.
    </Typography>
    <div className={classes.block}>
      {isLoading ? <Spinner /> : (
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
