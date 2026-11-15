import { Dialog, DialogContent, DialogTitle, IconButton, makeStyles, Typography } from '@material-ui/core'
import CloseIcon from '@material-ui/icons/Close'
import React from 'react'
import { Tally } from '../../domain/Tally'
import useTallyLog from '../../hooks/useTallyLog'
import TallyLogList from '../TallyLogList'

const useStyles = makeStyles(theme => ({
  title: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: theme.spacing(1) },
  content: { padding: 0 },
  empty: { padding: theme.spacing(2) },
}))

// A light's log inside the OBS dock: the whole pane, so the dock does not have to leave for the full Logs page.
function DockLogDialog({ tally, onClose }: { tally: Tally, onClose: () => void }) {
  const classes = useStyles()
  const logs = useTallyLog(tally.getId())
  return <Dialog open fullScreen onClose={onClose} data-testid="dock-log">
    <DialogTitle disableTypography className={classes.title}>
      <Typography variant="subtitle1" component="h2">{tally.name}'s log</Typography>
      <IconButton size="small" onClick={onClose} aria-label="Close the log" data-testid="dock-log-close"><CloseIcon /></IconButton>
    </DialogTitle>
    <DialogContent className={classes.content} dividers>
      {logs && logs.length > 0
        ? <TallyLogList logs={logs} dense />
        : <Typography variant="body2" color="textSecondary" className={classes.empty}>Nothing logged since the hub started.</Typography>}
    </DialogContent>
  </Dialog>
}

export default DockLogDialog
