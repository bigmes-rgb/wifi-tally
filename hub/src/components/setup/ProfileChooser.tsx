import { Button, Checkbox, FormControl, FormControlLabel, FormLabel, makeStyles, Select, TextField, Typography } from '@material-ui/core'
import PrintIcon from '@material-ui/icons/Print'
import { Alert } from '@material-ui/lab'
import React, { useRef } from 'react'
import { HardwareProfile, LightProfile, MAX_PIXELS, Role } from '../../flasher/HardwareProfile'
import { MA_PER_PIXEL_ONE_COLOUR, wiringPlan } from '../../flasher/WiringPlan'
import WiringDiagram from './WiringDiagram'

const useStyles = makeStyles(theme => ({
  row: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(2),
    alignItems: "flex-end",
    marginBottom: theme.spacing(2),
  },
  select: {
    minWidth: 260,
  },
  pixels: {
    width: 90,
  },
  table: {
    borderCollapse: "collapse",
    marginBottom: theme.spacing(2),
    "& th, & td": {
      textAlign: "left",
      padding: theme.spacing(0.5, 2, 0.5, 0),
      borderBottom: "1px solid " + theme.palette.grey[700],
    },
    "& td:first-child": {
      fontFamily: "monospace",
      fontSize: "1.1em",
      fontWeight: "bold",
    },
  },
  diagram: {
    marginBottom: theme.spacing(2),
  },
  swatch: {
    display: "inline-block",
    width: 22,
    height: 6,
    borderRadius: 3,
    verticalAlign: "middle",
  },
}))

type Choice = "rgb-anode" | "rgb-cathode" | "ws2812" | "none"
const toChoice = (p: LightProfile): Choice => (p.kind === "none" ? "none" : p.kind === "ws2812" ? "ws2812" : p.polarity === "cathode" ? "rgb-cathode" : "rgb-anode")
const fromChoice = (p: LightProfile, c: Choice): LightProfile => ({
  ...p,
  kind: c === "none" ? "none" : c === "ws2812" ? "ws2812" : "rgb",
  polarity: c === "rgb-cathode" ? "cathode" : "anode",
})

const label: Record<Choice, string> = {
  "rgb-anode": "RGB LED or strip, common + (common anode)",
  "rgb-cathode": "RGB LED, common − (common cathode)",
  "ws2812": "NeoPixel / WS2812 strip",
  "none": "Nothing",
}

// Opens the diagram and the pin table on their own in a new window and prints them, for the bench.
function printWiring(node: HTMLElement | null) {
  const win = node && window.open("", "_blank", "width=900,height=700")
  if (!win || !node) return
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>vTally wiring</title><style>
    body { font-family: sans-serif; margin: 24px; color: #212121; }
    table { border-collapse: collapse; margin-top: 16px; }
    th, td { text-align: left; padding: 4px 16px 4px 0; border-bottom: 1px solid #ccc; }
    td:nth-child(2) { font-family: monospace; font-weight: bold; }
    svg { max-width: 100%; }
  </style></head><body>${node.innerHTML}</body></html>`)
  win.document.close()
  win.focus()
  win.print()
}

type Props = {
  profile: HardwareProfile
  onChange: (profile: HardwareProfile) => void
  checked: boolean
  onChecked: (checked: boolean) => void
}

// Step 1 of building a light: say what is soldered on, get the pin table for exactly that.
function ProfileChooser({ profile, onChange, checked, onChecked }: Props) {
  const classes = useStyles()

  const update = (role: Role, light: LightProfile) => onChange({ ...profile, [role]: light })

  const roleEditor = (role: Role, title: string, help: string, allowNone: boolean) => {
    const light = profile[role]
    return <div className={classes.row} data-testid={`profile-${role}`}>
      <FormControl className={classes.select}>
        <FormLabel>{title}</FormLabel>
        <Select native value={toChoice(light)} onChange={e => update(role, fromChoice(light, e.target.value as Choice))} data-testid={`profile-${role}-kind`}>
          {(["rgb-anode", "rgb-cathode", "ws2812"] as Choice[]).map(c => <option key={c} value={c}>{label[c]}</option>)}
          {allowNone && <option value="none">{label.none}</option>}
        </Select>
        <Typography variant="caption" color="textSecondary">{help}</Typography>
      </FormControl>
      {light.kind === "ws2812" && <TextField className={classes.pixels} label="Pixels" type="number" inputProps={{ min: 1, max: MAX_PIXELS }} value={light.pixels}
        onChange={e => update(role, { ...light, pixels: Math.max(1, Math.min(MAX_PIXELS, parseInt(e.target.value, 10) || 1)) })} data-testid={`profile-${role}-pixels`} />}
    </div>
  }

  const printRef = useRef<HTMLDivElement>(null)
  const plan = wiringPlan(profile)
  const plainLeds = (profile.operator.kind === "rgb" ? 1 : 0) + (profile.stage.kind === "rgb" ? 1 : 0)
  const hasStrip = plan.firstStrip !== null
  const stripMa = plan.totalPixels * MA_PER_PIXEL_ONE_COLOUR

  return <>
    {roleEditor("operator", "Operator light (faces the camera operator)", "Shows live, preview and the hub's status blinks.", false)}
    {roleEditor("stage", "Stage light (faces the people on stage)", "Optional. Shows live and preview only.", true)}

    <Typography variant="h4" paragraph>Wire it like this</Typography>
    <div ref={printRef}>
      <div className={classes.diagram}><WiringDiagram profile={profile} /></div>
      <table className={classes.table} data-testid="wiring-table">
        <thead><tr><th>Wire</th><th>From</th><th>goes to</th></tr></thead>
        <tbody>{plan.wires.map((w, i) => <tr key={i}>
          <td><span className={classes.swatch} style={{ background: w.color }} /></td>
          <td>{w.pinText}</td>
          <td>{w.role === "operator" ? "Operator" : "Stage"} light: {w.toText}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={() => printWiring(printRef.current)} style={{ marginBottom: 16 }} data-testid="wiring-print">
      Print diagram and table
    </Button>
    <Alert severity="warning" style={{ marginBottom: 16 }} data-testid="wiring-notes">
      {plainLeds > 0 && <>Plain RGB LEDs: no more than 5 LEDs per board in total, they draw their current through the board. A 220 Ω resistor in each colour wire protects the board and the LED. </>}
      {hasStrip && <>NeoPixel strips: solder to the end the printed arrows point away from (DIN). {plan.stageChained && <>The stage strip takes its data from the operator strip's far end (DO), not from the board. </>}Up to {MAX_PIXELS} pixels per light. <strong>The strip must have power whenever the board does:</strong> an unpowered strip holds D4 low and the board will not start. </>}
      {hasStrip
        ? <>Power the board from a phone charger of at least 1 A: {plan.totalPixels} pixel{plan.totalPixels === 1 ? "" : "s"} at full red draw about {stripMa} mA. A camera's or laptop's USB port may not be enough.</>
        : <>Power the board from USB; a phone charger or a camera's USB port is fine.</>}
    </Alert>
    <FormControlLabel
      control={<Checkbox checked={checked} onChange={e => onChecked(e.target.checked)} color="primary" data-testid="wiring-checked" />}
      label="I have soldered it like the table says and checked for solder bridges between neighbouring pins."
    />
  </>
}

export default ProfileChooser
