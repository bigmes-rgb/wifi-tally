import { Checkbox, FormControl, FormControlLabel, FormLabel, makeStyles, Select, TextField, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import React from 'react'
import { HardwareProfile, LightProfile, MAX_PIXELS, PINS, Role } from '../../flasher/HardwareProfile'

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
  image: {
    maxWidth: "100%",
    borderRadius: 4,
    marginBottom: theme.spacing(2),
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

// what each role needs on the board, for the chosen hardware
function wiringRows(role: Role, p: LightProfile): [string, string][] {
  if (p.kind === "none") return []
  if (p.kind === "ws2812") {
    return [
      [PINS.ws2812, `strip DIN (data in). ${role === "operator" ? "The first" : "After the operator pixels, the next"} ${p.pixels} pixel${p.pixels === 1 ? "" : "s"} are the ${role} light.`],
      ["VIN (5V)", "strip + (5 V). Not 3V3."],
      ["GND", "strip −"],
    ]
  }
  const pins = PINS[role]
  return [
    [pins.R, "LED red leg"],
    [pins.G, "LED green leg"],
    [pins.B, "LED blue leg"],
    [p.polarity === "anode" ? "3V3" : "GND", p.polarity === "anode" ? "LED common + (the longest leg, or the + of a 4-pin strip piece)" : "LED common − (the longest leg)"],
  ]
}

function pictureFor(profile: HardwareProfile): string | null {
  const op = profile.operator.kind, st = profile.stage.kind
  if (op === "ws2812" && st !== "rgb") return "/wiring/ws2812.png"
  if (op === "rgb" && st === "ws2812") return "/wiring/ws2812-rgb.png"
  if (op === "rgb" && st === "rgb") return "/wiring/rgb-operator-stage.png"
  if (op === "rgb") return "/wiring/rgb-operator.png"
  return null
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

  const rows = [...wiringRows("operator", profile.operator), ...wiringRows("stage", profile.stage)]
  const picture = pictureFor(profile)
  const plainLeds = (profile.operator.kind === "rgb" ? 1 : 0) + (profile.stage.kind === "rgb" ? 1 : 0)

  return <>
    {roleEditor("operator", "Operator light (faces the camera operator)", "Shows live, preview and the hub's status blinks.", false)}
    {roleEditor("stage", "Stage light (faces the people on stage)", "Optional. Shows live and preview only.", true)}

    <Typography variant="h4" paragraph>Wire it like this</Typography>
    {picture && <img src={picture} alt="wiring diagram" className={classes.image} />}
    <table className={classes.table} data-testid="wiring-table">
      <thead><tr><th>Board pin</th><th>goes to</th></tr></thead>
      <tbody>{rows.map(([pin, what], i) => <tr key={i}><td>{pin}</td><td>{what}</td></tr>)}</tbody>
    </table>
    <Alert severity="warning" style={{ marginBottom: 16 }}>
      {plainLeds > 0 && <>Plain RGB LEDs: no more than 5 LEDs per board in total, they draw their current through the board. </>}
      {(profile.operator.kind === "ws2812" || profile.stage.kind === "ws2812") && <>NeoPixel strips: operator pixels come first on the strip, then the stage pixels, up to {MAX_PIXELS} each. Power them from VIN, not 3V3. </>}
      Power the board from USB (a phone charger or a camera's USB port is fine; it needs well under 200 mA).
    </Alert>
    <FormControlLabel
      control={<Checkbox checked={checked} onChange={e => onChecked(e.target.checked)} color="primary" data-testid="wiring-checked" />}
      label="I have soldered it like the table says and checked for solder bridges between neighbouring pins."
    />
  </>
}

export default ProfileChooser
