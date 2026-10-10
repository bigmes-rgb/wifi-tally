import { Button, makeStyles, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import React, { useEffect, useRef, useState } from 'react'
import { BOOT_ADVICE, bootVerdict, parseBootMessage } from '../../flasher/BootMessage'
import { socket } from '../../hooks/useSocket'

const useStyles = makeStyles(theme => ({
  block: { marginBottom: theme.spacing(2) },
  output: {
    maxHeight: 180, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: "0.8em",
    background: theme.palette.background.default, padding: theme.spacing(1), borderRadius: 4,
  },
}))

type Props = { path: string, onDone?: () => void }

// Reads the ESP8266's own start-up message while the person presses RST, and says what it means.
// Tells "the firmware does not start" apart from "the chip never tries to start it" (a start-up
// pin held the wrong way by something soldered to it).
function BootMessageReader({ path, onDone }: Props) {
  const classes = useStyles()
  const [state, setState] = useState<"idle" | "listening" | "done">("idle")
  const [text, setText] = useState("")
  const textRef = useRef("")

  useEffect(() => {
    const onText = (chunk: string) => { textRef.current += chunk; setText(textRef.current) }
    const onEnd = () => { setState("done"); if (onDone) onDone() }
    socket.on('flasher.bootmessage.text', onText)
    socket.on('flasher.bootmessage.end', onEnd)
    return () => {
      socket.off('flasher.bootmessage.text', onText)
      socket.off('flasher.bootmessage.end', onEnd)
      socket.emit('flasher.watch.stop')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    textRef.current = ""
    setText("")
    setState("listening")
    socket.emit('flasher.bootmessage.start', path)
  }

  const verdict = bootVerdict(parseBootMessage(text))
  return <div className={classes.block} data-testid="boot-reader">
    {state === "idle" && <Button size="small" variant="outlined" onClick={start} data-testid="boot-read">Read the start-up message</Button>}
    {state === "listening" && <Alert severity="info" className={classes.block} data-testid="boot-listening">
      <strong>Press the RST button on the board now</strong>, once, without holding FLASH. The hub is listening for the chip's start-up message.
    </Alert>}
    {state === "done" && <>
      <Alert severity={verdict === "normal" ? "info" : "warning"} className={classes.block} data-testid={`boot-verdict-${verdict}`}>{BOOT_ADVICE[verdict]}</Alert>
      {text && <details className={classes.block}>
        <summary><Typography variant="caption" color="textSecondary" component="span">The start-up message</Typography></summary>
        <pre className={classes.output}>{text}</pre>
      </details>}
      <Button size="small" variant="outlined" onClick={start}>Read it again</Button>
    </>}
  </div>
}

export default BootMessageReader
