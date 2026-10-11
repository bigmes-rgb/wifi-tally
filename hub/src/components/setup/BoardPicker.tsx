import { FormControl, InputLabel, MenuItem, Select } from '@material-ui/core'
import React from 'react'
import TallyDevice, { boardCandidates, describePort } from '../../flasher/TallyDevice'

type Props = {
  device: TallyDevice | undefined
  onPick: (path: string) => void
  className?: string
}

// With more than one board plugged in, the hub used to take the first it found and give no way to
// choose. This shows only then, and every step after uses the board picked here.
function BoardPicker({ device, onPick, className }: Props) {
  const candidates = boardCandidates(device?.serialPorts)
  if (candidates.length < 2) return null
  return <FormControl className={className} data-testid="board-picker">
    <InputLabel id="board-picker-label">{candidates.length} boards are plugged in. Which one?</InputLabel>
    <Select labelId="board-picker-label" value={device?.path || ""} onChange={e => onPick(String(e.target.value))} style={{ minWidth: 320 }}>
      {candidates.map(port => <MenuItem key={port.path} value={port.path} data-testid={`board-${port.path}`}>{describePort(port)}</MenuItem>)}
    </Select>
  </FormControl>
}

export default BoardPicker
