import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, makeStyles, Tooltip, Typography } from '@material-ui/core'
import { Alert, AlertTitle } from '@material-ui/lab'
import SystemUpdateAltIcon from '@material-ui/icons/SystemUpdateAlt'
import React, { useState } from 'react'
import useAppUpdate from '../hooks/useAppUpdate'
import { socket } from '../hooks/useSocket'

const useStyles = makeStyles(theme => ({
  alert: {
    marginBottom: theme.spacing(2),
    "& .MuiAlert-message": { flexGrow: 1 },
  },
  actions: { display: "flex", flexWrap: "wrap", gap: theme.spacing(1), marginTop: theme.spacing(1) },
  button: { whiteSpace: "nowrap" },
  restarting: { display: "flex", alignItems: "center", gap: theme.spacing(1), marginTop: theme.spacing(1) },
  // a dock is narrow: less margin around the dialog, so both buttons stay on one line
  dockPaper: { margin: theme.spacing(1.5), width: "calc(100% - 24px)" },
  dockButton: {
    minWidth: 30,
    padding: "2px 6px",
    flexShrink: 0,
    color: theme.palette.info.main,
    borderColor: theme.palette.info.main,
  },
}))

// what restarting does, said once for both places the notice appears
const WHAT_HAPPENS = "Restarting takes about 20 seconds. Meanwhile the lights show they are looking for the hub, then carry on by themselves, so do it before or after the service."
const OR_LATER = "Leave it, and it installs itself the next time ACC Tally closes."

// The desktop app has downloaded a newer version of itself. Nothing restarts on its own in the middle of a service:
// the operator picks the moment. On the Tallies page a notice above the lights; in the OBS dock (compact) a small
// button in the top bar that opens the same words in a dialog.
function AppUpdateNotice({ compact }: { compact?: boolean }) {
  const classes = useStyles()
  const update = useAppUpdate()
  const [later, setLater] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [open, setOpen] = useState(false)
  if (update?.status !== "ready") return null

  const restart = () => {
    setRestarting(true)
    socket.emit('app.update.install')
  }
  const title = `ACC Tally ${update.version} is ready to install`
  const restartButton = <Button color="primary" variant="contained" size="small" className={classes.button} onClick={restart} disabled={restarting} data-testid="app-update-restart">Restart and update</Button>
  const restartingLine = <div className={classes.restarting} data-testid="app-update-restarting">
    <CircularProgress size={16} /><Typography variant="body2">Restarting into {update.version}. This page reconnects by itself.</Typography>
  </div>

  if (compact) {
    return <>
      <Tooltip title={title}>
        <Button variant="outlined" size="small" className={classes.dockButton} onClick={() => setOpen(true)} aria-label={title} data-testid="app-update-dock"><SystemUpdateAltIcon fontSize="small" /></Button>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs" classes={{ paper: classes.dockPaper }} data-testid="app-update-dialog">
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" paragraph>{WHAT_HAPPENS}</Typography>
          <Typography variant="body2" color="textSecondary">{OR_LATER}</Typography>
          {restarting && restartingLine}
        </DialogContent>
        <DialogActions>
          <Button className={classes.button} onClick={() => setOpen(false)}>Not now</Button>
          {restartButton}
        </DialogActions>
      </Dialog>
    </>
  }

  if (later) return null
  return <Alert severity="info" variant="outlined" icon={<SystemUpdateAltIcon />} className={classes.alert} data-testid="app-update">
    <AlertTitle>{title}</AlertTitle>
    <Typography variant="body2">{WHAT_HAPPENS} {OR_LATER}</Typography>
    {restarting ? restartingLine : <div className={classes.actions}>
      {restartButton}
      <Button size="small" className={classes.button} onClick={() => setLater(true)} data-testid="app-update-later">Later</Button>
    </div>}
  </Alert>
}

export default AppUpdateNotice
