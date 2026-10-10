import { Button, makeStyles, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import CheckCircleIcon from '@material-ui/icons/CheckCircle'
import CancelIcon from '@material-ui/icons/Cancel'
import RadioButtonUncheckedIcon from '@material-ui/icons/RadioButtonUnchecked'
import CircularProgress from '@material-ui/core/CircularProgress'
import React, { useEffect, useRef, useState } from 'react'
import { adviceFor, readNetworkReport } from '../../flasher/NetworkCheck'
import useHubInfo from '../../hooks/useHubInfo'
import { socket } from '../../hooks/useSocket'

const useStyles = makeStyles(theme => ({
  block: { marginBottom: theme.spacing(2) },
  list: { listStyle: "none", padding: 0, margin: theme.spacing(0, 0, 2, 0) },
  item: { display: "flex", alignItems: "center", gap: theme.spacing(1), padding: theme.spacing(0.5, 0) },
  output: {
    maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: "0.8em",
    background: theme.palette.background.default, padding: theme.spacing(1), borderRadius: 4,
  },
}))

type Props = {
  path?: string // where the light is plugged in; without it there is nothing to watch
}

type Mark = "done" | "now" | "failed" | "todo"

// Step 5 of Build a light: restarts the light while it is still on USB and shows, line by line,
// how far it gets joining the Wi-Fi and finding the hub, and what to do when it stops.
function NetworkCheck({ path }: Props) {
  const classes = useStyles()
  const hub = useHubInfo()
  const [text, setText] = useState("")
  const [watching, setWatching] = useState(false)
  const [ipSince, setIpSince] = useState<number | null>(null)
  const [, tick] = useState(0)
  const textRef = useRef("")

  const start = () => {
    if (!path) return
    textRef.current = ""
    setText("")
    setIpSince(null)
    setWatching(true)
    socket.emit('flasher.watch.start', path)
  }

  useEffect(() => {
    const onText = (chunk: string) => { textRef.current += chunk; setText(textRef.current) }
    const onEnd = () => setWatching(false)
    socket.on('flasher.watch.text', onText)
    socket.on('flasher.watch.end', onEnd)
    start()
    const clock = setInterval(() => tick(t => t + 1), 1000)
    return () => {
      socket.off('flasher.watch.text', onText)
      socket.off('flasher.watch.end', onEnd)
      socket.emit('flasher.watch.stop')
      clearInterval(clock)
    }
  }, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  const addresses = hub?.addresses || []
  const report = readNetworkReport(text, addresses, ipSince ? (Date.now() - ipSince) / 1000 : 0)
  useEffect(() => { if (report.ip && ipSince === null) setIpSince(Date.now()) }, [report.ip, ipSince])
  const advice = adviceFor(report, addresses)
  const stuck = !!report.problem || (!watching && report.stage !== "found")

  if (!path) {
    return <Alert severity="info" className={classes.block}>Plug the light into this computer's USB to see its own Wi-Fi report here, or just wait for it in the list below.</Alert>
  }

  const p = report.problem
  const steps: [string, Mark][] = [
    ["Settings read", p === "noSettings" ? "failed" : text ? "done" : "now"],
    // a refused password means the network was there
    [`Wi-Fi network ${report.ssid ? `"${report.ssid}" ` : ""}found`, p === "noNetwork" ? "failed" : report.associated || p === "wrongPassword" ? "done" : report.ssid ? "now" : "todo"],
    ["Password accepted", p === "wrongPassword" ? "failed" : report.associated ? "done" : report.ssid ? "now" : "todo"],
    [`Got an address${report.ip ? ` (${report.ip})` : ""}`, p === "noAddress" ? "failed" : report.ip ? "done" : report.associated ? "now" : "todo"],
    ["Found the hub", p === "noHub" || p === "otherNetwork" ? "failed" : report.stage === "found" ? "done" : report.ip ? "now" : "todo"],
  ]
  const icon = (mark: Mark) => mark === "done" ? <CheckCircleIcon style={{ color: "#43a047" }} />
    : mark === "failed" ? <CancelIcon color="error" />
    : mark === "now" && watching ? <span style={{ width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><CircularProgress size={18} /></span>
    : <RadioButtonUncheckedIcon color="disabled" />

  return <div data-testid="network-check">
    <Typography paragraph color="textSecondary">Keep the light plugged in for this step: it restarts and reports how it joins the Wi-Fi.</Typography>
    <ul className={classes.list}>
      {steps.map(([label, mark]) => <li key={label} className={classes.item} data-testid={`network-step-${mark}`}>{icon(mark)}<span>{label}</span></li>)}
    </ul>
    {report.stage === "found" && <Alert severity="success" className={classes.block} data-testid="network-found">
      The light is on the Wi-Fi and found the hub at {report.hubIp}. You can unplug it and mount it.
    </Alert>}
    {advice && <Alert severity="error" className={classes.block} data-testid={`network-problem-${p}`}>{advice}</Alert>}
    {!advice && stuck && <Alert severity="warning" className={classes.block} data-testid="network-silent">
      {text ? "The light stopped reporting before it found the hub." : "The light printed nothing. Is it still plugged in?"} Watch again, or check the list below.
    </Alert>}
    {text && <details className={classes.block}>
      <summary><Typography variant="caption" color="textSecondary" component="span">What the light printed</Typography></summary>
      <pre className={classes.output} data-testid="network-output">{text}</pre>
    </details>}
    {!watching && <Button variant="outlined" size="small" onClick={start} className={classes.block} data-testid="network-again">Watch again</Button>}
  </div>
}

export default NetworkCheck
