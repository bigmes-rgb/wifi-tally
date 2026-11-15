import { ButtonGroup, createMuiTheme, fade, makeStyles, ThemeProvider, Tooltip, Typography } from '@material-ui/core'
import { myThemeOptions } from '../components/layout/MyTheme'
// lets the theme below style the Alert from @material-ui/lab
import type {} from '@material-ui/lab/themeAugmentation'
import ChevronRightIcon from '@material-ui/icons/ChevronRight'
import PhoneIphoneIcon from '@material-ui/icons/PhoneIphone'
import React, { useEffect, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Dimmer from '../components/Dimmer'
import PreServiceCheck, { WALK_FLASH_MS } from '../components/PreServiceCheck'
import Channel from '../domain/Channel'
import { Tally } from '../domain/Tally'
import useChannels from '../hooks/useChannels'
import { useDimmer, useSetupConfiguration } from '../hooks/useConfiguration'
import useHubInfo from '../hooks/useHubInfo'
import useMixerInfo, { useMixerProblem } from '../hooks/useMixerInfo'
import useOtherHubs from '../hooks/useOtherHubs'
import useProgramPreview from '../hooks/useProgramPreview'
import { socket } from '../hooks/useSocket'
import useSocketInfo from '../hooks/useSocketInfo'
import useTallies from '../hooks/useTallies'
import { channelLabel, preServiceFindings, verdict } from '../lib/preService'
import { orderTallies } from '../lib/tallyOrder'

// The main theme sets its type for a desktop screen (about 18 px body text). A dock inside OBS is a few hundred
// pixels wide, and Windows' display scaling makes every pixel bigger again, so the dock and everything that opens
// from it (the check, the dimmer) is set small and dense: about 12.5 px body text, tighter dialogs and alerts.
// These are theme settings, not class names: under a second theme MUI's class names get a suffix.
export const dockTheme = createMuiTheme({
  ...myThemeOptions,
  typography: { ...(myThemeOptions.typography as object), fontSize: 11, htmlFontSize: 16 },
  props: {
    MuiSvgIcon: { fontSize: "small" },
    MuiButton: { size: "small" },
  },
  overrides: {
    MuiDialogTitle: { root: { padding: "12px 14px 6px" } },
    MuiDialogContent: { root: { padding: "4px 14px" } },
    MuiDialogActions: { root: { padding: "8px 10px" } },
    MuiAlert: {
      root: { padding: "2px 10px" },
      icon: { padding: "5px 0", marginRight: 8, fontSize: 18 },
      message: { padding: "5px 0" },
    },
    MuiButton: { sizeSmall: { padding: "3px 8px" }, outlinedSizeSmall: { padding: "2px 7px" } },
    MuiTooltip: { tooltip: { fontSize: "0.7rem" } },
  },
})

// what a tile shows, from the light's state and the switcher's
export type TileState = "program" | "preview" | "idle" | "unpatched" | "unknown" | "missing" | "offline"

export function tileState(tally: Tally, programs: string[] | null, previews: string[] | null): TileState {
  if (!tally.isActive()) return "offline"
  if (tally.isMissing()) return "missing"
  if (!tally.isPatched()) return "unpatched"
  if (programs === null) return "unknown"
  if (tally.isIn(programs)) return "program"
  if (previews !== null && tally.isIn(previews)) return "preview"
  return "idle"
}

const useStyles = makeStyles(theme => ({
  root: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: theme.palette.background.default,
    color: theme.palette.text.primary,
    overflow: "hidden",
  },
  bar: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    padding: theme.spacing(0.25, 0.75),
    minHeight: 32,
    borderBottom: "1px solid " + theme.palette.grey[800],
  },
  dot: {
    width: 8, height: 8, borderRadius: 4, flexShrink: 0,
    background: theme.palette.success.main,
  },
  dotOff: { background: theme.palette.error.main },
  brand: {
    fontSize: "0.7rem",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: theme.palette.text.secondary,
    flexGrow: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  tools: { flexShrink: 0, "& button": { minWidth: 30, padding: "2px 6px" } },
  // one line for what needs attention; it opens the pre-service check
  strip: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
    padding: theme.spacing(0.5, 1),
    fontSize: "0.72rem",
    lineHeight: 1.3,
    cursor: "pointer",
    userSelect: "none",
    "& span": { flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  },
  stripFail: { background: theme.palette.error.main, color: theme.palette.getContrastText(theme.palette.error.main) },
  stripWarn: { background: theme.palette.warning.main, color: theme.palette.getContrastText(theme.palette.warning.main) },
  // one row per light; a wide dock (a strip under the preview) gets several columns of rows
  list: {
    flexGrow: 1,
    overflowY: "auto",
    padding: theme.spacing(0.75),
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
    gridAutoRows: "min-content",
    gap: 4,
    alignContent: "start",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    minHeight: 30,
    padding: "3px 8px 3px 10px",
    borderRadius: 4,
    cursor: "pointer",
    userSelect: "none",
    transition: "background-color 150ms, box-shadow 150ms",
    background: theme.palette.grey[800],
    border: "1px solid transparent",
    "&:hover": { filter: "brightness(1.1)" },
  },
  program: { background: theme.palette.error.main, color: "#fff" },
  preview: { background: theme.palette.success.main, color: "#fff" },
  idle: {},
  unknown: { borderColor: theme.palette.grey[600], borderStyle: "dashed" },
  unpatched: { borderColor: theme.palette.grey[600], borderStyle: "dashed", color: theme.palette.text.secondary },
  missing: { background: fade(theme.palette.warning.main, 0.25), borderColor: theme.palette.warning.main },
  offline: { background: theme.palette.grey[900], color: theme.palette.text.secondary, borderColor: theme.palette.grey[800] },
  flashing: { boxShadow: "inset 0 0 0 2px #fff" },
  name: {
    flex: "0 1 auto",
    minWidth: 0,
    fontSize: "0.8rem",
    fontWeight: 600,
    lineHeight: 1.25,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  input: {
    flex: "1 1 auto",
    minWidth: 0,
    fontSize: "0.7rem",
    lineHeight: 1.25,
    opacity: 0.8,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  // a small word at the end when the light is not simply following the switcher
  tag: {
    flexShrink: 0,
    fontSize: "0.6rem",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    opacity: 0.9,
  },
  phone: { flexShrink: 0, fontSize: "0.85rem", opacity: 0.7 },
  empty: { padding: theme.spacing(3, 2), textAlign: "center", fontSize: "0.8rem" },
}))

const tagFor = (state: TileState): string | null => {
  switch (state) {
    case "offline": return "offline"
    case "missing": return "missing"
    case "unpatched": return "no input"
    case "unknown": return "no switcher"
    default: return null
  }
}

// The Tallies page made for a dock inside OBS: a narrow column or a wide strip, dark, readable from the booth
// at a glance. One row per light in the switcher's order, coloured by what the light shows; a one-line strip
// when something needs attention, which opens the pre-service check; the check and the dimmer in a slim bar.
// No menu: the full page at / is for the desktop. Clicking a row flashes its light, to tell which is which.
function DockPage() {
  const classes = useStyles()
  const rawTallies = useTallies()
  const channels: Channel[] = useChannels() || []
  const [programs, previews] = useProgramPreview()
  const isHubConnected = useSocketInfo()
  const mixerConnected = useMixerInfo()
  const mixerProblem = useMixerProblem()
  const otherHubs = useOtherHubs()
  const hub = useHubInfo()
  const dimmer = useDimmer()
  const setupState = useSetupConfiguration()
  const [openCheck, setOpenCheck] = useState(0)
  const [flashing, setFlashing] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])

  const tallies = orderTallies(rawTallies || [], channels)
  const findings = preServiceFindings({ mixerConnected, mixerProblem, tallies, channels, otherHubs, programStamp: hub?.programStamp, dimmer })
  const summary = verdict(findings)
  const attention = findings.filter(f => f.status !== "ok")
  const worst = findings.find(f => f.status === "fail") || attention[0]

  const flash = (tally: Tally) => {
    socket.emit('tally.highlight', tally.name, tally.type, WALK_FLASH_MS)
    setFlashing(tally.name)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashing(null), WALK_FLASH_MS)
  }

  return <ThemeProvider theme={dockTheme}><div className={classes.root} data-testid="dock">
    <div className={classes.bar}>
      <Tooltip title={isHubConnected ? "Hub connected" : "Hub disconnected"}><span className={[classes.dot, isHubConnected ? "" : classes.dotOff].join(" ")} data-testid="dock-hub" data-connected={isHubConnected} /></Tooltip>
      <span className={classes.brand}>ACC | Tally</span>
      <ButtonGroup size="small" variant="outlined" className={classes.tools}>
        <PreServiceCheck compact openSignal={openCheck} />
        <Dimmer compact />
      </ButtonGroup>
    </div>
    {!isHubConnected
      ? <div className={[classes.strip, classes.stripFail].join(" ")} data-testid="dock-strip" data-status="fail"><span>Hub disconnected. Reconnecting…</span></div>
      : worst && <div className={[classes.strip, worst.status === "fail" ? classes.stripFail : classes.stripWarn].join(" ")} onClick={() => setOpenCheck(n => n + 1)} data-testid="dock-strip" data-status={worst.status} role="button">
        <span>{worst.title}{attention.length > 1 ? ` · ${summary.title}` : ""}</span>
        <ChevronRightIcon fontSize="small" />
      </div>}
    {setupState?.needed
      ? <Typography className={classes.empty} color="textSecondary">ACC Tally is not set up yet. <RouterLink to="/setup" style={{ color: "inherit" }}>Open the setup</RouterLink> on the hub computer.</Typography>
      : tallies.length === 0
        ? <Typography className={classes.empty} color="textSecondary" data-testid="dock-empty">No lights yet. Add them on the hub's Tallies page.</Typography>
        : <div className={classes.list} data-testid="dock-list">
          {tallies.map(tally => {
            const state = tileState(tally, programs, previews)
            const tag = tagFor(state)
            return <Tooltip key={tally.name} title="Click to flash this light" enterDelay={700}>
              <div className={[classes.row, classes[state], flashing === tally.name ? classes.flashing : ""].join(" ")} onClick={() => flash(tally)} data-testid={`dock-${tally.name}`} data-state={state} role="button">
                <span className={classes.name}>{tally.name}</span>
                <span className={classes.input}>{tally.isPatched() ? channelLabel(tally.channelId, channels) : "No input"}</span>
                {tag && <span className={classes.tag}>{tag}</span>}
                {!tag && tally.isWebTally() && <PhoneIphoneIcon className={classes.phone} />}
              </div>
            </Tooltip>
          })}
        </div>}
  </div></ThemeProvider>
}

export default DockPage
