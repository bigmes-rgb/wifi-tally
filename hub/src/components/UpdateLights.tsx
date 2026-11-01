import { Button, Chip, CircularProgress, makeStyles, Typography } from '@material-ui/core'
import { Alert, AlertTitle } from '@material-ui/lab'
import CheckCircleIcon from '@material-ui/icons/CheckCircle'
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline'
import SystemUpdateAltIcon from '@material-ui/icons/SystemUpdateAlt'
import UsbIcon from '@material-ui/icons/Usb'
import React, { useEffect, useState } from 'react'
import { UdpTally } from '../domain/Tally'
import useHubInfo from '../hooks/useHubInfo'
import { socket } from '../hooks/useSocket'
import useTallies from '../hooks/useTallies'
import { updatePlan } from '../lib/LightUpdates'

const useStyles = makeStyles(theme => ({
  alert: {
    marginBottom: theme.spacing(2),
    "& .MuiAlert-message": { flexGrow: 1 },
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  names: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(0.75),
    flexGrow: 1,
  },
  button: {
    whiteSpace: "nowrap",
  },
  results: {
    listStyle: "none",
    margin: theme.spacing(1.5, 0, 0, 0),
    padding: 0,
  },
  result: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    fontSize: "0.875rem",
    minHeight: 24,
  },
  resultName: {
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  ok: { color: theme.palette.success.main, fontSize: "1.1rem" },
  bad: { color: theme.palette.error.main, fontSize: "1.1rem" },
  hint: {
    marginTop: theme.spacing(1),
    color: theme.palette.text.secondary,
  },
}))

type Outcome = "sent" | "saved" | "failed" | "done"
type Results = { [tallyName: string]: { outcome: Outcome, at: number } }

// how long a light gets to answer at all, and to come back after it said it restarts
export const ANSWER_MS = 60000
export const COME_BACK_MS = 90000

type Mark = "busy" | "ok" | "bad"

// what each light's line says, from its answer, how long ago it came, and what the light does now
export function wording(outcome: Outcome, ageMs: number, tally: UdpTally | undefined, hubStamp: string | undefined): { mark: Mark, text: string } {
  switch (outcome) {
    case "sent":
      return ageMs > ANSWER_MS
        ? { mark: "bad", text: "did not answer. Try again, or watch it over USB in Build a light." }
        : { mark: "busy", text: "sent, waiting for the light…" }
    case "saved":
      if (tally?.isConnected() && tally.program === hubStamp) return { mark: "ok", text: "done, back on the new program" }
      if (tally?.isConnected() && tally.program === "files") return { mark: "bad", text: "restarted, but the flash did not take it: runs from its files. Try again; if that repeats, install it over USB." }
      return ageMs > COME_BACK_MS
        ? { mark: "bad", text: "said it restarts, but has not come back. Look at the light." }
        : { mark: "busy", text: "got it, restarting with the new program…" }
    case "done":
      return { mark: "ok", text: "already runs it" }
    case "failed":
      return { mark: "bad", text: "could not fetch it. See its log (menu → Logs), then try again." }
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

// Lights that run an older program than this hub has get it over the network (see tally/src/my-update.lua):
// one button, each light's answer as it comes, and what became of it. Lights that predate this must come to the
// computer once; they get their own, separate note.
function UpdateLights() {
  const classes = useStyles()
  const tallies = useTallies()
  const hub = useHubInfo()
  const [results, setResults] = useState<Results>({})
  const [, tick] = useState(0)

  useEffect(() => {
    const onSent = ({ sentTo }: { sentTo: string[] }) => setResults(r => {
      const next = { ...r }
      sentTo.forEach(name => { next[name] = { outcome: "sent", at: Date.now() } })
      return next
    })
    const onAnswer = ({ tallyName, outcome }: { tallyName: string, outcome: Outcome }) => setResults(r => ({ ...r, [tallyName]: { outcome, at: Date.now() } }))
    socket.on('tallies.update.sent', onSent)
    socket.on('tallies.update.answer', onAnswer)
    // the lines age: a light that never answers or never comes back is said so
    const clock = setInterval(() => tick(t => t + 1), 1000)
    return () => {
      socket.off('tallies.update.sent', onSent)
      socket.off('tallies.update.answer', onAnswer)
      clearInterval(clock)
    }
  }, [])

  const plan = updatePlan(tallies || [], hub?.programStamp)
  const names = Object.keys(results).sort((a, b) => a.localeCompare(b))
  const now = Date.now()
  const lightNamed = (name: string) => (tallies || []).find(t => t.name === name && t instanceof UdpTally) as UdpTally | undefined
  const waiting = names.some(name => results[name].outcome === "sent" && now - results[name].at <= ANSWER_MS)

  const send = () => {
    setResults({})
    socket.emit('tallies.update.send')
  }
  const icon = (mark: Mark) => mark === "busy" ? <CircularProgress size={14} thickness={5} />
    : mark === "ok" ? <CheckCircleIcon className={classes.ok} /> : <ErrorOutlineIcon className={classes.bad} />

  return <>
    {(plan.behind.length > 0 || names.length > 0) && (
      <Alert severity="info" variant="outlined" icon={<SystemUpdateAltIcon />} className={classes.alert} data-testid="update-lights">
        <AlertTitle>{plan.behind.length > 0 ? "Newer light program available" : "Light program update"}</AlertTitle>
        {plan.behind.length > 0 && <div className={classes.row}>
          <div className={classes.names} data-testid="update-lights-behind">
            {plan.behind.map(name => <Chip key={name} size="small" label={name} />)}
          </div>
          <Button variant="contained" color="primary" size="small" className={classes.button} onClick={send} disabled={waiting} data-testid="update-lights-send">
            Update {plural(plan.behind.length, "light")}
          </Button>
        </div>}
        {plan.behind.length > 0 && <Typography variant="body2" className={classes.hint}>
          Each light fetches the program from the hub, restarts once, and is back in a few seconds. A light that cannot fetch it keeps what it has.
        </Typography>}
        {names.length > 0 && <ul className={classes.results} data-testid="update-lights-results">
          {names.map(name => {
            const { mark, text } = wording(results[name].outcome, now - results[name].at, lightNamed(name), hub?.programStamp)
            return <li key={name} className={classes.result} data-testid={`update-light-${name}`} data-mark={mark}>
              {icon(mark)}<span className={classes.resultName}>{name}</span><span>{text}</span>
            </li>
          })}
        </ul>}
      </Alert>
    )}
    {plan.needUsb.length > 0 && (
      <Alert severity="warning" variant="outlined" icon={<UsbIcon />} className={classes.alert} data-testid="update-lights-usb">
        <AlertTitle>{plural(plan.needUsb.length, "light")} need{plan.needUsb.length === 1 ? "s" : ""} a USB install once</AlertTitle>
        <div className={classes.names}>
          {plan.needUsb.map(name => <Chip key={name} size="small" label={name} />)}
        </div>
        <Typography variant="body2" className={classes.hint}>
          Plug each into this computer, open Build a light, go to "Plug it in", and press Install now. After that it updates from here.
        </Typography>
      </Alert>
    )}
  </>
}

export default UpdateLights
