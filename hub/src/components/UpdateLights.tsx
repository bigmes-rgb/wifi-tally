import { Button, makeStyles, Typography } from '@material-ui/core'
import { Alert, AlertTitle } from '@material-ui/lab'
import React, { useEffect, useState } from 'react'
import { UdpTally } from '../domain/Tally'
import useHubInfo from '../hooks/useHubInfo'
import { socket } from '../hooks/useSocket'
import useTallies from '../hooks/useTallies'
import { updatePlan } from '../lib/LightUpdates'

const useStyles = makeStyles(theme => ({
  alert: { marginBottom: theme.spacing(2) },
  button: { marginTop: theme.spacing(1) },
  list: { margin: theme.spacing(1, 0, 0, 0), paddingLeft: theme.spacing(2.5) },
}))

type Outcome = "sent" | "saved" | "failed" | "done"
type Results = { [tallyName: string]: { outcome: Outcome, at: number } }

// how long a light gets to answer at all, and to come back after it said it restarts
export const ANSWER_MS = 60000
export const COME_BACK_MS = 90000

// what each light's line says, from its answer, how long ago it came, and what the light does now
export function wording(outcome: Outcome, ageMs: number, tally: UdpTally | undefined, hubStamp: string | undefined): string {
  switch (outcome) {
    case "sent":
      return ageMs > ANSWER_MS ? "did not answer. Try again; if it never answers, watch it over USB in Build a light" : "sent, waiting for the light…"
    case "saved":
      if (tally?.isConnected() && tally.program === hubStamp) return "done, back on the new program"
      if (tally?.isConnected() && tally.program === "files") return "restarted, but the flash did not take the program: it runs from its files. Update it again; if that repeats, install it over USB"
      return ageMs > COME_BACK_MS ? "said it restarts, but has not come back. Look at the light" : "got it, restarting with the new program…"
    case "done":
      return "already runs it"
    case "failed":
      return "could not fetch it. Its log (menu, Logs) says why; try again, or bring it to the computer"
  }
}

// Lights that run an older program than this hub has get it over the network (see tally/src/my-update.lua):
// one button, each light's answer as it comes, and what became of it. Lights that predate this must come to the
// computer once.
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
  if (plan.behind.length === 0 && plan.needUsb.length === 0 && names.length === 0) return null

  const send = () => {
    setResults({})
    socket.emit('tallies.update.send')
  }
  const now = Date.now()
  const lightNamed = (name: string) => (tallies || []).find(t => t.name === name && t instanceof UdpTally) as UdpTally | undefined
  const line = (name: string) => wording(results[name].outcome, now - results[name].at, lightNamed(name), hub?.programStamp)
  const waiting = names.some(name => results[name].outcome === "sent" && now - results[name].at <= ANSWER_MS)
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

  return <Alert severity={plan.behind.length > 0 ? "info" : "success"} className={classes.alert} data-testid="update-lights">
    <AlertTitle>{plan.behind.length > 0 ? `${plural(plan.behind.length, "light")} can take the newer program over the network` : "The lights have the current program"}</AlertTitle>
    {plan.behind.length > 0 && <Typography variant="body2">
      {plan.behind.join(", ")} {plan.behind.length === 1 ? "runs" : "run"} an older program than this hub has. Each light fetches it from the hub, restarts once, and comes back in a few seconds. A light that cannot fetch it keeps running what it has.
    </Typography>}
    {plan.behind.length > 0 && <Button variant="contained" color="primary" size="small" className={classes.button} onClick={send} disabled={waiting} data-testid="update-lights-send">Update lights</Button>}
    {names.length > 0 && <ul className={classes.list} data-testid="update-lights-results">
      {names.map(name => <li key={name} data-testid={`update-light-${name}`}><strong>{name}</strong>: {line(name)}</li>)}
    </ul>}
    {plan.needUsb.length > 0 && <Typography variant="body2" style={{ marginTop: 8 }} data-testid="update-lights-usb">
      {plan.needUsb.join(", ")} {plan.needUsb.length === 1 ? "predates" : "predate"} updates over the network: bring {plan.needUsb.length === 1 ? "it" : "each"} to this computer once and press "Install now" in Build a light. After that {plan.needUsb.length === 1 ? "it updates" : "they update"} from here.
    </Typography>}
  </Alert>
}

export default UpdateLights
