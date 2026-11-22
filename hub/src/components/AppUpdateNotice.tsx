import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, makeStyles, Typography } from '@material-ui/core'
import ChevronRightIcon from '@material-ui/icons/ChevronRight'
import { Alert, AlertTitle } from '@material-ui/lab'
import SystemUpdateAltIcon from '@material-ui/icons/SystemUpdateAlt'
import React, { useEffect, useState } from 'react'
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
  // in the dock: a line of its own under the top bar, like the line for things that need attention
  dockStrip: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.75),
    padding: theme.spacing(0.5, 1),
    fontSize: "0.72rem",
    lineHeight: 1.3,
    cursor: "pointer",
    userSelect: "none",
    background: theme.palette.info.dark,
    color: theme.palette.getContrastText(theme.palette.info.dark),
    "& span": { flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  },
}))

// a restart that has not happened by then is reported, and the button works again
export const RESTART_GIVE_UP_MS = 90000

// what restarting does, said once for both places the notice appears
const WHAT_HAPPENS = "Restarting takes about 20 seconds. Meanwhile the lights show they are looking for the hub, then carry on by themselves, so do it before or after the service."
const OR_LATER = "Leave it, and it installs itself the next time ACC Tally closes."

// The desktop app has downloaded a newer version of itself. Nothing restarts on its own in the middle of a service:
// the operator picks the moment. At the top of every page a notice; in the OBS dock (compact) a blue line under the
// top bar that opens the same words in a dialog.
function AppUpdateNotice({ compact }: { compact?: boolean }) {
  const classes = useStyles()
  const update = useAppUpdate()
  const [later, setLater] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [stuck, setStuck] = useState(false)
  const [open, setOpen] = useState(false)
  // the dock stays open across updates: what it said about the last one must not carry over to the next
  useEffect(() => { setRestarting(false); setStuck(false); setLater(false) }, [update?.status, update?.version])
  useEffect(() => {
    if (!restarting) return
    const timer = setTimeout(() => { setRestarting(false); setStuck(true) }, RESTART_GIVE_UP_MS)
    return () => clearTimeout(timer)
  }, [restarting])
  if (update?.status !== "ready") return null

  const restart = () => {
    setStuck(false)
    setRestarting(true)
    socket.emit('app.update.install')
  }
  const stuckLine = stuck && <Typography variant="body2" color="error" className={classes.restarting} data-testid="app-update-stuck">
    It did not restart. Try again, or quit ACC Tally from its tray icon: the update installs as it closes.
  </Typography>
  const title = `ACC Tally ${update.version} is ready to install`
  const restartButton = <Button color="primary" variant="contained" size="small" className={classes.button} onClick={restart} disabled={restarting} data-testid="app-update-restart">Restart and update</Button>
  const restartingLine = <div className={classes.restarting} data-testid="app-update-restarting">
    <CircularProgress size={16} /><Typography variant="body2">Restarting into {update.version}. This page reconnects by itself.</Typography>
  </div>

  if (compact) {
    return <>
      {!later && <div className={classes.dockStrip} role="button" onClick={() => setOpen(true)} data-testid="app-update-dock">
        <SystemUpdateAltIcon fontSize="small" />
        <span>Update ready: ACC Tally {update.version}</span>
        <ChevronRightIcon fontSize="small" />
      </div>}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs" classes={{ paper: classes.dockPaper }} data-testid="app-update-dialog">
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" paragraph>{WHAT_HAPPENS}</Typography>
          <Typography variant="body2" color="textSecondary">{OR_LATER}</Typography>
          {restarting && restartingLine}
          {stuckLine}
        </DialogContent>
        <DialogActions>
          <Button className={classes.button} onClick={() => { setOpen(false); setLater(true) }} data-testid="app-update-notnow">Not now</Button>
          {restartButton}
        </DialogActions>
      </Dialog>
    </>
  }

  if (later) return null
  return <Alert severity="info" variant="outlined" icon={<SystemUpdateAltIcon />} className={classes.alert} data-testid="app-update">
    <AlertTitle>{title}</AlertTitle>
    <Typography variant="body2">{WHAT_HAPPENS} {OR_LATER}</Typography>
    {restarting ? restartingLine : <>
      {stuckLine}
      <div className={classes.actions}>
        {restartButton}
        <Button size="small" className={classes.button} onClick={() => setLater(true)} data-testid="app-update-later">Later</Button>
      </div>
    </>}
  </Alert>
}

export default AppUpdateNotice
