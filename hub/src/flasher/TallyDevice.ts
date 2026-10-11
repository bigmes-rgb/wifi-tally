import TallySettingsIni from "./TallySettingsIni"
import type { BoardState } from "./BoardListener"
import type { RestartOutcome } from "./FirmwareFlasher"

export type UpdateType = "not-available" | "up-to-date" | "updateable"

// one serial port the computer reports, whether or not it looks like a NodeMCU
export interface SerialPortInfo {
  path: string
  manufacturer?: string
  vendorId?: string
  productId?: string
}

// USB-to-serial chips seen on NodeMCU boards: CH340/CH341/CH9102 (QinHeng), CP2102 (Silicon Labs),
// FT232 (FTDI). Any other USB serial port is still a candidate, after these.
const CHIP_NAMES: Record<string, string> = { "1A86": "CH340", "10C4": "CP2102", "0403": "FTDI" }
export const KNOWN_VENDOR_IDS = Object.keys(CHIP_NAMES)

const vendorOf = (port: SerialPortInfo) => (port.vendorId || "").toUpperCase()

// The firmware install this hub finished shortly before a board check, and was read back correctly. A board that
// still does not answer after it needs another remedy than the same install.
export interface RecentInstall {
  path: string // where it was installed; the board may have come back on another port since
  restart: RestartOutcome // how its restart after the install was noticed
  checks: number // board checks since the install that reached a page, this one included
}

// the ports that could be a NodeMCU, the most likely first. A port without a vendor id is
// on-board or Bluetooth and never a NodeMCU.
export function boardCandidates(ports: SerialPortInfo[] = []): SerialPortInfo[] {
  const known = ports.filter(port => KNOWN_VENDOR_IDS.includes(vendorOf(port)))
  const other = ports.filter(port => vendorOf(port) !== "" && !KNOWN_VENDOR_IDS.includes(vendorOf(port)))
  return [...known, ...other]
}

// "COM6 (CH340)", for a list someone picks from
export const describePort = (port: SerialPortInfo) => `${port.path} (${CHIP_NAMES[vendorOf(port)] || port.manufacturer || "USB serial"})`

export interface TallyDeviceObjectType {
  vendorId: string
  productId: string
  chipId: string
  flashId: string
  nodeMcuModules: string
  nodeMcuVersion: string
  path: string
  tallySettings?: string
  errorMessage?: string
  update?: UpdateType
  // this hub carries a NodeMCU firmware image it can put on a bare board
  firmwareAvailable?: boolean
  // every serial port the computer reported when it looked, so the UI can say what it saw
  serialPorts?: SerialPortInfo[]
  // when the board did not answer: what it printed, and what that means
  boardOutput?: string
  boardState?: BoardState
  // the firmware cannot run the tally software, in words; the firmware has to be installed first
  firmwareProblem?: string
  recentInstall?: RecentInstall
}

class TallyDevice{
  vendorId: string
  productId: string
  chipId: string
  flashId: string
  nodeMcuModules: string
  nodeMcuVersion: string
  path: string
  update?: UpdateType
  tallySettings?: TallySettingsIni
  errorMessage?: string
  firmwareAvailable?: boolean
  serialPorts: SerialPortInfo[] = []
  boardOutput?: string
  boardState?: BoardState
  firmwareProblem?: string
  recentInstall?: RecentInstall

  toJson(): TallyDeviceObjectType {
    return {
      vendorId: this.vendorId,
      productId: this.productId,
      chipId: this.chipId,
      flashId: this.flashId,
      nodeMcuModules: this.nodeMcuModules,
      nodeMcuVersion: this.nodeMcuVersion,
      path: this.path,
      tallySettings: this.tallySettings ? this.tallySettings.toString() : undefined,
      errorMessage: this.errorMessage,
      update: this.update,
      firmwareAvailable: this.firmwareAvailable,
      serialPorts: this.serialPorts,
      boardOutput: this.boardOutput,
      boardState: this.boardState,
      firmwareProblem: this.firmwareProblem,
      recentInstall: this.recentInstall,
    }
  }

  public static fromJson(data:TallyDeviceObjectType): TallyDevice {
    const device = new TallyDevice()
    device.vendorId = data.vendorId
    device.productId = data.productId
    device.chipId = data.chipId
    device.flashId = data.flashId
    device.nodeMcuModules = data.nodeMcuModules
    device.nodeMcuVersion = data.nodeMcuVersion
    device.path = data.path
    device.tallySettings = data.tallySettings ? new TallySettingsIni(data.tallySettings) : undefined
    device.errorMessage = data.errorMessage
    device.update = data.update
    device.firmwareAvailable = data.firmwareAvailable
    device.serialPorts = data.serialPorts || []
    device.boardOutput = data.boardOutput
    device.boardState = data.boardState
    device.firmwareProblem = data.firmwareProblem
    device.recentInstall = data.recentInstall

    return device
  }
}

export default TallyDevice