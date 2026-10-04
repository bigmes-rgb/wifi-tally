import { IconButton, List, ListItem, ListItemSecondaryAction, ListItemText, makeStyles, Typography } from '@material-ui/core'
import WbIncandescentIcon from '@material-ui/icons/WbIncandescent'
import React from 'react'
import ChannelSelector from '../ChannelSelector'
import { UdpTally } from '../../domain/Tally'
import useChannels from '../../hooks/useChannels'
import { socket } from '../../hooks/useSocket'
import useTallies from '../../hooks/useTallies'

const useStyles = makeStyles(theme => ({
  list: {
    marginBottom: theme.spacing(2),
  },
}))

// Every hardware tally the hub knows, with its switcher input and an Identify button.
function ConnectedLights({ highlight }: { highlight?: string }) {
  const tallies = useTallies()
  const channels = useChannels()
  const classes = useStyles()
  const lights = (tallies || []).filter(tally => tally.isUdpTally()) as UdpTally[]

  if (lights.length === 0) {
    return <Typography paragraph color="textSecondary">No light has reported to the hub yet.</Typography>
  }

  return <List dense className={classes.list} data-testid="setup-lights-list">
    {lights.sort((a, b) => a.name.localeCompare(b.name)).map(tally => (
      <ListItem key={tally.name} divider selected={tally.name === highlight}>
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

export default ConnectedLights
