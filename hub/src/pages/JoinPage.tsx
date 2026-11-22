import { Button, CircularProgress, makeStyles, MenuItem, TextField, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import React, { useEffect, useState } from 'react'
import { useHistory } from 'react-router-dom'
import useChannels from '../hooks/useChannels'
import { socket } from '../hooks/useSocket'
import useSocketInfo from '../hooks/useSocketInfo'
import useTallies from '../hooks/useTallies'
import { fullScreen, keepAwake, rememberedName, rememberName } from '../lib/keepAwake'

const useStyles = makeStyles(theme => ({
  root: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    padding: theme.spacing(4, 3),
    maxWidth: 440,
    margin: "0 auto",
    gap: theme.spacing(2.5),
  },
  brand: { display: "flex", alignItems: "baseline", gap: theme.spacing(1), justifyContent: "center", marginBottom: theme.spacing(1) },
  brandAcc: { fontSize: "1.6rem", fontWeight: 700, letterSpacing: "0.06em" },
  brandBar: { fontSize: "1.6rem", fontWeight: 300, opacity: 0.5 },
  brandTally: { fontSize: "1.6rem", fontWeight: 300 },
  title: { fontSize: "1.5rem", fontWeight: 600, lineHeight: 1.25, textAlign: "center" },
  lead: { textAlign: "center", color: theme.palette.text.secondary },
  dots: { display: "flex", justifyContent: "center", gap: theme.spacing(2), marginTop: theme.spacing(-1) },
  dot: { display: "flex", alignItems: "center", gap: theme.spacing(0.75), fontSize: "0.85rem", color: theme.palette.text.secondary, "& span": { width: 14, height: 14, borderRadius: 7, display: "inline-block" } },
  start: { padding: theme.spacing(1.75), fontSize: "1.15rem", fontWeight: 600 },
  back: { padding: theme.spacing(1.75), fontSize: "1.1rem", fontWeight: 600, textTransform: "none" },
  small: { textAlign: "center", color: theme.palette.text.secondary, fontSize: "0.85rem" },
  waiting: { display: "flex", alignItems: "center", justifyContent: "center", gap: theme.spacing(1.5), minHeight: "40vh" },
}))

// bytes in UTF-8, as the hub counts them; without TextEncoder, which older phone browsers lack
const utf8Length = (text: string) => Array.from(text).reduce((n, ch) => {
  const code = ch.codePointAt(0) || 0
  return n + (code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4)
}, 0)

// the same rules the hub checks (tally/TallyName.ts), so the volunteer hears about a problem before tapping Start
export function joinNameProblem(name: string, taken: string[]): string | null {
  if (name.trim() === "") return "Type the camera's name."
  if (name !== name.trim()) return "Remove the spaces at the start or end."
  if (utf8Length(name) > 26) return "Keep the name to 26 characters or fewer."
  if (/["\r\n]/.test(name)) return "The name cannot contain quotes."
  if (name.startsWith(";")) return "The name cannot start with a semicolon."
  if (taken.includes(name)) return `"${name}" is taken. Ask the director, or pick another name.`
  return null
}

// a name nobody has yet: Phone 1, Phone 2, …
export function nextPhoneName(taken: string[]) {
  for (let n = 1; ; n++) if (!taken.includes(`Phone ${n}`)) return `Phone ${n}`
}

// What a volunteer sees after scanning the director's code: one name, optionally the camera's input, one Start
// button. The phone then shows the tally colours full screen and keeps its screen on. A phone that joined before
// is offered to continue under its name, with the input the director gave it.
function JoinPage() {
  const classes = useStyles()
  const history = useHistory()
  const tallies = useTallies()
  const channels = useChannels() || []
  const connected = useSocketInfo()
  const [slow, setSlow] = useState(false)
  const [name, setName] = useState<string | null>(null)
  const [channelId, setChannelId] = useState("")
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [fresh, setFresh] = useState(false)

  useEffect(() => {
    if (connected) { setSlow(false); return }
    const timer = setTimeout(() => setSlow(true), 6000)
    return () => clearTimeout(timer)
  }, [connected])

  const phones = (tallies || []).filter(t => t.isWebTally()).map(t => t.name)
  const remembered = rememberedName()
  const comeBack = !fresh && remembered && phones.includes(remembered) ? remembered : null
  // every name in use, except this phone's own when it comes back
  const taken = (tallies || []).map(t => t.name)
  const shownName = name ?? nextPhoneName(taken)
  const nameProblem = joinNameProblem(shownName, taken)

  useEffect(() => {
    const onResult = (result: { name: string, ok: boolean, problem?: string }) => {
      setBusy(false)
      if (!result.ok) { setProblem(result.problem || "The hub did not take that name."); return }
      rememberName(result.name)
      history.push(`/tally/web-${result.name}`)
    }
    socket.on('tally.join.result', onResult)
    return () => { socket.off('tally.join.result', onResult) }
  }, [history])

  const join = (asName: string, input?: string) => {
    // only a tap may keep the screen on or go full screen: this is that tap
    keepAwake()
    fullScreen()
    setBusy(true)
    setProblem(null)
    socket.emit('tally.join', asName, input || undefined)
  }

  const brand = <div className={classes.brand} aria-label="ACC | Tally">
    <span className={classes.brandAcc}>ACC</span><span className={classes.brandBar}>|</span><span className={classes.brandTally}>Tally</span>
  </div>

  if (!tallies) {
    return <div className={classes.root} data-testid="page-join">
      {brand}
      <div className={classes.waiting}>
        <CircularProgress size={24} />
        <Typography>Connecting to the hub…</Typography>
      </div>
      {slow && <Alert severity="warning" data-testid="join-unreachable">This phone cannot reach the hub. Is it on the church Wi-Fi, the same network as the computer that runs ACC Tally?</Alert>}
    </div>
  }

  return <div className={classes.root} data-testid="page-join">
    {brand}
    <Typography component="h1" className={classes.title}>Use this phone as a tally light</Typography>
    <Typography className={classes.lead}>The screen shows when your camera is live, so you know when to hold the shot.</Typography>
    <div className={classes.dots}>
      <span className={classes.dot}><span style={{ background: "#e74c3c" }} />On air</span>
      <span className={classes.dot}><span style={{ background: "#00bc8c" }} />Next</span>
      <span className={classes.dot}><span style={{ background: "#555" }} />Ready</span>
    </div>

    {comeBack
      ? <>
        <Button variant="contained" color="primary" className={classes.back} disabled={busy} onClick={() => join(comeBack)} data-testid="join-continue">
          Continue as {comeBack}
        </Button>
        <Button onClick={() => setFresh(true)} data-testid="join-other">Use another name</Button>
      </>
      : <>
        <TextField label="Camera name" variant="filled" fullWidth value={shownName} autoFocus
          onChange={e => { setName(e.target.value); setTouched(true); setProblem(null) }}
          error={touched && !!nameProblem} helperText={touched && nameProblem ? nameProblem : "The director sees this name. For example: Cam 4, Balcony, Handheld."}
          inputProps={{ maxLength: 26, "data-testid": "join-name", autoCapitalize: "words" }} />
        <TextField select label="Your camera's input (if you know it)" variant="filled" fullWidth value={channelId}
          onChange={e => setChannelId(e.target.value)} SelectProps={{ native: false }} inputProps={{ "data-testid": "join-input" }}>
          <MenuItem value="">I don't know: the director sets it</MenuItem>
          {channels.map(c => <MenuItem key={c.id} value={c.id}>{c.name || `Channel ${c.id}`}</MenuItem>)}
        </TextField>
        <Button variant="contained" color="primary" className={classes.start} disabled={busy || !!nameProblem}
          onClick={() => join(shownName, channelId)} data-testid="join-start">
          {busy ? <CircularProgress size={24} color="inherit" /> : "Start"}
        </Button>
      </>}
    {problem && <Alert severity="error" data-testid="join-problem">{problem}</Alert>}
    {/* it was reachable when the page opened, and is not now: Start would wait for nothing */}
    {slow && <Alert severity="warning" data-testid="join-unreachable">This phone cannot reach the hub. Is it on the church Wi-Fi, the same network as the computer that runs ACC Tally?</Alert>}
    <Typography className={classes.small}>Keep this page open. Plug the phone in if the service is long: the screen stays on.</Typography>
  </div>
}

export default JoinPage
