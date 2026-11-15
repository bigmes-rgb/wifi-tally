import { Divider, ListItemIcon, ListItemText, makeStyles, Menu, MenuItem, PopoverPosition, Typography } from '@material-ui/core'
import ArrowBackIcon from '@material-ui/icons/ArrowBack'
import CheckIcon from '@material-ui/icons/Check'
import ChevronRightIcon from '@material-ui/icons/ChevronRight'
import DeleteIcon from '@material-ui/icons/Delete'
import EditIcon from '@material-ui/icons/Edit'
import HighlightIcon from '@material-ui/icons/Highlight'
import InputIcon from '@material-ui/icons/Input'
import SubjectIcon from '@material-ui/icons/Subject'
import TuneIcon from '@material-ui/icons/Tune'
import React, { useEffect, useState } from 'react'
import Channel from '../../domain/Channel'
import { Tally } from '../../domain/Tally'
import { socket } from '../../hooks/useSocket'
import { channelLabel } from '../../lib/preService'

const useStyles = makeStyles(theme => ({
  paper: { minWidth: 210, maxWidth: "calc(100vw - 16px)" },
  // a heading, not an action: disabled so the keyboard starts on Flash, but not greyed out
  head: { display: "block", padding: theme.spacing(0.75, 2, 1), opacity: "1 !important" },
  headName: { fontWeight: 600, fontSize: "0.85rem", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  headState: { fontSize: "0.7rem", color: theme.palette.text.secondary },
  icon: { minWidth: 30 },
  item: { paddingTop: 3, paddingBottom: 3, minHeight: 0 },
  text: { margin: "1px 0" },
  secondary: { fontSize: "0.68rem" },
  end: { marginLeft: theme.spacing(1), opacity: 0.7 },
  remove: { color: theme.palette.error.light },
}))

// what the menu's heading says about the light, in the switcher's terms
export const STATE_WORDS: Record<string, string> = {
  program: "On air", preview: "On preview", idle: "Ready", unpatched: "No input",
  unknown: "Switcher not connected", missing: "Missing", offline: "Offline",
}

export type DockMenuAnchor = { el?: Element, position?: PopoverPosition }

type DockTallyMenuProps = {
  tally: Tally
  state: string
  channels: Channel[]
  anchor: DockMenuAnchor
  onClose: () => void
  onFlash: (tally: Tally) => void
  onOpen: (kind: "rename" | "settings" | "log", tally: Tally) => void
}

// One light's menu in the OBS dock, from its ⋮ or a right-click: flash it, move it to another input, rename it,
// its settings and its log, and remove it once it is off the network. Adding lights stays on the full page. The
// input list opens in place of the menu rather than beside it, which a narrow dock has no room for.
function DockTallyMenu({ tally, state, channels, anchor, onClose, onFlash, onOpen }: DockTallyMenuProps) {
  const classes = useStyles()
  const [page, setPage] = useState<"main" | "input">("main")
  useEffect(() => { setPage("main") }, [tally.name, anchor])

  const isLight = !tally.isWebTally()
  const canFlash = tally.isActive()
  const canRename = isLight && tally.isConnected()
  const canRemove = !tally.isConnected()
  const input = tally.isPatched() ? channelLabel(tally.channelId, channels) : "No input"
  const then = (fn: () => void) => () => { onClose(); fn() }
  const patch = (channelId: string | null) => then(() => socket.emit('tally.patch', tally.name, tally.type, channelId))
  const secondary = { className: classes.secondary }

  const head = <MenuItem key="head" disabled className={classes.head} data-testid="dockmenu-head">
    <Typography className={classes.headName}>{tally.name}</Typography>
    <Typography className={classes.headState}>{STATE_WORDS[state] || ""}{tally.isPatched() && state !== "unpatched" ? ` · ${input}` : ""}</Typography>
  </MenuItem>

  const main = [
    head,
    <Divider key="d1" />,
    <MenuItem key="flash" dense className={classes.item} disabled={!canFlash} onClick={then(() => onFlash(tally))} data-testid="dockmenu-flash">
      <ListItemIcon className={classes.icon}><HighlightIcon /></ListItemIcon>
      <ListItemText className={classes.text} primary="Flash" secondary={canFlash ? "White for 3 seconds, to find it" : "The light is offline"} secondaryTypographyProps={secondary} />
    </MenuItem>,
    <MenuItem key="input" dense className={classes.item} onClick={() => setPage("input")} data-testid="dockmenu-input">
      <ListItemIcon className={classes.icon}><InputIcon /></ListItemIcon>
      <ListItemText className={classes.text} primary="Input" secondary={input} secondaryTypographyProps={secondary} />
      <ChevronRightIcon className={classes.end} />
    </MenuItem>,
    isLight && <MenuItem key="rename" dense className={classes.item} disabled={!canRename} onClick={then(() => onOpen("rename", tally))} data-testid="dockmenu-rename">
      <ListItemIcon className={classes.icon}><EditIcon /></ListItemIcon>
      <ListItemText className={classes.text} primary="Rename…" secondary={canRename ? undefined : "Needs the light on the network"} secondaryTypographyProps={secondary} />
    </MenuItem>,
    <MenuItem key="settings" dense className={classes.item} onClick={then(() => onOpen("settings", tally))} data-testid="dockmenu-settings">
      <ListItemIcon className={classes.icon}><TuneIcon /></ListItemIcon>
      <ListItemText className={classes.text} primary="Settings…" />
    </MenuItem>,
    <MenuItem key="log" dense className={classes.item} onClick={then(() => onOpen("log", tally))} data-testid="dockmenu-log">
      <ListItemIcon className={classes.icon}><SubjectIcon /></ListItemIcon>
      <ListItemText className={classes.text} primary="Log" />
    </MenuItem>,
    canRemove && <Divider key="d2" />,
    canRemove && <MenuItem key="remove" dense className={classes.item} onClick={then(() => socket.emit('tally.remove', tally.name, tally.type))} data-testid="dockmenu-remove">
      <ListItemIcon className={[classes.icon, classes.remove].join(" ")}><DeleteIcon /></ListItemIcon>
      <ListItemText className={classes.text} primary="Remove from the list" secondary="It comes back if it connects again" secondaryTypographyProps={secondary} />
    </MenuItem>,
  ].filter(Boolean)

  const choice = (id: string | null, label: string) => {
    const chosen = (tally.channelId ?? null) === id
    return <MenuItem key={id ?? "none"} dense className={classes.item} selected={chosen} onClick={patch(id)} data-testid={`dockmenu-channel-${id ?? "none"}`}>
      <ListItemIcon className={classes.icon}>{chosen ? <CheckIcon /> : <span />}</ListItemIcon>
      <ListItemText className={classes.text} primary={label} />
    </MenuItem>
  }
  const inputs = [
    <MenuItem key="back" dense className={classes.item} onClick={() => setPage("main")} data-testid="dockmenu-back">
      <ListItemIcon className={classes.icon}><ArrowBackIcon /></ListItemIcon>
      <ListItemText className={classes.text} primary={`Input for ${tally.name}`} />
    </MenuItem>,
    <Divider key="d" />,
    ...channels.map(c => choice(c.id, c.name || `Channel ${c.id}`)),
    // an input the switcher no longer has stays visible, so it can be seen and changed
    ...(tally.channelId !== undefined && !channels.some(c => c.id === tally.channelId) ? [choice(tally.channelId, `Channel ${tally.channelId}`)] : []),
    choice(null, "No input"),
  ]

  return <Menu
    open
    onClose={onClose}
    anchorEl={anchor.el}
    anchorReference={anchor.position ? "anchorPosition" : "anchorEl"}
    anchorPosition={anchor.position}
    // from the ⋮: below it, right edges lined up; from a right-click: opening from the pointer
    anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
    transformOrigin={anchor.position ? { vertical: "top", horizontal: "left" } : { vertical: "top", horizontal: "right" }}
    getContentAnchorEl={null}
    classes={{ paper: classes.paper }}
    data-testid="dockmenu"
  >
    {page === "main" ? main : inputs}
  </Menu>
}

export default DockTallyMenu
