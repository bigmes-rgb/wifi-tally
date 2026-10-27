import { Button, makeStyles, Typography } from '@material-ui/core'
import React, { useEffect, useRef, useState } from 'react'
import { socket } from '../../hooks/useSocket'

const useStyles = makeStyles(theme => ({
  block: { marginBottom: theme.spacing(2) },
  output: {
    maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: "0.8em",
    background: theme.palette.background.default, padding: theme.spacing(1), borderRadius: 4,
  },
}))

type Props = {
  path?: string // where the light is plugged in; without it there is nothing to watch
}

// For a finished light that drops off the hub: shows everything it prints over USB while it runs (why it
// started, Wi-Fi drops, crashes), and the hub writes the same lines into its log file. The light is not
// restarted, and nothing is sent to it: what it does on its own is the point.
function WatchLight({ path }: Props) {
  const classes = useStyles()
  const [watching, setWatching] = useState(false)
  const [text, setText] = useState("")
  const textRef = useRef("")
  const watchingRef = useRef(false)
  const outputRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const onText = (chunk: string) => { textRef.current += chunk; setText(textRef.current) }
    const onEnd = () => { watchingRef.current = false; setWatching(false) }
    socket.on('flasher.light.watch.text', onText)
    socket.on('flasher.light.watch.end', onEnd)
    return () => {
      socket.off('flasher.light.watch.text', onText)
      socket.off('flasher.light.watch.end', onEnd)
      // leaving the step frees the USB port
      if (watchingRef.current) socket.emit('flasher.light.watch.stop')
    }
  }, [])

  // the newest line stays in view
  useEffect(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight }, [text])

  if (!path) return null

  const start = () => {
    textRef.current = ""
    setText("")
    watchingRef.current = true
    setWatching(true)
    socket.emit('flasher.light.watch.start', path)
  }
  const stop = () => socket.emit('flasher.light.watch.stop')

  return <div data-testid="watch-light" className={classes.block}>
    <Typography variant="subtitle2">A finished light that keeps dropping off the hub?</Typography>
    <Typography variant="body2" color="textSecondary" paragraph>
      Leave it plugged in here and watch what it prints: why it started, Wi-Fi drops, crashes. The same lines go
      into the hub's log file, for when you ask for help. The watch runs for ten minutes at most and does not
      restart the light. Other work with the board waits until you stop it.
    </Typography>
    {watching
      ? <Button variant="outlined" size="small" onClick={stop} className={classes.block} data-testid="watch-light-stop">Stop watching</Button>
      : <Button variant="outlined" size="small" onClick={start} className={classes.block} data-testid="watch-light-start">Watch what the light says</Button>}
    {(watching || text) && <pre ref={outputRef} className={classes.output} data-testid="watch-light-output">{text || "Nothing yet. The light prints a line when something happens; leave it be."}</pre>}
  </div>
}

export default WatchLight
