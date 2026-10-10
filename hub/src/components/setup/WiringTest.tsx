import { Button, makeStyles, Typography } from '@material-ui/core'
import { Alert, AlertTitle } from '@material-ui/lab'
import React, { useEffect, useRef, useState } from 'react'
import { HardwareProfile, Rgb } from '../../flasher/HardwareProfile'
import { WiringTestState } from '../../flasher/NodeMcuConnector'
import WiringDiagram from './WiringDiagram'
import { applyFixes, checksFor, diagnose, Finding, wiringPassed, WiringAnswer, WiringCheck } from '../../flasher/WiringDiagnosis'
import { socket } from '../../hooks/useSocket'

const useStyles = makeStyles(theme => ({
  block: {
    marginBottom: theme.spacing(2),
  },
  swatches: {
    display: "flex",
    gap: theme.spacing(3),
    marginBottom: theme.spacing(2),
  },
  swatch: {
    textAlign: "center",
    "& div": {
      width: 72,
      height: 72,
      borderRadius: "50%",
      border: "2px solid " + theme.palette.grey[600],
      margin: "0 auto " + theme.spacing(1) + "px",
    },
  },
  answers: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  actions: {
    display: "flex",
    gap: theme.spacing(1),
    flexWrap: "wrap",
  },
}))

const css = (rgb: Rgb) => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`

type Props = {
  path: string
  profile: HardwareProfile
  onProfileChange: (profile: HardwareProfile) => void
  onPassed: (passed: boolean) => void
}

// Lights each channel over USB and asks what the person sees. Pure logic lives in WiringDiagnosis.
function WiringTest({ path, profile, onProfileChange, onPassed }: Props) {
  const classes = useStyles()
  const [checks, setChecks] = useState<WiringCheck[]>([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<WiringAnswer[]>([])
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>(undefined)
  const profileRef = useRef(profile)
  profileRef.current = profile
  const pendingFirst = useRef<WiringCheck | null>(null)

  // every answer from the hub about the serial session lands here
  useEffect(() => {
    const onState = (state: WiringTestState) => {
      setBusy(false)
      if (state.error) {
        setError(state.error)
        setRunning(false)
      } else {
        setRunning(state.active)
      }
    }
    socket.on('flasher.wiring.state', onState)
    return () => {
      socket.off('flasher.wiring.state', onState)
      socket.emit('flasher.wiring.stop')
    }
  }, [])

  const show = (check: WiringCheck) => {
    setBusy(true)
    socket.emit('flasher.wiring.show', profileRef.current, check.operator, check.stage)
  }

  const start = () => {
    const list = checksFor(profileRef.current)
    setChecks(list)
    setIndex(0)
    setAnswers([])
    setFindings(null)
    setError(undefined)
    onPassed(false)
    setBusy(true)
    setRunning(true)
    // the first colour follows as soon as the session is up
    pendingFirst.current = list[0]
    socket.emit('flasher.wiring.start', path, profileRef.current)
  }
  useEffect(() => {
    if (running && !busy && pendingFirst.current) {
      const first = pendingFirst.current
      pendingFirst.current = null
      show(first)
    }
  }, [running, busy]) // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (id: string) => {
    const check = checks[index]
    const next = [...answers.filter(a => a.checkId !== check.id), { checkId: check.id, answer: id }]
    setAnswers(next)
    if (index + 1 < checks.length) {
      setIndex(index + 1)
      show(checks[index + 1])
    } else {
      const result = diagnose(profileRef.current, checks, next)
      setFindings(result)
      const fixed = applyFixes(profileRef.current, result)
      if (JSON.stringify(fixed) !== JSON.stringify(profileRef.current)) {
        onProfileChange(fixed)
      }
      onPassed(wiringPassed(result, profileRef.current))
      socket.emit('flasher.wiring.stop')
      setRunning(false)
    }
  }

  const cancel = () => {
    socket.emit('flasher.wiring.stop')
    setRunning(false)
    setFindings(null)
  }

  const check = checks[index]

  if (!running && findings === null) {
    return <>
      <Typography paragraph color="textSecondary">
        The hub will light the LEDs one colour at a time through the USB cable and ask what you see. Nothing is written to the light yet.
      </Typography>
      {error && <Alert severity="error" className={classes.block}>{error}</Alert>}
      <Button variant="contained" color="primary" onClick={start} disabled={busy} data-testid="wiring-start">Start the wiring test</Button>
    </>
  }

  if (running && check) {
    return <>
      <Typography variant="caption" color="textSecondary">Check {index + 1} of {checks.length}</Typography>
      <div className={classes.swatches}>
        <div className={classes.swatch}><div style={{ background: css(check.operator) }} /><Typography variant="caption">operator</Typography></div>
        {profile.stage.kind !== "none" && <div className={classes.swatch}><div style={{ background: css(check.stage) }} /><Typography variant="caption">stage</Typography></div>}
      </div>
      <Typography paragraph data-testid="wiring-question">{busy ? "Sending to the light…" : check.question}</Typography>
      <div className={classes.answers}>
        {check.answers.map(a => <Button key={a.id} variant="outlined" disabled={busy} onClick={() => answer(a.id)} data-testid={`wiring-answer-${a.id}`}>{a.label}</Button>)}
      </div>
      <Button size="small" onClick={cancel}>Cancel</Button>
    </>
  }

  const passed = findings ? wiringPassed(findings, profile) : false
  const pinsToCheck = Array.from(new Set((findings || []).flatMap(f => f.pins || [])))
  return <>
    {findings?.map((f, i) => (
      <Alert key={i} severity={f.severity === "ok" ? "success" : f.severity === "fix" ? "warning" : "info"} className={classes.block} data-testid={`wiring-finding-${f.severity}`}>
        {f.text}
      </Alert>
    ))}
    {pinsToCheck.length > 0 && <div className={classes.block} data-testid="wiring-test-diagram">
      <Typography paragraph color="textSecondary">The pins to check are ringed in red.</Typography>
      <WiringDiagram profile={profile} highlightPins={pinsToCheck} />
    </div>}
    {error && <Alert severity="error" className={classes.block}>{error}</Alert>}
    {passed
      ? <Alert severity="success" className={classes.block} data-testid="wiring-passed"><AlertTitle>Wiring test passed</AlertTitle>Everything lit the way it should.</Alert>
      : <Typography paragraph color="textSecondary">Fix what is listed above, then run the test again. Settings the hub corrected itself are already applied.</Typography>}
    <div className={classes.actions}>
      <Button variant={passed ? "outlined" : "contained"} color="primary" onClick={start} data-testid="wiring-again">Run the test again</Button>
    </div>
  </>
}

export default WiringTest
