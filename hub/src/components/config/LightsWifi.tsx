import { Button, makeStyles, TextField, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import React, { useEffect, useState } from 'react'
import useTallies from '../../hooks/useTallies'
import { socket } from '../../hooks/useSocket'
import MiniPage from '../layout/MiniPage'

const useStyles = makeStyles(theme => ({
  field: { marginRight: theme.spacing(2), marginBottom: theme.spacing(2), minWidth: 240 },
  block: { marginBottom: theme.spacing(2) },
}))

type Answer = "sent" | "saved" | "failed"

// Hands every light that is on the network now a new Wi-Fi name and password, before the router is
// switched over. Each light keeps using the current network until it goes away, then joins the new
// one; if it cannot, it goes back to the old one. Lights that are off now are not reached.
function LightsWifi() {
  const classes = useStyles()
  const tallies = useTallies() || []
  const online = tallies.filter(t => t.type === "udp" && t.isConnected())
  const [ssid, setSsid] = useState("")
  const [password, setPassword] = useState("")
  const [answers, setAnswers] = useState<Record<string, Answer> | null>(null)
  const [problem, setProblem] = useState<string | undefined>(undefined)

  useEffect(() => {
    const onSent = ({ sentTo, problem }: { sentTo: string[], problem?: string }) => {
      setProblem(problem)
      if (!problem) setAnswers(Object.fromEntries(sentTo.map(name => [name, "sent" as Answer])))
    }
    const onAnswer = ({ tallyName, saved }: { tallyName: string, saved: boolean }) => {
      setAnswers(a => ({ ...(a || {}), [tallyName]: saved ? "saved" : "failed" }))
    }
    socket.on('tallies.wifi.sent', onSent)
    socket.on('tallies.wifi.answer', onAnswer)
    return () => {
      socket.off('tallies.wifi.sent', onSent)
      socket.off('tallies.wifi.answer', onAnswer)
    }
  }, [])

  const send = () => {
    setAnswers(null)
    socket.emit('tallies.wifi.send', ssid, password)
  }
  const missed = tallies.filter(t => t.type === "udp" && answers && !(t.name in answers))
  const words: Record<Answer, string> = { sent: "sent, no answer yet", saved: "saved", failed: "could not save it" }

  return <MiniPage title="Wi-Fi of the lights" testId="lights-wifi">
    <Typography paragraph>
      Changing the church's Wi-Fi name or password? Send the new one to the lights first, while they are still on the old one.
      Each light keeps using the current network until it goes away, then joins the new one by itself. If it cannot join the
      new one, it goes back to the old one.
    </Typography>
    <TextField label="New Wi-Fi name" value={ssid} onChange={e => setSsid(e.currentTarget.value)} className={classes.field} data-testid="lights-wifi-ssid" />
    <TextField label="New Wi-Fi password" value={password} onChange={e => setPassword(e.currentTarget.value)} className={classes.field} data-testid="lights-wifi-password" />
    <div className={classes.block}>
      <Button variant="contained" color="primary" disabled={!ssid || online.length === 0} onClick={send} data-testid="lights-wifi-send">
        Send to {online.length} light{online.length === 1 ? "" : "s"} on the network
      </Button>
    </div>
    {problem && <Alert severity="error" className={classes.block}>{problem}</Alert>}
    {answers && <Alert severity={Object.values(answers).every(a => a === "saved") && missed.length === 0 ? "success" : "info"} className={classes.block} data-testid="lights-wifi-answers">
      {Object.entries(answers).map(([name, answer]) => <div key={name}><strong>{name}</strong>: {words[answer]}</div>)}
      {missed.map(t => <div key={t.name}><strong>{t.name}</strong>: not on the network now, so not reached. Plug it into this computer later and save the new Wi-Fi in Build a light.</div>)}
    </Alert>}
  </MiniPage>
}

export default LightsWifi
