import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItem, ListItemSecondaryAction, ListItemText, makeStyles, TextField, Typography } from '@material-ui/core'
import { Alert, AlertTitle } from '@material-ui/lab'
import RefreshIcon from '@material-ui/icons/Refresh'
import WbIncandescentIcon from '@material-ui/icons/WbIncandescent'
import React, { useEffect, useState } from 'react'
import ChannelSelector from '../ChannelSelector'
import { UdpTally } from '../../domain/Tally'
import { TallyProgramProgressType, TallySettingsIniProgressType } from '../../flasher/NodeMcuConnector'
import TallySettingsIni from '../../flasher/TallySettingsIni'
import useChannels from '../../hooks/useChannels'
import { socket } from '../../hooks/useSocket'
import useTallies from '../../hooks/useTallies'
import useTallyDevice from '../../hooks/useTallyDevice'
import Help from '../flasher/Help'
import ProgramProgress from '../flasher/ProgramProgress'
import TallySettingsIniProgress from '../flasher/TallySettingsProgress'
import Spinner from '../layout/Spinner'

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
  list: {
    marginBottom: theme.spacing(2),
  },
}))

const maxNameLength = 26 // same as "tally.name" in the tally

function validateName(name: string, takenNames: string[]): string {
  if (name.trim() === "") return "Give the light a name, e.g. the camera it sits on"
  if (name.length > maxNameLength) return `At most ${maxNameLength} characters`
  if (takenNames.includes(name)) return "Another light already has this name"
  return ""
}

// The light that was just set up, and every other hardware tally that is on the network.
function ConnectedLights({ justAdded }: { justAdded?: string }) {
  const tallies = useTallies()
  const channels = useChannels()
  const classes = useStyles()
  const lights = (tallies || []).filter(tally => tally.isUdpTally()) as UdpTally[]

  if (lights.length === 0) {
    return <Typography paragraph color="textSecondary">No light has reported to the hub yet.</Typography>
  }

  return <List dense className={classes.list} data-testid="setup-lights-list">
    {lights.sort((a, b) => a.name.localeCompare(b.name)).map(tally => (
      <ListItem key={tally.name} divider selected={tally.name === justAdded}>
        <ListItemText
          primary={tally.name}
          secondary={tally.isConnected() ? "connected" : tally.isMissing() ? "not answering" : "offline"}
        />
        <ChannelSelector channels={channels} value={tally.channelId} onChange={channelId => socket.emit('tally.patch', tally.name, tally.type, channelId)} />
        <ListItemSecondaryAction>
          <IconButton edge="end" aria-label="identify" title="Blink this light so you can find it" disabled={!tally.isConnected()} onClick={() => socket.emit('tally.highlight', tally.name, tally.type)}>
            <WbIncandescentIcon />
          </IconButton>
        </ListItemSecondaryAction>
      </ListItem>
    ))}
  </List>
}

type Props = {
  // the Wi-Fi name the last light was given, so the next one starts with it
  rememberedSsid?: string
  onSsidChange?: (ssid: string) => void
}

// One light, start to finish: plug it in, put the software on it, give it a name and the Wi-Fi.
function AddTallyStep({ rememberedSsid, onSsidChange }: Props) {
  const classes = useStyles()
  const [refresh, setRefresh] = useState(1)
  const device = useTallyDevice(refresh)
  const tallies = useTallies()

  const [name, setName] = useState("")
  const [ssid, setSsid] = useState(rememberedSsid || "")
  const [password, setPassword] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [programProgress, setProgramProgress] = useState<TallyProgramProgressType>(undefined)
  const [settingsProgress, setSettingsProgress] = useState<TallySettingsIniProgressType>(undefined)
  const [justAdded, setJustAdded] = useState<string>(undefined)

  // take over whatever the light already has, so re-doing one keeps its name
  useEffect(() => {
    const ini = device?.tallySettings
    if (ini) {
      if (ini.getTallyName()) setName(ini.getTallyName())
      if (ini.getStationSsid()) setSsid(ini.getStationSsid())
      if (ini.getStationPassword()) setPassword(ini.getStationPassword())
    }
  }, [device])

  const reload = () => setRefresh(refresh + 1)

  const takenNames = (tallies || []).map(t => t.name).filter(n => n !== device?.tallySettings?.getTallyName())
  const nameError = validateName(name, takenNames)
  const ssidError = ssid.trim() === "" ? "The Wi-Fi the light should join" : ""
  const canSave = !nameError && !ssidError && !busy

  const isLoading = device === undefined
  const hasLua = device?.nodeMcuVersion !== undefined
  const needsSoftware = device?.update === "updateable"
  const softwareUnavailable = device?.update === "not-available"

  const installSoftware = () => {
    setProgramProgress(undefined)
    setSettingsProgress(undefined)
    setBusy(true)
    setDialogOpen(true)
    const onProgress = (progress: TallyProgramProgressType) => {
      setProgramProgress({ ...progress })
      if (progress.allDone || progress.error) {
        socket.off('flasher.program.progress', onProgress)
        setBusy(false)
        if (!progress.error) { setDialogOpen(false); reload() }
      }
    }
    socket.on('flasher.program.progress', onProgress)
    socket.emit('flasher.program', device.path)
  }

  const saveSettings = () => {
    const ini = device.tallySettings?.clone() || new TallySettingsIni()
    ini.setTallyName(name.trim())
    ini.setStationSsid(ssid.trim())
    ini.setStationPassword(password)
    // no hub.ip: the light finds the hub on its own
    const lines = ini.toString().split("\n").filter(line => !line.match(/^hub\.ip\s*=/))
    const cleaned = new TallySettingsIni(lines.join("\n"))

    setProgramProgress(undefined)
    setSettingsProgress(undefined)
    setBusy(true)
    setDialogOpen(true)
    const onProgress = (progress: TallySettingsIniProgressType) => {
      setSettingsProgress({ ...progress })
      if (progress.allDone || progress.error) {
        socket.off('flasher.settingsIni.progress', onProgress)
        setBusy(false)
        if (!progress.error) {
          setJustAdded(name.trim())
          if (onSsidChange) onSsidChange(ssid.trim())
        }
      }
    }
    socket.on('flasher.settingsIni.progress', onProgress)
    socket.emit('flasher.settingsIni', device.path, cleaned.toString())
  }

  const startOver = () => {
    setJustAdded(undefined)
    setName("")
    setPassword("")
    setDialogOpen(false)
    reload()
  }

  return <div data-testid="setup-lights">
    <Dialog open={dialogOpen} disableBackdropClick={busy} disableEscapeKeyDown={busy}>
      <DialogTitle>{programProgress ? "Installing the tally software" : "Saving to the light"}</DialogTitle>
      <DialogContent>
        {programProgress && <ProgramProgress progress={programProgress} />}
        {settingsProgress && <TallySettingsIniProgress progress={settingsProgress} />}
        {settingsProgress?.allDone && <Alert severity="success" className={classes.block} data-testid="setup-light-done">
          <AlertTitle>{name.trim()} is ready</AlertTitle>
          Unplug it from this computer and power it where it belongs. It appears in the list as soon as it joins the Wi-Fi.
        </Alert>}
        {(programProgress?.error || settingsProgress?.error) && <Alert severity="error" className={classes.block}>
          That did not work. Unplug the light, plug it back in and try again.
        </Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={() => setDialogOpen(false)}>Close</Button>
        {settingsProgress?.allDone && <Button color="primary" variant="contained" onClick={startOver} data-testid="setup-light-another">Add another light</Button>}
      </DialogActions>
    </Dialog>

    <Typography variant="h4" paragraph>1. Plug the light into this computer</Typography>
    <Typography paragraph color="textSecondary">
      Use a USB <em>data</em> cable, into the computer the hub runs on. A brand-new board straight from the box is fine.
    </Typography>
    <div className={classes.block}>
      {isLoading ? <Spinner /> : (
        !hasLua ? <Help tallyDevice={device} onReload={reload} /> : (
          <Alert severity="success" action={<Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={reload} disabled={busy}>Check again</Button>}>
            Found a light on {device.path}{device.tallySettings?.getTallyName() ? <>, currently named <strong>{device.tallySettings.getTallyName()}</strong></> : ", not set up yet"}.
          </Alert>
        )
      )}
    </div>

    {hasLua && <>
      <Typography variant="h4" paragraph>2. Tally software</Typography>
      <div className={classes.block}>
        {needsSoftware && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={installSoftware} disabled={busy} data-testid="setup-light-install">Install now</Button>}>
          This light does not have the current tally software. Installing takes about a minute.
        </Alert>}
        {device.update === "up-to-date" && <Alert severity="success">The tally software on this light is current.</Alert>}
        {softwareUnavailable && <Alert severity="info">This hub was started without the tally software bundle, so it cannot install it. The light keeps whatever it has.</Alert>}
      </div>
    </>}

    {hasLua && !needsSoftware && <>
      <Typography variant="h4" paragraph>3. Name and Wi-Fi</Typography>
      <TextField label="Name" placeholder="Cam 1" className={classes.textField} value={name} error={!!nameError && name !== ""} helperText={nameError || "Shown on the hub page. The camera's name works well."} disabled={busy} onChange={e => setName(e.target.value)} data-testid="setup-light-name" inputProps={{ maxLength: maxNameLength }} />
      <TextField label="Wi-Fi name" className={classes.textField} value={ssid} error={!!ssidError && ssid !== ""} helperText={ssidError || "The same Wi-Fi this computer uses."} disabled={busy} onChange={e => setSsid(e.target.value)} data-testid="setup-light-ssid" />
      <TextField label="Wi-Fi password" type="password" className={classes.textField} value={password} helperText="Leave empty for an open network." disabled={busy} onChange={e => setPassword(e.target.value)} data-testid="setup-light-password" />
      <Typography paragraph color="textSecondary">
        No addresses to type in: the light finds this hub on its own once it is on the Wi-Fi.
      </Typography>
      <div className={classes.actions}>
        <Button color="primary" variant="contained" disabled={!canSave} onClick={saveSettings} data-testid="setup-light-save">Save to the light</Button>
      </div>
    </>}

    <Typography variant="h4" paragraph style={{ marginTop: 24 }}>Lights on the network</Typography>
    <Typography paragraph color="textSecondary">
      Pick which switcher input each light follows. The bulb button blinks a light so you can tell which is which.
    </Typography>
    <ConnectedLights justAdded={justAdded} />
  </div>
}

export default AddTallyStep
