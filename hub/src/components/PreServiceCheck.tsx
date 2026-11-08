import { Button, ButtonProps, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, makeStyles, Tooltip, Typography, useMediaQuery, useTheme } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import CheckCircleIcon from '@material-ui/icons/CheckCircle'
import ErrorIcon from '@material-ui/icons/Error'
import PlaylistAddCheckIcon from '@material-ui/icons/PlaylistAddCheck'
import RadioButtonUncheckedIcon from '@material-ui/icons/RadioButtonUnchecked'
import WarningIcon from '@material-ui/icons/Warning'
import React, { useEffect, useRef, useState } from 'react'
import { UdpTally } from '../domain/Tally'
import useChannels from '../hooks/useChannels'
import { useDimmer } from '../hooks/useConfiguration'
import useHubInfo from '../hooks/useHubInfo'
import useMixerInfo, { useMixerProblem } from '../hooks/useMixerInfo'
import useOtherHubs from '../hooks/useOtherHubs'
import { socket } from '../hooks/useSocket'
import useTallies from '../hooks/useTallies'
import { channelLabel, Finding, FindingStatus, preServiceFindings, verdict } from '../lib/preService'
import { orderTallies } from '../lib/tallyOrder'

const useStyles = makeStyles(theme => ({
  button: { textTransform: "none", whiteSpace: "nowrap" },
  icon: { marginRight: theme.spacing(1) },
  list: { listStyle: "none", margin: theme.spacing(1, 0, 0, 0), padding: 0 },
  item: { display: "flex", alignItems: "flex-start", gap: theme.spacing(1.5), padding: theme.spacing(1, 0), borderBottom: "1px solid " + theme.palette.divider },
  itemIcon: { marginTop: 2, flexShrink: 0 },
  itemText: { flexGrow: 1 },
  itemAction: { flexShrink: 0, whiteSpace: "nowrap", alignSelf: "center" },
  detail: { color: theme.palette.text.secondary },
  ok: { color: theme.palette.success.main },
  warn: { color: theme.palette.warning.main },
  fail: { color: theme.palette.error.main },
  section: { marginTop: theme.spacing(3) },
  walkRow: { display: "flex", alignItems: "center", gap: theme.spacing(1.5), padding: theme.spacing(0.75, 0) },
  walkName: { flexGrow: 1 },
  walkInput: { color: theme.palette.text.secondary, marginLeft: theme.spacing(1) },
  spinner: { width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
}))

// how long each light flashes in the walk test, and the pause before the next one
export const WALK_FLASH_MS = 3000
export const WALK_GAP_MS = 700

type WalkState = { running: boolean, current: string | null, done: string[] }

// Before the service: what must be true for the lights to work, in one list, and a walk test that flashes each
// light in turn so whoever is in the room can see every camera's light respond. Lives in the Tallies page's
// toolbar (ButtonGroup passes its props through).
type PreServiceCheckProps = ButtonProps & { compact?: boolean, openSignal?: number }

function PreServiceCheck({ compact, openSignal, ...buttonProps }: PreServiceCheckProps) {
  const classes = useStyles()
  // in a narrow pane (a dock inside OBS) the dialog takes the whole pane instead of a cramped box
  const narrow = useMediaQuery(useTheme().breakpoints.down('xs'))
  const [open, setOpen] = useState(false)
  // a parent asks for the dialog by bumping openSignal
  useEffect(() => { if (openSignal) setOpen(true) }, [openSignal])
  const mixerConnected = useMixerInfo()
  const mixerProblem = useMixerProblem()
  const tallies = useTallies() || []
  const channels = useChannels() || []
  const otherHubs = useOtherHubs()
  const hub = useHubInfo()
  const dimmer = useDimmer()
  const [walk, setWalk] = useState<WalkState>({ running: false, current: null, done: [] })
  const cancelled = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const findings = preServiceFindings({ mixerConnected, mixerProblem, tallies, channels, otherHubs, programStamp: hub?.programStamp, dimmer })
  const summary = verdict(findings)
  // the lights the walk can flash: on the network and on an input, in the switcher's order
  const walkable = orderTallies(tallies.filter(t => t instanceof UdpTally && t.isConnected() && t.isPatched()), channels)

  // no more flashes: the current one ends on the light by itself
  const quiet = () => {
    cancelled.current = true
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  const stopWalk = () => {
    quiet()
    setWalk(w => ({ ...w, running: false, current: null }))
  }
  useEffect(() => quiet, [])
  const close = () => { stopWalk(); setOpen(false) }

  const flash = (name: string) => socket.emit('tally.highlight', name, "udp", WALK_FLASH_MS)
  const startWalk = () => {
    cancelled.current = false
    const names = walkable.map(t => t.name)
    setWalk({ running: true, current: null, done: [] })
    const step = (i: number) => {
      if (cancelled.current) return
      if (i >= names.length) { setWalk({ running: false, current: null, done: names }); return }
      setWalk({ running: true, current: names[i], done: names.slice(0, i) })
      flash(names[i])
      timers.current.push(setTimeout(() => step(i + 1), WALK_FLASH_MS + WALK_GAP_MS))
    }
    step(0)
  }

  const statusIcon = (status: FindingStatus) => status === "ok" ? <CheckCircleIcon className={classes.ok} />
    : status === "warn" ? <WarningIcon className={classes.warn} /> : <ErrorIcon className={classes.fail} />
  const severity = summary.status === "ok" ? "success" : summary.status === "warn" ? "warning" : "error"
  const act = (finding: Finding) => {
    if (finding.action === "full-brightness") return <Button size="small" variant="outlined" className={classes.itemAction} onClick={() => socket.emit('config.change.dimmer', 100)} data-testid="precheck-full-brightness">Set to full</Button>
    return null
  }

  const { className, ...rest } = buttonProps
  return <>
    {compact
      ? <Tooltip title="Pre-service check"><Button {...rest} className={[className, classes.button].join(" ")} onClick={() => setOpen(true)} data-testid="precheck" aria-label="Pre-service check"><PlaylistAddCheckIcon fontSize="small" /></Button></Tooltip>
      : <Button {...rest} className={[className, classes.button].join(" ")} onClick={() => setOpen(true)} data-testid="precheck">
        <PlaylistAddCheckIcon className={classes.icon} fontSize="small" /> Pre-service check
      </Button>}
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth fullScreen={narrow} data-testid="precheck-dialog">
      <DialogTitle>Pre-service check</DialogTitle>
      <DialogContent>
        <Alert severity={severity} data-testid="precheck-verdict">{summary.title}</Alert>
        <ul className={classes.list} data-testid="precheck-findings">
          {findings.map(f => <li key={f.id} className={classes.item} data-testid={`precheck-${f.id}`} data-status={f.status}>
            <span className={classes.itemIcon}>{statusIcon(f.status)}</span>
            <span className={classes.itemText}>
              <Typography variant="body1">{f.title}</Typography>
              {f.detail && <Typography variant="body2" className={classes.detail}>{f.detail}</Typography>}
            </span>
            {act(f)}
          </li>)}
        </ul>

        <div className={classes.section}>
          <Typography variant="subtitle1">Walk test</Typography>
          <Typography variant="body2" color="textSecondary" paragraph>
            Each light flashes white for {WALK_FLASH_MS / 1000} seconds, one after the other in the switcher's order, so whoever stands in the room sees every camera's light respond. A light that stays dark: check its power and where it points.
          </Typography>
          {walkable.length === 0
            ? <Alert severity="info" data-testid="walk-none">No light is online and on an input, so there is nothing to flash yet.</Alert>
            : <div data-testid="walk-list">
              {walkable.map(t => {
                const state = walk.current === t.name ? "now" : walk.done.includes(t.name) ? "done" : "todo"
                return <div key={t.name} className={classes.walkRow} data-testid={`walk-${t.name}`} data-state={state}>
                  {state === "now" ? <span className={classes.spinner}><CircularProgress size={18} /></span>
                    : state === "done" ? <CheckCircleIcon className={classes.ok} /> : <RadioButtonUncheckedIcon color="disabled" />}
                  <span className={classes.walkName}>
                    <strong>{t.name}</strong><span className={classes.walkInput}>{channelLabel(t.channelId, channels)}</span>
                    {state === "now" && <span className={classes.walkInput}>flashing now</span>}
                  </span>
                  <Button size="small" disabled={walk.running} onClick={() => flash(t.name)} data-testid={`walk-flash-${t.name}`}>Flash</Button>
                </div>
              })}
            </div>}
          {walk.done.length > 0 && !walk.running && walk.done.length === walkable.length && <Alert severity="success" style={{ marginTop: 8 }} data-testid="walk-done">Every light flashed. If one stayed dark in the room, use its Flash button while someone watches it.</Alert>}
        </div>
      </DialogContent>
      <DialogActions>
        {walk.running
          ? <Button onClick={stopWalk} data-testid="walk-stop">Stop</Button>
          : <Button color="primary" variant="contained" disabled={walkable.length === 0} onClick={startWalk} data-testid="walk-start">{walk.done.length > 0 ? "Walk test again" : "Start walk test"}</Button>}
        <Button onClick={close} data-testid="precheck-close">Close</Button>
      </DialogActions>
    </Dialog>
  </>
}

export default PreServiceCheck
