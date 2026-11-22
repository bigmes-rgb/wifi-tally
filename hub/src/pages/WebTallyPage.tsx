import React, { useEffect, useState } from 'react'
import { withRouter } from "react-router"
import { socket } from '../hooks/useSocket'
import { WebTally, WebTallyObjectType } from '../domain/Tally'
import { Button, CircularProgress, darken, fade, IconButton, makeStyles, Typography, useTheme } from '@material-ui/core'
import { useHistory, useParams } from "react-router-dom"
import FullscreenIcon from '@material-ui/icons/Fullscreen'
import FullscreenExitIcon from '@material-ui/icons/FullscreenExit'
import { FullScreen, useFullScreenHandle } from "react-full-screen"
import TuneIcon from '@material-ui/icons/Tune'
import { fullScreen, isKeptAwake, keepAwake, letSleep, rememberedName, rememberName } from '../lib/keepAwake'
import useChannels from '../hooks/useChannels'
import { channelLabel } from '../lib/preService'
import { StateCommand } from '../tally/CommandCreator'
import TallySettings from '../components/TallySettings'
import { useDefaultTallyConfiguration } from '../hooks/useConfiguration'
import ColorSchemes from '../tally/ColorScheme'


const useStyles = makeStyles((theme) => ({
  root: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center", 
    padding: theme.spacing(2),

    backgroundColor: theme.palette.grey[800],
    color: fade(theme.palette.getContrastText(theme.palette.grey[800]), 0.7)
  },
  '@keyframes highlight': {
    from: {
      backgroundColor: '#fff',
      color: fade(theme.palette.getContrastText('#fff'), 0.7)
    },
    "50%": {
      backgroundColor: '#000',
      color: fade(theme.palette.getContrastText('#000'), 0.7)
    },
    to: {
      backgroundColor: '#fff',
      color: fade(theme.palette.getContrastText('#fff'), 0.7)
    },
  },
  highlight: {
    animationName: '$highlight',
    animationDuration: '0.25s',
    animationTimingFunction: 'step-start',
    animationIterationCount: 'infinite',
    backgroundColor: '#000',
    color: fade(theme.palette.getContrastText('#000'), 0.7)
  },
  spinner: {
    width: "30vw",
    height: "30vh",
  },
  name: {
    color: "inherit",
  },
  fullscreenIcon: {
    color: "inherit",
    position: "absolute",
    bottom: theme.spacing(2),
    right: theme.spacing(2),
  },
  input: {
    color: "inherit",
    opacity: 0.85,
    fontSize: "1.25rem",
    marginTop: theme.spacing(0.5),
  },
  stateWord: {
    color: "inherit",
    fontSize: "1.6rem",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginTop: theme.spacing(3),
  },
  // a sentence, not a state word: calmer, centred, in normal case
  stateNote: {
    color: "inherit",
    fontSize: "1.15rem",
    lineHeight: 1.4,
    textAlign: "center",
    maxWidth: 320,
    opacity: 0.9,
    marginTop: theme.spacing(3),
  },
  hint: {
    position: "absolute",
    bottom: theme.spacing(3),
    left: "50%",
    transform: "translateX(-50%)",
    padding: theme.spacing(1, 2),
    borderRadius: 20,
    background: "rgba(0,0,0,0.55)",
    color: "#fff",
    fontSize: "0.9rem",
    whiteSpace: "nowrap",
  },
  gone: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    gap: theme.spacing(2),
    padding: theme.spacing(3),
  },
  settingsIcon: {
    color: "inherit",
    position: "absolute",
    top: theme.spacing(2),
    right: theme.spacing(2),
  }
}))

function useWebTally(tallyName: string, onRenamed: (to: string) => void) {
  const [tally, setTally] = useState<WebTally>()
  const [command, setCommand] = useState<StateCommand>()
  const [isValid, setIsValid] = useState<boolean>()

  useEffect(() => {
    const onChange = ({tally: tallyData, command} : {tally: WebTallyObjectType, command: StateCommand}) => {
      const tally = WebTally.fromJson(tallyData)
      setTally(tally)
      setCommand(command)
    }
  
    const onInvalid = (theTallyName: string) => {
      if (tallyName === theTallyName) {
        setTally(undefined)
        setCommand(undefined)
        setIsValid(false)
      }
    }

    const onRename = ({ from, to }: { from: string, to: string }) => {
      if (from === tallyName) onRenamed(to)
    }

    const onDisconnect = () => {
      socket.off('webTally.state', onChange)
      socket.off('webTally.invalid', onInvalid)
      socket.off('webTally.renamed', onRename)
      socket.connected && socket.emit('events.webTally.unsubscribe', tallyName)
      setTally(undefined)
      setCommand(undefined)
      setIsValid(true)
    }

    const onConnect = () => {
      socket.emit('events.webTally.subscribe', tallyName)
      socket.on('webTally.state', onChange)
      socket.on('webTally.invalid', onInvalid)
      socket.on('webTally.renamed', onRename)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    
    socket.connected && onConnect()
    return () => {
      // cleanup
      onDisconnect()
    }
  }, [tallyName, onRenamed])

  return {
    tally,
    command,
    isValid,
  }
}

function WebTallyPage() {
  const { tallyId } = useParams<{tallyId: string}>()
  const tallyName = tallyId.replace(/^web-/, "")
  const history = useHistory()
  // the director renamed this phone: same page, new name; a phone that joined remembers it for next time
  const onRenamed = React.useCallback((to: string) => {
    if (rememberedName() === tallyName) rememberName(to)
    history.replace(`/tally/web-${to}`)
  }, [history, tallyName])
  const { tally, command, isValid } = useWebTally(tallyName, onRenamed)
  const channels = useChannels() || []
  const [awake, setAwake] = useState(isKeptAwake())
  const defaultTallyConfiguration = useDefaultTallyConfiguration()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isLoading = !tally || !command
  const classes = useStyles()
  const theme = useTheme()
  const handle = useFullScreenHandle()
  // the screen stays on while this page is open (lib/keepAwake.ts), and is let go when it closes
  useEffect(() => () => letSleep(), [])

  if (isValid === false) {
    // removed by the director, or the hub was set up again: say so, and offer to join again
    return <div className={classes.gone} data-testid="page-tally-web-gone">
      <Typography variant="h5" component="h1">This phone is not a tally light any more</Typography>
      <Typography color="textSecondary">The director removed <strong>{tallyName}</strong> from the list. Scan the code again, or join here.</Typography>
      <Button variant="contained" color="primary" size="large" onClick={() => { if (rememberedName() === tallyName) rememberName(null); history.push("/join") }} data-testid="tally-web-rejoin">Join again</Button>
    </div>
  }

  const colorSchemeId = tally?.configuration?.getOperatorColorScheme() || defaultTallyConfiguration?.getOperatorColorScheme() || "default"
  const colorScheme = ColorSchemes.getById(colorSchemeId)
  const classRoot: string[] = [classes.root]
  let dataColor = ""
  let bgColor = theme.palette.grey[800]
  let text = ""
  let showSpinner = false
  if (isLoading) {
    dataColor = "loading"
    text = "Waiting for data"
    showSpinner = true
  } else if (command === "highlight") {
    classRoot.push(classes.highlight)
    dataColor = "highlight"
    text = "The director is looking for you"
  } else if (command === "on-air") {
    bgColor = colorScheme.program.toCss()
    text = "On air"
    dataColor = "program"
  } else if (command === "preview") {
    bgColor = colorScheme.preview.toCss()
    text = "Next"
    dataColor = "preview"
  } else if (command === "release") {
    bgColor = colorScheme.idle.toCss()
    dataColor = "idle"
    text = tally?.isPatched() ? "Ready" : "Waiting for the director to pick your input"
  } else if (command === "unknown") {
    dataColor = "unknown"
    text = "The switcher is not connected"
    showSpinner = true
  } else {
    // if typescript fails here, we forgot a case
    ((a: never) => {})(command)
  }

  const brightness = (tally?.configuration?.getOperatorLightBrightness() || defaultTallyConfiguration?.getOperatorLightBrightness() || 100) / 100
  bgColor = darken(bgColor, 1 - brightness)
  const textColor = theme.palette.getContrastText(bgColor)

  const enterFullScreen = () => {
    keepAwake()
    setAwake(true)
    handle.enter()
  }
  const exitFullScreen = () => {
    handle.exit()
  }
  // after a reload the browser lets the screen sleep again until someone taps
  const wake = () => {
    if (awake) return
    keepAwake()
    fullScreen()
    setAwake(true)
  }

  return <FullScreen handle={handle}>
    <div data-testid="page-tally-web" data-color={dataColor} data-brightness={brightness} className={classRoot.join(" ")} style={{backgroundColor: bgColor, color: textColor}} onClick={wake}>
      { showSpinner ? (
        <CircularProgress className={classes.spinner} color="inherit" size="min(30vw, 30vh)" />
      ) : (<>
        <Typography component="div" variant="h1" className={classes.name} data-testid="tally-web-name">{(tally && tally.name) || ""}</Typography>
        {tally?.isPatched() && <Typography component="div" className={classes.input} data-testid="tally-web-input">{channelLabel(tally.channelId, channels)}</Typography>}
        <IconButton data-testid="tally-settings-link" className={classes.settingsIcon} aria-label="Show settings" onClick={() => setSettingsOpen(true)}>
          <TuneIcon />
        </IconButton>
        <TallySettings tally={tally} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        { handle.active ? (
          <IconButton className={classes.fullscreenIcon} aria-label="Exit fullscreen" onClick={exitFullScreen}>
            <FullscreenExitIcon />
          </IconButton>
        ) : (
          <IconButton className={classes.fullscreenIcon} aria-label="Enter fullscreen" onClick={enterFullScreen}>
            <FullscreenIcon />
          </IconButton>
        )}
      </>)}
      { text && <Typography component="div" className={showSpinner ? undefined : text.length > 12 ? classes.stateNote : classes.stateWord} data-testid="tally-web-state">{text}</Typography>}
      { !showSpinner && !awake && <div className={classes.hint} data-testid="tally-web-wake">Tap to keep the screen on</div> }
    </div>
  </FullScreen>
}

export default withRouter(WebTallyPage)
