import nodemcuLib from 'nodemcu-tool'
import TallyDevice from './TallyDevice'
import TallySettingsIni from './TallySettingsIni'
import { endTestLua, HardwareProfile, profileToLuaCommands, Rgb, showColorLua } from './HardwareProfile'
import tmp from 'tmp-promise'
import { promises as fs } from 'fs'

const baudRate = 115200
const fileName = "tally-settings.ini"

let mutex = false

const tryToAquireMutex = () => {
  if (!mutex) {
    mutex = true
    return true
  } else {
    return false
  }
}

export interface TallySettingsIniProgressType {
  tallyName: string
  inititalizeDone: boolean
  connectionDone: boolean
  uploadDone: boolean
  rebootDone: boolean
  allDone: boolean
  error: boolean
}

export interface TallyProgramProgressType {
  inititalizeDone: boolean
  connectionDone: boolean
  filesUploaded: number
  filesTotal: number
  rebootDone: boolean
  allDone: boolean
  error: boolean
}

export type WiringTestState = {
  active: boolean
  path?: string
  error?: string
}

// a wiring test keeps the serial connection open between colours; this closes it after inactivity
const wiringTestIdleMs = 3 * 60 * 1000

class NodeMcuConnector {
  nodemcu: any
  private wiringTest: { path: string, profile: HardwareProfile, idleTimer?: NodeJS.Timeout } | null = null

  withMutex<T> (fn: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        const mutexAquired = tryToAquireMutex()
        if (mutexAquired) {
          clearInterval(interval)
          if (this.nodemcu.isConnected()) {
            console.warn("Serial terminal was not closed by previous process.")
            this.nodemcu.disconnect()
          }
          resolve(true)
        }
      }, 100)
    })
    .then(() => {
      return fn()
    })
    .finally(() => {
      mutex = false
    })
  }

  // injectable for easier testing
  constructor(nodemcu: any = nodemcuLib) {
    this.nodemcu = nodemcu
    this.nodemcu.onError((error:any) => {
      console.error(error)
    })
  }

  // where the tally's .lc/.lua files are looked for, first match wins
  static localFileDirs = [
    __dirname + "/../../esp8266", // path in release package
    __dirname + "/../../../tally/out", // path during development
  ]

  // the tally software this hub can put on a NodeMCU; empty when it ships without one
  static async getLocalFiles(dirs: string[] = NodeMcuConnector.localFileDirs) {
    let dirName: string
    let files: string[]
    for (const candidate of dirs) {
      try {
        files = await fs.readdir(candidate)
        dirName = candidate
        break
      } catch (e) {
        // try the next one
      }
    }
    if (files === undefined) {
      console.warn(`No tally software found in ${dirs.join(" or ")}. Tallies can not be programmed from this hub.`)
      return []
    }

    console.debug(`Files from ${dirName} will be flashed.`)

    const filteredFiles = files.filter(file => file.endsWith(".lc") || file.endsWith(".lua"))
    return Promise.all(filteredFiles.map(async file => {
      const stats = await fs.stat(dirName + "/" + file)
      return {
        fileName: file,
        filePath: `${dirName}/${file}`,
        fileSize: stats.size,
      }
    }))
  }

  private static async doFilesNeedUpdate(filesOnNodemcu: {name: string, size: number}[]) : Promise<boolean> {
    const localFiles = await NodeMcuConnector.getLocalFiles()
    return localFiles.some(localFile => {  
      return filesOnNodemcu.every(nodeMcuFile => nodeMcuFile.name !== localFile.fileName || nodeMcuFile.size !== localFile.fileSize)
    })
  }

  private sleep(ms: number) {
    return new Promise(resolve => {
      setTimeout(resolve, ms)
    })
  }

  // gracefull connection that retries a few times
  private async connect(path: string) {
    await this.nodemcu.connect(path, baudRate, false)

    // check connection does not always work the first time, so we try it multiple times if necessary
    let retries = 3
    while (true) {
      try {
        return await this.nodemcu.checkConnection()
      } catch (e){
        if (retries === 0) {
          throw e
        }
        await this.sleep(100)
      }
      retries--
    }
  }

  private async execute(idempotentCommand: string) {
    let retries = 3
    while (true) {
      try {
        const foo = await this.nodemcu.execute(`${idempotentCommand}; print("ok")`)
        if (foo === null || !foo.response) {
          throw new Error("Did not get a response for executing the command.")
        }
        if (foo.response.toString().includes("error")) {
          throw new Error(foo.response.toString())
        }
        if (!foo.response.toString().includes("ok")) {
          throw new Error(`response did not include an "ok": ${foo.response.toString()}`)
        }
        return foo
      } catch (e){
        if (retries === 0) {
          throw e
        }
        await this.sleep(100)
      }
      retries--
    }
    
  }

  async getDevice(): Promise<TallyDevice> {
    const tallyDevice = new TallyDevice()
    const localFiles = await NodeMcuConnector.getLocalFiles()
    const updatePossible = localFiles.length > 0
    if (!updatePossible) {
      tallyDevice.update = "not-available"
    }

    try {
      return await this.withMutex(async () => {
        const list = await this.nodemcu.listDevices()
        const device = list[0]
        if (device) {
          
          tallyDevice.path = device.path
          tallyDevice.vendorId = device.vendorId
          tallyDevice.productId = device.productId

          await this.connect(device.path)
          const deviceInfo = await this.nodemcu.deviceInfo()

          tallyDevice.chipId = deviceInfo.chipID
          tallyDevice.flashId = deviceInfo.flashID
          tallyDevice.nodeMcuVersion = deviceInfo.version
          tallyDevice.nodeMcuModules = deviceInfo.modules

          const fsinfo = await this.nodemcu.fsinfo()
          if (updatePossible) {
            tallyDevice.update = await NodeMcuConnector.doFilesNeedUpdate(fsinfo.files) ? "updateable" : "up-to-date"
          }

          const settingsFileExists = fsinfo.files.some(file => file.name === fileName)

          if (settingsFileExists) {
            const res = await this.nodemcu.download(fileName)
            tallyDevice.tallySettings = new TallySettingsIni(res.toString())
          }
        }
        return tallyDevice
      })
    }
    catch (e) {
      tallyDevice.errorMessage = e
      return tallyDevice
    }
    finally {
      if(this.nodemcu && this.nodemcu.isConnected()) { await this.nodemcu.disconnect() }
    }
  }

  async program(path: string, onProgress: (state: TallyProgramProgressType) => void) {
    const files = await NodeMcuConnector.getLocalFiles()
    const progress: TallyProgramProgressType = {
      inititalizeDone: false,
      connectionDone: false,
      filesUploaded: 0,
      filesTotal: files.length,
      rebootDone: false,
      allDone: false,
      error: false,
    }
    onProgress(progress)

    try {
      await this.withMutex(async () => {
        progress.inititalizeDone = true
        onProgress(progress)

        await this.connect(path)

        progress.connectionDone = true
        onProgress(progress)

        for(const file of files) {
          await this.saveFileUpload(file.fileName, file.filePath)
          progress.filesUploaded = progress.filesUploaded + 1
          onProgress(progress)
        }

        await this.hardReset(path)

        progress.rebootDone = true
        onProgress(progress)

        progress.allDone = true
        onProgress(progress)
      })
    }
    catch (e) {
      console.error(`programming failed because of: ${e}`)

      progress.error = true
      onProgress(progress)
      return false
    }
    finally {
      if(this.nodemcu && this.nodemcu.isConnected()) { this.nodemcu.disconnect() }
    }
  }

  async writeTallySettingsIni(path: string, settingsIniString: string, onProgress: (state: TallySettingsIniProgressType) => void) {
    const settingsIni = new TallySettingsIni(settingsIniString)
    const progress: TallySettingsIniProgressType = {
      tallyName: settingsIni.getTallyName(),
      inititalizeDone: false,
      connectionDone: false,
      uploadDone: false,
      rebootDone: false,
      allDone: false,
      error: false,
    }
    onProgress(progress)

    try {
      if (!settingsIni.getTallyName()) {
        throw new Error(`Exeptected ${fileName} to contain a tally.name, but it was empty.`)
      }
      if (!settingsIni.getStationSsid()) {
        throw new Error(`Exeptected ${fileName} to contain a station ssid, but it was empty.`)
      }

      await this.withMutex(async () => {
        progress.inititalizeDone = true
        onProgress(progress)

        await this.connect(path)

        progress.connectionDone = true
        onProgress(progress)

        await this.saveContentUpload(fileName, settingsIniString)

        progress.uploadDone = true
        onProgress(progress)
        
        await this.hardReset(path)

        progress.rebootDone = true
        onProgress(progress)

        progress.allDone = true
        onProgress(progress)
      })
      return true
    }
    catch (e) {
      console.error(`${fileName} upload failed because of:`, e)

      progress.error = true
      onProgress(progress)
      return false
    }
    finally {
      if(this.nodemcu && this.nodemcu.isConnected()) { this.nodemcu.disconnect() }
    }
  }

  // ###
  // Wiring test: drive the LEDs over USB while a person looks at them.
  // Holds the mutex and the serial connection until stopWiringTest() or 3 minutes of silence.
  // ###

  getWiringTestState(): WiringTestState {
    return { active: this.wiringTest !== null, path: this.wiringTest?.path }
  }

  private touchWiringTest() {
    if (!this.wiringTest) { return }
    if (this.wiringTest.idleTimer) { clearTimeout(this.wiringTest.idleTimer) }
    this.wiringTest.idleTimer = setTimeout(() => {
      console.warn("Wiring test ended after inactivity.")
      this.stopWiringTest().catch(e => console.error(e))
    }, wiringTestIdleMs)
  }

  async startWiringTest(path: string, profile: HardwareProfile): Promise<WiringTestState> {
    if (this.wiringTest) {
      await this.stopWiringTest()
    }
    // wait for whatever else is talking to the board (same rule as withMutex)
    while (!tryToAquireMutex()) {
      await this.sleep(100)
    }
    try {
      if (this.nodemcu.isConnected()) { await this.nodemcu.disconnect() }
      await this.connect(path)
      this.wiringTest = { path, profile }
      await this.applyWiringProfile(profile)
      this.touchWiringTest()
      return this.getWiringTestState()
    } catch (e) {
      console.error(`Could not start the wiring test: ${e}`)
      if (this.nodemcu.isConnected()) { await this.nodemcu.disconnect().catch(() => {}) }
      this.wiringTest = null
      mutex = false
      return { active: false, error: `Could not talk to the light: ${e?.message || e}` }
    }
  }

  private async applyWiringProfile(profile: HardwareProfile) {
    for (const cmd of profileToLuaCommands(profile)) {
      await this.execute(cmd)
    }
    this.wiringTest.profile = profile
  }

  async wiringTestShow(profile: HardwareProfile, operator: Rgb, stage: Rgb): Promise<WiringTestState> {
    if (!this.wiringTest) {
      return { active: false, error: "The wiring test is not running. Start it again." }
    }
    try {
      if (JSON.stringify(profile) !== JSON.stringify(this.wiringTest.profile)) {
        await this.applyWiringProfile(profile)
      }
      await this.execute(showColorLua(operator, stage))
      this.touchWiringTest()
      return this.getWiringTestState()
    } catch (e) {
      console.error(`Wiring test failed: ${e}`)
      await this.stopWiringTest()
      return { active: false, error: `Lost the light: ${e?.message || e}. Unplug it, plug it back in and start the test again.` }
    }
  }

  async stopWiringTest(): Promise<WiringTestState> {
    const test = this.wiringTest
    if (!test) { return this.getWiringTestState() }
    if (test.idleTimer) { clearTimeout(test.idleTimer) }
    this.wiringTest = null
    try {
      if (this.nodemcu.isConnected()) {
        await this.execute(endTestLua).catch(() => {})
        await this.nodemcu.disconnect()
      }
    } finally {
      mutex = false
    }
    return this.getWiringTestState()
  }

  private async hardReset(path: string) {
    await this.nodemcu.hardreset()
    await this.nodemcu.disconnect()
    await new Promise(resolve => { setTimeout(resolve, 1000) }) // sleep
    await this.connect(path)

    await new Promise(resolve => { setTimeout(resolve, 3000) }) // sleep

    const failTimeout = setTimeout(() => {
      throw new Error("Could not connect to NodeMCU after hardreset.")
    }, 10000)

    let rebootSuccess = false
    while(!rebootSuccess) {
      try {
        await this.nodemcu.checkConnection()
        rebootSuccess = true
      } catch (e) {
        rebootSuccess = false
      }
    }
    clearTimeout(failTimeout)
  }

  /**
   * uploads content via nodemcu-tool
   * 
   * @param filePath the file path on nodemcu
   * @param content the file content
   */
  private async saveContentUpload(filePath: string, content: string) {
    const { path: tmpPath, cleanup: tmpCleanup } = await tmp.file({})
    try {
      await fs.writeFile(tmpPath, content)
      await this.saveFileUpload(filePath, tmpPath)
    }
    finally {
      tmpCleanup()
    }
  }

  /**
   * uploads a file via nodemcu-tool and does some verification
   * 
   * @param remoteFilePath the file path on nodemcu
   * @param localFilePath the local file path
   */
  private async saveFileUpload(remoteFilePath: string, localFilePath: string) {
    if (!this.nodemcu.isConnected())  {
      throw new Error("Expected to have an already established connection to NodeMCU, but did not.")
    }

    const copyFileName = remoteFilePath + ".swp"

    try {
      await this.nodemcu.upload(localFilePath, copyFileName, {}, () => {})
      await this.sleep(1000)
      const gotContent = await this.nodemcu.download(copyFileName)
      const localContent = await fs.readFile(localFilePath).then(buffer => buffer.toString())

      if (gotContent.toString() !== localContent) {
        throw new Error(`Uploaded file does not match downloaded file. Expected file size of ${localContent.length}, but got ${gotContent.length}`)
      }

      // rename file
      await this.removeFileIfExists(remoteFilePath)
      await this.execute(`file.rename("${copyFileName}", "${remoteFilePath}")`)
    }
    finally {
      await this.removeFileIfExists(copyFileName)
    }
  }
  private async removeFileIfExists(filePath: string) {
    return this.execute(`if file.exists("${filePath}") then file.remove("${filePath}") end`)
  }
}

export default NodeMcuConnector