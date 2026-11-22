import { Button, ButtonProps, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Link, makeStyles, Tooltip, Typography, useMediaQuery, useTheme } from '@material-ui/core'
import AddToHomeScreenIcon from '@material-ui/icons/AddToHomeScreen'
import CheckCircleIcon from '@material-ui/icons/CheckCircle'
import qrcode from 'qrcode-generator'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import useHubInfo from '../hooks/useHubInfo'
import useTallies from '../hooks/useTallies'

const useStyles = makeStyles(theme => ({
  button: { textTransform: "none", whiteSpace: "nowrap" },
  icon: { marginRight: theme.spacing(1) },
  body: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  qr: { width: "min(240px, 70vw)", height: "min(240px, 70vw)", borderRadius: 8, display: "block" },
  url: { fontFamily: "monospace", fontSize: "0.85rem", marginTop: theme.spacing(1), userSelect: "all", wordBreak: "break-all" },
  addresses: { display: "flex", flexWrap: "wrap", gap: theme.spacing(0.5), justifyContent: "center", marginTop: theme.spacing(1) },
  steps: { textAlign: "left", margin: theme.spacing(2, 0, 0), paddingLeft: theme.spacing(2.5), "& li": { marginBottom: theme.spacing(0.5) } },
  joined: { width: "100%", marginTop: theme.spacing(2), textAlign: "left" },
  joinedLine: { display: "flex", alignItems: "center", gap: theme.spacing(1), color: theme.palette.success.main },
  waiting: { color: theme.palette.text.secondary, fontStyle: "italic" },
  manual: { marginTop: theme.spacing(1.5) },
}))

// A QR code, drawn as one SVG path: sharp at any size, and readable from a phone held at arm's length
export function QrCode({ text, className }: { text: string, className?: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M")
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount()
    let d = ""
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`
    // four modules of white all round: the quiet zone a camera needs to find the code
    return { size: n + 8, path: d }
  }, [text])
  return <svg viewBox={`0 0 ${size} ${size}`} className={className} shapeRendering="crispEdges" role="img" aria-label={`QR code for ${text}`} data-testid="add-phone-qr" data-text={text}>
    <rect width={size} height={size} fill="#fff" />
    <path d={path} fill="#000" />
  </svg>
}

// the address a phone opens: this hub on the church network (not "localhost", which a phone cannot reach)
export function joinUrl(address: string, port: string) {
  return `http://${address}${port && port !== "80" ? `:${port}` : ""}/join`
}

type AddPhoneDialogProps = { open: boolean, onClose: () => void, onManual?: () => void }

// The director shows this; a volunteer scans it, types the camera's name, and their phone is a tally light. The
// phones that join while it is open are listed, so the director sees it worked without leaving the dialog.
export function AddPhoneDialog({ open, onClose, onManual }: AddPhoneDialogProps) {
  const classes = useStyles()
  const narrow = useMediaQuery(useTheme().breakpoints.down('xs'))
  const hub = useHubInfo()
  const tallies = useTallies()
  const addresses = hub?.addresses || []
  const [chosen, setChosen] = useState<string | null>(null)
  const address = chosen && addresses.includes(chosen) ? chosen : addresses[0]
  const url = address ? joinUrl(address, window.location.port) : null

  // the phones there were when it opened; any other one joined since
  const before = useRef<Set<string> | null>(null)
  const phones = (tallies || []).filter(t => t.isWebTally())
  useEffect(() => {
    if (open && tallies && before.current === null) before.current = new Set(phones.map(t => t.name))
    if (!open) before.current = null
  }, [open, tallies, phones])
  const joined = before.current ? phones.filter(t => !before.current!.has(t.name)) : []

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" fullScreen={narrow} data-testid="add-phone-dialog">
    <DialogTitle>Add a phone as a tally light</DialogTitle>
    <DialogContent className={classes.body}>
      {url
        ? <>
          <QrCode text={url} className={classes.qr} />
          <Typography className={classes.url} data-testid="add-phone-url">{url}</Typography>
          {addresses.length > 1 && <div className={classes.addresses}>
            {addresses.map(a => <Chip key={a} size="small" label={a} color={a === address ? "primary" : "default"} onClick={() => setChosen(a)} data-testid={`add-phone-address-${a}`} />)}
          </div>}
        </>
        : <Typography color="error" data-testid="add-phone-no-network">This computer is not on a network, so no phone can reach it. Connect it to the church network first.</Typography>}
      <ol className={classes.steps}>
        <li><Typography variant="body2">On the phone, join the church Wi-Fi: the same network as this computer.</Typography></li>
        <li><Typography variant="body2">Open the camera, point it at the code, and tap the link that appears.</Typography></li>
        <li><Typography variant="body2">Type the camera's name and tap <strong>Start</strong>. The phone turns red when that camera is on air.</Typography></li>
      </ol>
      <div className={classes.joined} data-testid="add-phone-joined">
        {joined.length === 0
          ? <Typography variant="body2" className={classes.waiting}>Waiting for a phone to join…</Typography>
          : joined.map(t => <div key={t.name} className={classes.joinedLine} data-testid={`add-phone-joined-${t.name}`}>
            <CheckCircleIcon fontSize="small" />
            <Typography variant="body2"><strong>{t.name}</strong> joined{t.isPatched() ? "" : ". Pick its input from its ⋮ in the list."}</Typography>
          </div>)}
      </div>
      {onManual && <Link component="button" variant="body2" className={classes.manual} onClick={onManual} data-testid="add-phone-manual">Or add one by name, for a computer or a tablet</Link>}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} color="primary" data-testid="add-phone-close">Done</Button>
    </DialogActions>
  </Dialog>
}

type AddPhoneButtonProps = ButtonProps & { compact?: boolean }

// "Add a phone": in the Tallies page's toolbar, and as an icon in the OBS dock's top bar (compact)
export function AddPhoneButton({ compact, className, ...buttonProps }: AddPhoneButtonProps) {
  const classes = useStyles()
  const [open, setOpen] = useState(false)
  return <>
    {compact
      ? <Tooltip title="Add a phone as a tally light"><Button {...buttonProps} className={[className, classes.button].join(" ")} onClick={() => setOpen(true)} aria-label="Add a phone" data-testid="add-phone"><AddToHomeScreenIcon fontSize="small" /></Button></Tooltip>
      : <Button {...buttonProps} className={[className, classes.button].join(" ")} onClick={() => setOpen(true)} data-testid="add-phone">
        <AddToHomeScreenIcon className={classes.icon} fontSize="small" /> Add a phone
      </Button>}
    <AddPhoneDialog open={open} onClose={() => setOpen(false)} />
  </>
}

export default AddPhoneButton
