import { Button, makeStyles, Step, StepButton, Stepper, Typography } from '@material-ui/core'
import { Alert } from '@material-ui/lab'
import React from 'react'
import { useHistory, useParams } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import MiniPage from '../components/layout/MiniPage'
import MixerSelection from '../components/config/MixerSelection'
import ConnectedLights from '../components/setup/ConnectedLights'
import { Link as RouterLink } from 'react-router-dom'
import { useMixerNameConfiguration, useSetupConfiguration } from '../hooks/useConfiguration'
import useHubInfo from '../hooks/useHubInfo'
import useMixerInfo, { useMixerProblem } from '../hooks/useMixerInfo'
import useTallies from '../hooks/useTallies'
import { socket } from '../hooks/useSocket'
import AtemSettings from '../mixer/atem/react/AtemSettings'
import MockSettings from '../mixer/mock/react/MockSettings'
import NullSettings from '../mixer/null/react/NullSettings'
import ObsSettings from '../mixer/obs/react/ObsSettings'
import RolandV60HDSettings from '../mixer/rolandV60HD/react/RolandV60HDSettings'
import RolandV8HDSettings from '../mixer/rolandV8HD/react/RolandV8HDSettings'
import TestSettings from '../mixer/test/react/TestSettings'
import VmixSettings from '../mixer/vmix/react/VmixSettings'

const useStyles = makeStyles(theme => ({
  stepper: {
    background: "transparent",
    padding: theme.spacing(1, 0, 3, 0),
  },
  nav: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: theme.spacing(2),
  },
  block: {
    marginBottom: theme.spacing(2),
  },
  address: {
    fontFamily: "monospace",
    fontSize: "1.2em",
  },
}))

export const setupSteps = [
  { id: "switcher", label: "Video switcher" },
  { id: "network", label: "Network" },
  { id: "lights", label: "Lights" },
  { id: "done", label: "Done" },
] as const
type StepId = typeof setupSteps[number]["id"]

function SwitcherStep() {
  const mixerName = useMixerNameConfiguration()
  const isMixerConnected = useMixerInfo()
  const mixerProblem = useMixerProblem()
  const classes = useStyles()
  const chosen = mixerName !== undefined && mixerName !== "" && mixerName !== "null"

  return <>
    <Typography paragraph color="textSecondary">
      Choose the video switcher the lights should follow and press <strong>Save</strong>. The hub connects right away.
    </Typography>
    <MixerSelection>
      <NullSettings />
      <AtemSettings />
      <MockSettings />
      <ObsSettings />
      <RolandV8HDSettings />
      <RolandV60HDSettings />
      <TestSettings />
      <VmixSettings />
    </MixerSelection>
    {chosen && (isMixerConnected
      ? <Alert severity="success" className={classes.block} data-testid="setup-switcher-connected">The switcher is connected.</Alert>
      : <Alert severity="warning" className={classes.block} data-testid="setup-switcher-disconnected">{mixerProblem || "Saved, but the hub cannot reach the switcher yet. Check its cable or address."} You can carry on; the hub keeps trying and this turns green on its own.</Alert>
    )}
  </>
}

function NetworkStep() {
  const info = useHubInfo()
  const classes = useStyles()

  return <>
    <Typography paragraph color="textSecondary">
      Nothing to type in here. The lights find this hub on their own, as long as they are on the same Wi-Fi as this computer.
    </Typography>
    {info && <>
      <Typography paragraph>This computer is <strong>{info.hostname}</strong>, reachable on:</Typography>
      {info.addresses.length === 0
        ? <Alert severity="warning" className={classes.block}>No network connection found. Connect this computer to the church network first.</Alert>
        : <ul>{info.addresses.map(address => <li key={address}><span className={classes.address}>{address}</span></li>)}</ul>}
      <Typography paragraph color="textSecondary">
        Lights talk to the hub on port {info.tallyPort}. If a light never shows up, the usual reason is that it joined a different Wi-Fi network (a guest network, for example) than this computer.
      </Typography>
    </>}
  </>
}

function DoneStep({ onFinish }: { onFinish: () => void }) {
  const tallies = useTallies()
  const lights = (tallies || []).filter(t => t.isUdpTally())
  const connected = lights.filter(t => t.isConnected()).length
  const patched = lights.filter(t => t.isPatched()).length

  return <>
    <Typography paragraph>
      {lights.length === 0
        ? "No lights yet. You can add them any time from the Tallies page."
        : <>{lights.length} light{lights.length === 1 ? "" : "s"} known, {connected} connected, {patched} assigned to a switcher input.</>}
    </Typography>
    <Typography paragraph color="textSecondary">
      Everything here can be changed later: the switcher under <em>Configuration</em>, the lights under <em>Tallies</em>.
    </Typography>
    <Button color="primary" variant="contained" onClick={onFinish} data-testid="setup-finish">Finish</Button>
  </>
}

const SetupPage = () => {
  const classes = useStyles()
  const history = useHistory()
  const { step } = useParams<{ step?: string }>()
  const setupState = useSetupConfiguration()

  const index = Math.max(0, setupSteps.findIndex(s => s.id === step))
  const current = setupSteps[index]
  const goTo = (id: StepId) => history.push(`/setup/${id}`)

  const finish = () => {
    socket.emit('config.change.setup', true)
    history.push("/")
  }

  return <Layout testId="setup">
    <MiniPage title={setupState?.needed ? "Welcome to vTally" : "Setup"} testId={`setup-${current.id}`}>
      {setupState?.needed && index === 0 && <Typography paragraph>
        Let's get your tally lights running. This takes a few minutes.
      </Typography>}
      <Stepper nonLinear activeStep={index} className={classes.stepper}>
        {setupSteps.map((s, i) => (
          <Step key={s.id} completed={i < index}>
            <StepButton onClick={() => goTo(s.id)} data-testid={`setup-step-${s.id}`}>{s.label}</StepButton>
          </Step>
        ))}
      </Stepper>

      {current.id === "switcher" && <SwitcherStep />}
      {current.id === "network" && <NetworkStep />}
      {current.id === "lights" && <>
        <Typography paragraph color="textSecondary">
          Each light is built and checked on its own page: what is soldered on, a wiring test through the USB cable, then its name and the Wi-Fi.
        </Typography>
        <Button variant="contained" color="primary" component={RouterLink} to="/setup/light" className={classes.block} data-testid="setup-build-light">Build a light</Button>
        <Typography variant="h4" paragraph>Lights on the network</Typography>
        <ConnectedLights />
      </>}
      {current.id === "done" && <DoneStep onFinish={finish} />}

      <div className={classes.nav}>
        <Button disabled={index === 0} onClick={() => goTo(setupSteps[index - 1].id)} data-testid="setup-back">Back</Button>
        {index < setupSteps.length - 1
          ? <Button color="primary" variant="contained" onClick={() => goTo(setupSteps[index + 1].id)} data-testid="setup-next">Next</Button>
          : <span />}
      </div>
    </MiniPage>
  </Layout>
}

export default SetupPage
