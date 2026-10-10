import TallyDevice from '../../flasher/TallyDevice'
import TallySettingsIni from '../../flasher/TallySettingsIni'

// What the wizard remembers about the light being built, tied to that board's chip id. It survives
// a firmware reinstall (which wipes the board's files) and going back a step, but never carries
// over to another board: the next light once inherited the last one's name, Wi-Fi and password,
// with that name exempt from the "already used" check.
export type RememberedLight = { chipId?: string, settings: TallySettingsIni }

const sameBoard = (a?: string, b?: string) => !a || !b || a === b

export function rememberFromDevice(remembered: RememberedLight | undefined, device: TallyDevice | undefined): RememberedLight | undefined {
  if (!device) return remembered
  if (device.tallySettings) return { chipId: device.chipId, settings: device.tallySettings }
  if (remembered && !sameBoard(remembered.chipId, device.chipId)) return undefined
  return remembered
}

// A light that was set up before brings its own hardware profile, once per board; a board the
// person just finished ("Build another light") never brings it back over the next light's choice.
export function shouldReadProfile(device: TallyDevice | undefined, profileReadFor: string | null | undefined): boolean {
  return !!device?.tallySettings && device.chipId !== profileReadFor
}
