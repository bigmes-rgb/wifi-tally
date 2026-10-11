import { makeStyles, TextField, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import React, { useEffect, useState } from 'react'
import Tally from '../domain/Tally'
import { socket } from '../hooks/useSocket'
import FormDialog from './layout/FormDialog'

const useStyles = makeStyles(theme => ({
  field: { marginBottom: theme.spacing(2) },
  block: { marginBottom: theme.spacing(2) },
}))

type Outcome = "sent" | "saved" | "failed"
type Result = { tallyName: string, newName: string, outcome: Outcome, problem?: string }

type RenameTallyProps = {
  tally: Tally
  open: boolean
  onClose: () => void
}

// Gives a light a new name over the network: the hub sends it, the light saves it, answers, and restarts under
// the new name. Its channel and settings move over with it.
function RenameTally({ tally, open, onClose }: RenameTallyProps) {
  const classes = useStyles()
  const [name, setName] = useState(tally.name)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    if (!open) return
    setName(tally.name)
    setResult(null)
    const onResult = (r: Result) => { if (r.tallyName === tally.name) setResult(r) }
    socket.on('tally.rename.result', onResult)
    return () => { socket.off('tally.rename.result', onResult) }
  }, [open, tally.name])

  const send = () => {
    setResult({ tallyName: tally.name, newName: name, outcome: "sent" })
    socket.emit('tally.rename', tally.name, name)
  }
  const busy = result?.outcome === "sent"

  return <FormDialog data-testid={`tally-${tally.name}-rename`} label={`Rename ${tally.name}`} open={open} onClose={onClose} onSubmit={send} isLoading={busy || result?.outcome === "saved"}>
    <Typography paragraph>
      The light saves the new name and restarts with it. Its channel and settings stay as they are.
    </Typography>
    <TextField label="Name" value={name} onChange={e => setName(e.currentTarget.value)} className={classes.field} fullWidth autoFocus
      inputProps={{ maxLength: 26, "data-testid": `tally-${tally.name}-rename-name` }} disabled={busy} />
    {result?.outcome === "sent" && <Alert severity="info" className={classes.block} data-testid={`tally-${tally.name}-rename-sent`}>Sent to the light. Waiting for it to answer…</Alert>}
    {result?.outcome === "saved" && <Alert severity="success" className={classes.block} data-testid={`tally-${tally.name}-rename-saved`}>The light is now called "{result.newName}" and is restarting. It comes back in a few seconds.</Alert>}
    {result?.outcome === "failed" && <Alert severity="error" className={classes.block} data-testid={`tally-${tally.name}-rename-failed`}>{result.problem || "The light could not save the name. Try again; if that fails, name it over USB in Build a light."}</Alert>}
  </FormDialog>
}

export default RenameTally
