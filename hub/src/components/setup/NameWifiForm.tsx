import { Button, Dialog, DialogActions, DialogContent, DialogTitle, makeStyles, TextField, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import React, { useEffect, useState } from 'react'
import { HardwareProfile, writeProfileToIni } from '../../flasher/HardwareProfile'
import { TallySettingsIniProgressType } from '../../flasher/NodeMcuConnector'
import TallyDevice from '../../flasher/TallyDevice'
import TallySettingsIni from '../../flasher/TallySettingsIni'
import { socket } from '../../hooks/useSocket'
import useTallies from '../../hooks/useTallies'
import TallySettingsIniProgress from '../flasher/TallySettingsProgress'

const useStyles = makeStyles(theme => ({
  block: {
    marginBottom: theme.spacing(2),
  },
  textField: {
    display: "block",
    marginBottom: theme.spacing(2),
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: theme.spacing(1),
  },
}))

const maxNameLength = 26 // same as "tally.name" in the tally

function validateName(name: string, takenNames: string[]): string {
  if (name.trim() === "") return "Give the light a name, e.g. the camera it sits on"
  if (name.length > maxNameLength) return `At most ${maxNameLength} characters`
  if (takenNames.includes(name)) return "Another light already has this name"
  return ""
}

type Props = {
  device: TallyDevice
  profile: HardwareProfile
  rememberedSsid?: string
  onSaved: (name: string, ssid: string) => void
}

// Name, Wi-Fi and the hardware profile go to the light; no hub address, it finds the hub itself.
function NameWifiForm({ device, profile, rememberedSsid, onSaved }: Props) {
  const classes = useStyles()
  const tallies = useTallies()
  const [name, setName] = useState("")
  const [ssid, setSsid] = useState(rememberedSsid || "")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<TallySettingsIniProgressType>(undefined)

  // take over whatever the light already has, so re-doing one keeps its name
  useEffect(() => {
    const ini = device?.tallySettings
    if (ini) {
      if (ini.getTallyName()) setName(ini.getTallyName())
      if (ini.getStationSsid()) setSsid(ini.getStationSsid())
      if (ini.getStationPassword()) setPassword(ini.getStationPassword())
    }
  }, [device])

  const takenNames = (tallies || []).map(t => t.name).filter(n => n !== device?.tallySettings?.getTallyName())
  const nameError = validateName(name, takenNames)
  const ssidError = ssid.trim() === "" ? "The Wi-Fi the light should join" : ""
  const canSave = !nameError && !ssidError && !busy

  const save = () => {
    const ini = device.tallySettings?.clone() || new TallySettingsIni()
    ini.setTallyName(name.trim())
    ini.setStationSsid(ssid.trim())
    ini.setStationPassword(password)
    ini.removeSetting("hub.ip") // the light finds the hub on its own
    writeProfileToIni(ini, profile)

    setProgress(undefined)
    setBusy(true)
    const onProgress = (p: TallySettingsIniProgressType) => {
      setProgress({ ...p })
      if (p.allDone || p.error) {
        socket.off('flasher.settingsIni.progress', onProgress)
        setBusy(false)
        if (!p.error) {
          // done: the next step takes over, no dialog to dismiss
          setProgress(undefined)
          onSaved(name.trim(), ssid.trim())
        }
      }
    }
    socket.on('flasher.settingsIni.progress', onProgress)
    socket.emit('flasher.settingsIni', device.path, ini.toString())
  }

  return <div data-testid="name-wifi-form">
    <Dialog open={busy || !!progress}>
      <DialogTitle>Saving to the light</DialogTitle>
      <DialogContent>
        {progress && <TallySettingsIniProgress progress={progress} />}
        {progress?.error && <Alert severity="error" className={classes.block}>That did not work. Unplug the light, plug it back in and try again.</Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={() => setProgress(undefined)} data-testid="setup-light-close">Close</Button>
      </DialogActions>
    </Dialog>

    <TextField label="Name" placeholder="Cam 1" className={classes.textField} value={name} error={!!nameError && name !== ""} helperText={nameError || "Shown on the hub page. The camera's name works well."} disabled={busy} onChange={e => setName(e.target.value)} data-testid="setup-light-name" inputProps={{ maxLength: maxNameLength }} />
    <TextField label="Wi-Fi name" className={classes.textField} value={ssid} error={!!ssidError && ssid !== ""} helperText={ssidError || "The same Wi-Fi this computer uses."} disabled={busy} onChange={e => setSsid(e.target.value)} data-testid="setup-light-ssid" />
    <TextField label="Wi-Fi password" type="password" className={classes.textField} value={password} helperText="Leave empty for an open network." disabled={busy} onChange={e => setPassword(e.target.value)} data-testid="setup-light-password" />
    <Typography paragraph color="textSecondary">
      No addresses to type in: the light finds this hub on its own once it is on the Wi-Fi. The LED wiring from the test is saved with it.
    </Typography>
    <div className={classes.actions}>
      <Button color="primary" variant="contained" disabled={!canSave} onClick={save} data-testid="setup-light-save">Save to the light</Button>
    </div>
  </div>
}

export default NameWifiForm
