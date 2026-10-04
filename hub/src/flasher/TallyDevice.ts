import TallySettingsIni from "./TallySettingsIni"

export type UpdateType = "not-available" | "up-to-date" | "updateable"

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

    return device
  }
}

export default TallyDevice