import { Button, CircularProgress, makeStyles, Popover, Tooltip, Typography } from '@material-ui/core'
import React, { useState } from 'react'
import useAppUpdate from '../hooks/useAppUpdate'
import useHubInfo from '../hooks/useHubInfo'
import { socket } from '../hooks/useSocket'
import { AppUpdateState } from '../lib/AppUpdate'

const useStyles = makeStyles(theme => ({
  badge: {
    marginLeft: "auto",
    textTransform: "none",
    fontWeight: 400,
    fontSize: "0.8rem",
    opacity: 0.85,
    whiteSpace: "nowrap",
    gap: theme.spacing(0.75),
  },
  dot: { width: 8, height: 8, borderRadius: 4, display: "inline-block", marginRight: theme.spacing(0.75), flexShrink: 0 },
  ok: { background: theme.palette.success.main },
  ready: { background: theme.palette.info.main },
  busy: { background: theme.palette.grey[500] },
  bad: { background: theme.palette.warning.main },
  pop: { padding: theme.spacing(2), maxWidth: 320 },
  line: { display: "flex", alignItems: "center", gap: theme.spacing(1), marginTop: theme.spacing(0.5) },
  actions: { display: "flex", gap: theme.spacing(1), marginTop: theme.spacing(1.5) },
  dockVersion: { fontSize: "0.62rem", opacity: 0.6, letterSpacing: "0.03em", whiteSpace: "nowrap", flexShrink: 0, cursor: "default" },
}))

type Mark = "ok" | "ready" | "busy" | "bad" | null

// where the app's own update stands, in a few words, and the colour of its dot
export function updateWords(update?: AppUpdateState): { text: string, mark: Mark } {
  switch (update?.status) {
    case "checking": return { text: "Checking for updates…", mark: "busy" }
    case "current": return { text: "Up to date", mark: "ok" }
    case "downloading": return { text: `Downloading ${update.version}… ${update.percent || 0}%`, mark: "busy" }
    case "ready": return { text: `${update.version} is ready to install`, mark: "ready" }
    case "error": return { text: "Could not check for updates", mark: "bad" }
    // the npm package, development: nothing updates this copy by itself
    default: return { text: "Updates itself only as the installed Windows app", mark: null }
  }
}

// which version runs: what the updater says, else what the hub says about itself
export function useRunningVersion(): string | undefined {
  const update = useAppUpdate()
  const hub = useHubInfo()
  return update?.current || hub?.version
}

// In the page header, at the right: the version that runs, with a dot for where its update stands. A click shows
// the words, "Check for updates", and the restart when a new version is ready.
export function AppVersion() {
  const classes = useStyles()
  const update = useAppUpdate()
  const version = useRunningVersion()
  const [anchor, setAnchor] = useState<Element | null>(null)
  const [asked, setAsked] = useState(false)
  if (!version) return null
  const { text, mark } = updateWords(update)
  const canCheck = update?.status === "current" || update?.status === "error"

  return <>
    <Button color="inherit" size="small" className={classes.badge} onClick={e => setAnchor(e.currentTarget)} aria-label={`ACC Tally ${version}: ${text}`} data-testid="app-version">
      {mark && <span className={[classes.dot, classes[mark]].join(" ")} data-testid="app-version-dot" data-mark={mark} />}
      v{version}{update?.status === "ready" && " · update ready"}
    </Button>
    <Popover open={!!anchor} anchorEl={anchor} onClose={() => { setAnchor(null); setAsked(false) }}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
      <div className={classes.pop} data-testid="app-version-details">
        <Typography variant="subtitle2">ACC Tally {version}</Typography>
        <div className={classes.line}>
          {mark === "busy" ? <CircularProgress size={12} /> : mark && <span className={[classes.dot, classes[mark]].join(" ")} />}
          <Typography variant="body2">{text}</Typography>
        </div>
        {update?.status === "error" && update.problem && <Typography variant="caption" color="textSecondary" component="div">{update.problem}</Typography>}
        {update?.status === "current" && <Typography variant="caption" color="textSecondary" component="div">It looks again every 4 hours and each time it starts.</Typography>}
        <div className={classes.actions}>
          {canCheck && <Button size="small" variant="outlined" disabled={asked} onClick={() => { setAsked(true); socket.emit('app.update.check') }} data-testid="app-version-check">Check for updates</Button>}
          {update?.status === "ready" && <Button size="small" variant="contained" color="primary" onClick={() => socket.emit('app.update.install')} data-testid="app-version-restart">Restart and update</Button>}
        </div>
      </div>
    </Popover>
  </>
}

// In the OBS dock's top bar: the version, small, with where its update stands when the pointer rests on it
export function DockVersion() {
  const classes = useStyles()
  const update = useAppUpdate()
  const version = useRunningVersion()
  if (!version) return null
  return <Tooltip title={updateWords(update).text}>
    <span className={classes.dockVersion} data-testid="dock-version">v{version}</span>
  </Tooltip>
}
