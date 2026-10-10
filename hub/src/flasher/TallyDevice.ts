import TallySettingsIni from "./TallySettingsIni"
import type { BoardState } from "./BoardListener"

export type UpdateType = "not-available" | "up-to-date" | "updateable"

// one serial port the computer reports, whether or not it looks like a NodeMCU
export interface SerialPortInfo {
  path: string
  manufacturer?: string
  vendorId?: string
  productId?: string
}

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

    return device
  }
}

export default TallyDevice