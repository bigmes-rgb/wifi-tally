import { Button, makeStyles, Step, StepContent, StepLabel, Stepper, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import React, { useEffect, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import MiniPage from '../components/layout/MiniPage'
import ConnectedLights from '../components/setup/ConnectedLights'
import NetworkCheck from '../components/setup/NetworkCheck'
import DevicePanel, { deviceIsReady } from '../components/setup/DevicePanel'
import NameWifiForm from '../components/setup/NameWifiForm'
import ProfileChooser from '../components/setup/ProfileChooser'
import WiringTest from '../components/setup/WiringTest'
import BoardPicker from '../components/setup/BoardPicker'
import { defaultHardwareProfile, HardwareProfile, isHardwareProfile, readProfileFromIni } from '../flasher/HardwareProfile'
import useTallies from '../hooks/useTallies'
import useTallyDevice from '../hooks/useTallyDevice'
import useFirmwareJob from '../hooks/useFirmwareJob'
import useSessionState from '../hooks/useSessionState'
import { rememberFromDevice, RememberedLight, shouldReadProfile } from '../components/setup/rememberedLight'

const useStyles = makeStyles(theme => ({
  stepper: {
    background: "transparent",
    padding: theme.spacing(1, 0, 0, 0),
  },
  nav: {
    display: "flex",
    gap: theme.spacing(1),
    marginTop: theme.spacing(2),
  },
  block: {
    marginBottom: theme.spacing(2),
  },
}))

const steps = [
  "What is on the board",
  "Plug it in",
  "Wiring test",
  "Name and Wi-Fi",
  "On the network",
]

// One light from bare board to a tested, connected tally. Every step is a gate for the next.
const BuildLightPage = () => {
  const classes = useStyles()
  const [active, setActive] = useState(0)
  // Step 1's choices outlive a page reload: a page reloaded during an install goes on at "Plug it in", and the wiring
  // test after it must test what is on the board, not the default
  const [profile, setProfile] = useSessionState<HardwareProfile>("buildLight.profile", defaultHardwareProfile, isHardwareProfile)
  // the chip id of the board whose stored profile was applied, or that was just finished
  const [profileReadFor, setProfileReadFor] = useState<string | null | undefined>(undefined)
  const [wiringChecked, setWiringChecked] = useSessionState<boolean>("buildLight.wiringChecked", () => false, v => typeof v === "boolean")
  const [refresh, setRefresh] = useState(1)
  // the next check is of another board than the one the hub last installed
  const [newBoard, setNewBoard] = useState(false)
  // the board picked when several are plugged in
  const [boardPath, setBoardPath] = useState<string | undefined>(undefined)
  const device = useTallyDevice(refresh, boardPath, newBoard)
  const [wiringPassed, setWiringPassed] = useState(false)
  const [saved, setSaved] = useState<{ name: string, ssid: string } | null>(null)
  const [saveCount, setSaveCount] = useState(0) // every save restarts the light's Wi-Fi report
  const tallies = useTallies()
  // A page reloaded during a firmware install, or during the board's first start after it, goes back to
  // "Plug it in", which shows it. Otherwise it would open on step 1 and show nothing of it.
  const firmwareJob = useFirmwareJob()
  const rejoined = useRef(false)
  useEffect(() => {
    if (!rejoined.current && (firmwareJob?.running || firmwareJob?.firstStart)) { rejoined.current = true; setActive(1) }
  }, [firmwareJob])

  // a light's settings: read from it, or saved to it at "Name and Wi-Fi"; see rememberedLight.ts
  const [remembered, setRemembered] = useState<RememberedLight | undefined>(undefined)
  useEffect(() => { setRemembered(r => rememberFromDevice(r, device)) }, [device])
  const rememberedSettings = remembered?.settings

  // a light that was set up before brings its own hardware settings
  useEffect(() => {
    if (device && shouldReadProfile(device, profileReadFor)) {
      setProfile(readProfileFromIni(device.tallySettings))
      setProfileReadFor(device.chipId)
    }
  }, [device, profileReadFor, setProfile])

  const reload = (options?: { newBoard?: boolean }) => {
    setNewBoard(!!options?.newBoard)
    setRefresh(r => r + 1)
  }
  const connected = saved && (tallies || []).find(t => t.name === saved.name && t.isConnected())
  // Once the light has reached the hub after this save, step 5 is done and stays done. Showing the
  // check again whenever the light dropped off restarted it each time: releasing the USB port can
  // restart the board, it drops off, the check came back and restarted it, round and round.
  const [reachedHub, setReachedHub] = useState(false)
  useEffect(() => { if (connected) setReachedHub(true) }, [connected])

  const canContinue = [
    wiringChecked,
    // step 1 is skipped when a page opened during an install jumps to "Plug it in": the wiring test needs it
    deviceIsReady(device) && wiringChecked,
    wiringPassed,
    saved !== null,
    true,
  ]

  const nav = (extra?: React.ReactNode) => <div className={classes.nav}>
    {active > 0 && <Button onClick={() => setActive(active - 1)} data-testid="build-back">Back</Button>}
    {active < steps.length - 1 && <Button variant="contained" color="primary" disabled={!canContinue[active]} onClick={() => setActive(active + 1)} data-testid="build-next">Next</Button>}
    {extra}
  </div>

  return <Layout testId="build-light">
    <MiniPage title="Build a light" testId="build-light-page" maxWidth="md">
      <Typography paragraph color="textSecondary">
        From a bare board to a light that is tested and on the network. Each step checks the one before it.
      </Typography>
      <Stepper activeStep={active} orientation="vertical" className={classes.stepper}>
        <Step>
          <StepLabel>{steps[0]}</StepLabel>
          <StepContent>
            <ProfileChooser profile={profile} onChange={p => { setProfile(p); setWiringPassed(false) }} checked={wiringChecked} onChecked={setWiringChecked} />
            {nav()}
          </StepContent>
        </Step>
        <Step>
          <StepLabel>{steps[1]}</StepLabel>
          <StepContent>
            <BoardPicker device={device} onPick={path => { setBoardPath(path); reload() }} className={classes.block} />
            <DevicePanel device={device} onReload={reload} />
            {deviceIsReady(device) && !wiringChecked && <Alert severity="info" className={classes.block} data-testid="build-step1-unchecked">
              Step 1 is not ticked yet: press Back, choose what is on the board and tick the box there. The wiring test after this step tests exactly that.
            </Alert>}
            {nav()}
          </StepContent>
        </Step>
        <Step>
          <StepLabel>{steps[2]}</StepLabel>
          <StepContent>
            {device?.path
              ? <WiringTest path={device.path} profile={profile} onProfileChange={setProfile} onPassed={setWiringPassed} />
              : <Alert severity="warning" className={classes.block}>The light is not plugged in any more. Go back a step.</Alert>}
            {nav()}
          </StepContent>
        </Step>
        <Step>
          <StepLabel>{steps[3]}</StepLabel>
          <StepContent>
            {device
              ? <NameWifiForm device={device} profile={profile} rememberedSsid={saved?.ssid} rememberedSettings={rememberedSettings} onSaved={(name, ssid, ini) => { setSaved({ name, ssid }); setRemembered({ chipId: device.chipId, settings: ini }); setReachedHub(false); setSaveCount(c => c + 1); setActive(4) }} />
              : <Alert severity="warning" className={classes.block}>The light is not plugged in any more. Go back a step.</Alert>}
            {nav()}
          </StepContent>
        </Step>
        <Step>
          <StepLabel>{steps[4]}</StepLabel>
          <StepContent>
            {saved && (reachedHub
              ? <Alert severity="success" className={classes.block} data-testid="build-connected"><strong>{saved.name}</strong> joined the Wi-Fi and reached the hub. Unplug it and mount it on its camera; pick its switcher input below.</Alert>
              : <Alert severity="info" className={classes.block} data-testid="build-waiting">Waiting for <strong>{saved.name}</strong> to show up at the hub. Its own report follows.</Alert>)}
            {/* only while this step shows: the watch holds the USB port (StepContent unmounts hidden steps anyway) */}
            {active === 4 && saved && !reachedHub && <NetworkCheck key={saveCount} path={device?.path} />}
            <ConnectedLights highlight={saved?.name} />
            {nav(<>
              <Button variant="outlined" color="primary" onClick={() => { setSaved(null); setReachedHub(false); setWiringPassed(false); setWiringChecked(false); setProfileReadFor(device?.chipId ?? null); setRemembered(undefined); setActive(0); reload({ newBoard: true }) }} data-testid="build-another">Build another light</Button>
              <Button component={RouterLink} to="/">Done</Button>
            </>)}
          </StepContent>
        </Step>
      </Stepper>
    </MiniPage>
  </Layout>
}

export default BuildLightPage
