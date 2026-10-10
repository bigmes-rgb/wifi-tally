import { Button, makeStyles, Step, StepContent, StepLabel, Stepper, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import React, { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import MiniPage from '../components/layout/MiniPage'
import ConnectedLights from '../components/setup/ConnectedLights'
import DevicePanel, { deviceIsReady } from '../components/setup/DevicePanel'
import NameWifiForm from '../components/setup/NameWifiForm'
import ProfileChooser from '../components/setup/ProfileChooser'
import WiringTest from '../components/setup/WiringTest'
import { defaultHardwareProfile, HardwareProfile, readProfileFromIni } from '../flasher/HardwareProfile'
import useTallies from '../hooks/useTallies'
import useTallyDevice from '../hooks/useTallyDevice'

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
  const [profile, setProfile] = useState<HardwareProfile>(defaultHardwareProfile())
  const [profileFromLight, setProfileFromLight] = useState(false)
  const [wiringChecked, setWiringChecked] = useState(false)
  const [refresh, setRefresh] = useState(1)
  const device = useTallyDevice(refresh)
  const [wiringPassed, setWiringPassed] = useState(false)
  const [saved, setSaved] = useState<{ name: string, ssid: string } | null>(null)
  const tallies = useTallies()

  // a light that was set up before brings its own hardware settings
  useEffect(() => {
    if (device?.tallySettings && !profileFromLight) {
      setProfile(readProfileFromIni(device.tallySettings))
      setProfileFromLight(true)
    }
  }, [device, profileFromLight])

  const reload = () => setRefresh(r => r + 1)
  const connected = saved && (tallies || []).find(t => t.name === saved.name && t.isConnected())

  const canContinue = [
    wiringChecked,
    deviceIsReady(device),
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
            <DevicePanel device={device} onReload={reload} />
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
              ? <NameWifiForm device={device} profile={profile} rememberedSsid={saved?.ssid} onSaved={(name, ssid) => { setSaved({ name, ssid }); setActive(4) }} />
              : <Alert severity="warning" className={classes.block}>The light is not plugged in any more. Go back a step.</Alert>}
            {nav()}
          </StepContent>
        </Step>
        <Step>
          <StepLabel>{steps[4]}</StepLabel>
          <StepContent>
            {saved && (connected
              ? <Alert severity="success" className={classes.block} data-testid="build-connected"><strong>{saved.name}</strong> is on the Wi-Fi and talking to the hub. Unplug it and mount it on its camera; pick its switcher input below.</Alert>
              : <Alert severity="info" className={classes.block} data-testid="build-waiting">Waiting for <strong>{saved.name}</strong> to join the Wi-Fi… It blinks blue while it searches. If it does not appear within a minute, the Wi-Fi name or password is probably wrong: go back a step and save again.</Alert>)}
            <ConnectedLights highlight={saved?.name} />
            {nav(<>
              <Button variant="outlined" color="primary" onClick={() => { setSaved(null); setWiringPassed(false); setWiringChecked(false); setProfileFromLight(false); setActive(0); reload() }} data-testid="build-another">Build another light</Button>
              <Button component={RouterLink} to="/">Done</Button>
            </>)}
          </StepContent>
        </Step>
      </Stepper>
    </MiniPage>
  </Layout>
}

export default BuildLightPage
