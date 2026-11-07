import { Button, ButtonProps, makeStyles, Popover, Tooltip, Typography } from '@material-ui/core'
import Brightness6Icon from '@material-ui/icons/Brightness6'
import React, { useEffect, useRef, useState } from 'react'
import BrightnessSlider from './config/BrightnessSlider'
import { useDimmer } from '../hooks/useConfiguration'
import { socket } from '../hooks/useSocket'

const useStyles = makeStyles(theme => ({
  button: {
    textTransform: "none",
    whiteSpace: "nowrap",
  },
  // dimmed lights are easy to forget: the button says so until they are back at full
  dimmed: {
    backgroundColor: theme.palette.warning.dark,
    color: theme.palette.getContrastText(theme.palette.warning.dark),
    "&:hover": { backgroundColor: theme.palette.warning.main },
  },
  icon: { marginRight: theme.spacing(1) },
  popover: { padding: theme.spacing(2), width: 320 },
  // room for the slider's value bubble above the thumb
  slider: { marginTop: theme.spacing(2), padding: theme.spacing(0, 1) },
  actions: { display: "flex", justifyContent: "flex-end", marginTop: theme.spacing(1) },
}))

export const MIN_DIMMER = 10

// One brightness for every light at once, on top of each light's own settings: dim for an evening service,
// back to full afterwards. Lives in the Tallies page's toolbar (ButtonGroup passes its props through).
function Dimmer(buttonProps: ButtonProps) {
  const classes = useStyles()
  const fromHub = useDimmer()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [draft, setDraft] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // the hub confirmed a value: show that one
  useEffect(() => { setDraft(null) }, [fromHub])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const value = draft ?? fromHub ?? 100
  const dimmed = value < 100
  // a dragged slider sends its last value, not every step
  const change = (next: number) => {
    setDraft(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => socket.emit('config.change.dimmer', next), 150)
  }

  const { className, ...rest } = buttonProps
  return <>
    <Tooltip title={dimmed ? `All lights dimmed to ${value}%` : "Brightness of all lights"}>
      <Button {...rest} className={[className, classes.button, dimmed ? classes.dimmed : ""].join(" ")} onClick={e => setAnchor(e.currentTarget)} data-testid="dimmer" data-dimmed={dimmed}>
        <Brightness6Icon className={classes.icon} fontSize="small" /> {value}%
      </Button>
    </Tooltip>
    <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }} classes={{ paper: classes.popover }}>
      <Typography variant="subtitle2">Brightness of all lights</Typography>
      <Typography variant="body2" color="textSecondary">
        On top of each light's own settings. Dim them for an evening service and set them back to full afterwards; the button stays amber while they are dimmed.
      </Typography>
      <div className={classes.slider}>
        <BrightnessSlider value={value} testId="dimmer-slider" onChange={change} minValue={MIN_DIMMER} minMessage={`${MIN_DIMMER}% is as dim as it goes: a light must stay visible.`} />
      </div>
      <div className={classes.actions}>
        <Button size="small" color="primary" disabled={!dimmed} onClick={() => change(100)} data-testid="dimmer-full">Full brightness</Button>
      </div>
    </Popover>
  </>
}

export default Dimmer
