import React from 'react'
import { Button, makeStyles } from '@material-ui/core'
import TallyDevice, { SerialPortInfo } from '../../flasher/TallyDevice'
import { Alert, AlertTitle } from '@material-ui/lab'
import ExternalLink from '../ExternalLink'

const useStyles = makeStyles(theme => {
  return {
    warning: {
      marginBottom: theme.spacing(2),
    },
    info: {
      marginBottom: theme.spacing(2),
      "& a": {
        color: theme.palette.info.main,
      }
    }
  }
})

type Props = {
  tallyDevice: TallyDevice
  onReload: () => void
}

function Help({tallyDevice, onReload}: Props) {
  const classes = useStyles()
  
  if (tallyDevice.path === undefined) {
    const isLocalhost = (() => {
      const hostName = window.location.hostname
      return hostName === "127.0.0.1" || hostName === "localhost" || hostName === "[::1]"
    })

    const ports = tallyDevice.serialPorts || []
    const describe = (port: SerialPortInfo) => {
      const details = [port.manufacturer, port.vendorId ? `USB ${port.vendorId}:${port.productId}` : "not USB"].filter(Boolean)
      return `${port.path} (${details.join(", ")})`
    }

    return <>
      <Alert 
        className={classes.warning} 
        severity="warning"
        action={
          <Button color="inherit" size="small" onClick={() => onReload()}>Try again</Button>
        }
      >
        {ports.length === 0
          ? "This computer reports no serial port at all, so Windows is not seeing the board."
          : "None of the serial ports on this computer looks like a NodeMCU board."}
      </Alert>
      {tallyDevice.errorMessage && <Alert variant="outlined" className={classes.warning} severity="error" data-testid="device-error">
        <AlertTitle>Looking for ports failed</AlertTitle>
        {tallyDevice.errorMessage}
      </Alert>}
      {ports.length > 0 && <Alert variant="outlined" className={classes.info} severity="info">
        <AlertTitle>Serial ports this computer sees</AlertTitle>
        <ul data-testid="serial-ports">
          {ports.map(port => <li key={port.path}>{describe(port)}</li>)}
        </ul>
        A NodeMCU shows up as a USB port from QinHeng (CH340, id 1a86), Silicon Labs (CP2102, id 10c4) or FTDI (id 0403).
        The ports above are something else, e.g. a Bluetooth or on-board port.
      </Alert>}
      <Alert variant="outlined" className={classes.info} severity="info">
        <AlertTitle>Possible fixes</AlertTitle>
        <ul>
          <li>Plug the light into the computer that runs the hub via USB.</li>
          { !isLocalhost() && <li>The light has to be connected to the computer that <em>runs</em> the hub. It does not work on <em>remote machines</em>.</li> }
          <li>Some USB cables can only charge. Use a USB <em>data</em> cable, and try another USB socket on the computer.</li>
          <li>Open Device Manager and watch "Ports (COM &amp; LPT)" while you plug the board in. A new line with a yellow triangle means the driver is missing:
            {' '}<ExternalLink href="https://www.wch-ic.com/downloads/CH341SER_EXE.html">CH340 driver</ExternalLink> for most boards,
            {' '}<ExternalLink href="https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers">CP210x driver</ExternalLink> for boards with a Silicon Labs chip.
            Nothing new at all means the cable or the socket.</li>
          <li>Close any other program that may hold the port open, e.g. the Arduino IDE or a serial monitor.</li>
        </ul>
      </Alert>
    </>
  } else if (tallyDevice.nodeMcuVersion === undefined) {
    return <>
      <Alert 
        className={classes.warning} 
        severity="warning"
        action={
          <Button color="inherit" size="small" onClick={() => onReload()}>Try again</Button>
        }
      >
        Device was found, but could not determine if LUA is running.
      </Alert>
      {tallyDevice.errorMessage && <Alert variant="outlined" className={classes.warning} severity="error" data-testid="device-error">{tallyDevice.errorMessage}</Alert>}
      <Alert variant="outlined" className={classes.info} severity="info">
        <AlertTitle>Possible fixes</AlertTitle>
        <ul>
          <li>This happens sporadically. It could be fixed by trying again.</li>
          <li>Make sure a firmware is flashed. For example with esptool.</li>
          <li>Sometimes fault code on the Tally makes the firmware crash. Pushing the reset button might help.</li>
        </ul>
      </Alert>
    </>
  }
  return <></>
}

export default Help