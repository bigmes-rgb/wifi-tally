import nodemcuLib from 'nodemcu-tool'
import TallyDevice, { boardCandidates, describePort, KNOWN_VENDOR_IDS, SerialPortInfo } from './TallyDevice'
import TallySettingsIni from './TallySettingsIni'
import { endTestLua, HardwareProfile, profileToLuaCommands, Rgb, showColorLua, tallyNotRunning } from './HardwareProfile'
import { describeFlashError, FirmwareProgressType, FlashFirmwareFn, flashNodeMcuFirmware, RestartOutcome } from './FirmwareFlasher'
import { firmwareProblem, numberTypeFrom } from './FirmwareCheck'
import { classifyBoardOutput, HeardFromBoard, listenToBoard, ListenOptions, streamFromBoard, StreamOptions } from './BoardListener'
import { nextStepFor } from './BoardAdvice'
import { BoardOutputLog, secs } from './HubLog'
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

// The firmware install the hub is running, or ran last. It belongs to the hub, not to the page that started it:
// every page hears how it goes, and a page opened or reloaded in the middle of it shows it.
export type FirmwareJob = {
  path: string
  running: boolean
  progress: FirmwareProgressType // the last report; "written" once the firmware was read back
  // after an install that was read back: the next board check is the board's first start, and listens for it
  firstStart: boolean
}

export type WiringTestState = {
  active: boolean
  path?: string
  error?: string
}

// a wiring test keeps the serial connection open between colours; this closes it after inactivity
const wiringTestIdleMs = 3 * 60 * 1000
const TALLY_NOT_RUNNING = "The tally software is not running on this light, so the hub cannot drive its LEDs. Go back to \"Plug it in\", install the tally software, then start the test again."

class NodeMcuConnector {
  nodemcu: any
  private wiringTest: { path: string, profile: HardwareProfile, idleTimer?: NodeJS.Timeout } | null = null

  // One board operation at a time. Each gets a deadline: a job stuck on a board that vanished must
  // not hold the USB port, and with it every later step, until vTally is restarted.
  withMutex<T> (fn: () => T, maxMs = NodeMcuConnector.jobDeadlineMs): Promise<T> {
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        const mutexAquired = tryToAquireMutex()
        if (mutexAquired) {
          clearInterval(interval)
          resolve(true)
        }
      }, 100)
    })
    .then(async () => {
      if (this.boardPortOpen()) {
        console.warn("Serial terminal was not closed by previous process.")
        await this.closeBoardPort()
      }
      return this.within(maxMs, "working with it", fn)
    })
    .finally(() => {
      mutex = false
    })
  }

  // the longest one board operation may take; reading a freshly flashed board listens for 150 s
  static jobDeadlineMs = 5 * 60 * 1000
  // a board on its first start after an install formats its storage first, and answers nothing meanwhile
  static firstStartListenMs = 150000
  // how long a board that went away (unplugged to restart it) gets to come back before a check gives up on it
  static boardReturnMs = 20000
  // how long an install still decides what a check of a board that does not answer advises
  static recentInstallMs = 30 * 60 * 1000

  private firmwareJob: FirmwareJob | null = null
  private firmwareListeners = new Set<(job: FirmwareJob) => void>()
  private restartConfirmed = false
  // the last install that was read back, for the checks after it; cleared once the board answers
  private lastInstall: { path: string, restart: RestartOutcome, checks: number, at: number } | null = null
  private boardOutputLog = new BoardOutputLog()

  getFirmwareJob(): FirmwareJob | null {
    return this.firmwareJob && { ...this.firmwareJob, progress: { ...this.firmwareJob.progress } }
  }

  // every change of the install, for every page; returns the function that stops it
  onFirmwareJob(listener: (job: FirmwareJob) => void): () => void {
    this.firmwareListeners.add(listener)
    return () => { this.firmwareListeners.delete(listener) }
  }

  private publishFirmwareJob() {
    const job = this.getFirmwareJob()
    if (job) this.firmwareListeners.forEach(listener => listener(job))
  }

  // the operator pressed RST, or unplugged the board and plugged it back in, and pressed Done
  confirmRestart() {
    if (this.firmwareJob?.running) this.restartConfirmed = true
  }

  // another board was plugged in: what the hub did to the last one says nothing about this one
  forgetInstall() {
    this.lastInstall = null
    if (this.firmwareJob?.firstStart) {
      this.firmwareJob.firstStart = false
      this.publishFirmwareJob()
    }
  }

  private recentInstall() {
    const install = this.lastInstall
    return install && Date.now() - install.at < NodeMcuConnector.recentInstallMs ? install : null
  }

  // nodemcu-tool forgets its port only when closing it succeeds. After an unplug the port is already
  // closed, so closing fails and nodemcu-tool keeps reporting a connection, which every later close
  // rejects and every later write waits on forever. The hub keeps its own word: a failed close means
  // the port is gone, until the next connect replaces nodemcu-tool's handle.
  private portLost = false

  private boardPortOpen(): boolean {
    return this.nodemcu.isConnected() && !this.portLost
  }

  private async closeBoardPort() {
    if (!this.boardPortOpen()) { return }
    try {
      await this.within(3000, "closing the port", () => this.nodemcu.disconnect())
    } catch (e) {
      this.portLost = true
      console.warn(`The board's port was already gone: ${e?.message || e}`)
    }
  }

  private listen: (options: ListenOptions) => Promise<HeardFromBoard>
  private poke: (data: string) => Promise<void>
  private purge: () => Promise<void>
  private release: () => Promise<void>
  private stream: (options: StreamOptions) => { done: Promise<string>, stop: () => void }
  private stopWatch: (() => void) | null = null

  // injectable for easier testing
  constructor(nodemcu: any = nodemcuLib, private flashFirmwareFn: FlashFirmwareFn = flashNodeMcuFirmware, extras: {
    listen?: (options: ListenOptions) => Promise<HeardFromBoard>
    poke?: (data: string) => Promise<void> // write raw text to the board through nodemcu-tool's open port
    purge?: () => Promise<void> // drop lines nodemcu-tool has received but nobody asked for
    release?: () => Promise<void> // switch DTR and RTS off on nodemcu-tool's open port
    stream?: (options: StreamOptions) => { done: Promise<string>, stop: () => void }
  } = {}) {
    this.nodemcu = nodemcu
    this.listen = extras.listen || listenToBoard
    this.stream = extras.stream || streamFromBoard
    this.poke = extras.poke || (async (data: string) => {
      // the same module instance nodemcu-tool talks through
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      await require('nodemcu-tool/lib/transport/scriptable-serial-terminal').write(data)
    })
    this.purge = extras.purge || (async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      await require('nodemcu-tool/lib/transport/scriptable-serial-terminal').purge()
    })
    this.release = extras.release || (async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      await require('nodemcu-tool/lib/transport/scriptable-serial-terminal').flowcontrol({ dtr: false, rts: false })
    })
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

  // the NodeMCU firmware image next to the tally software, if the hub ships one
  static async getFirmwareFile(dirs: string[] = NodeMcuConnector.localFileDirs): Promise<string | null> {
    for (const dir of dirs) {
      try {
        const bin = (await fs.readdir(dir)).find(f => f.endsWith(".bin"))
        if (bin) { return `${dir}/${bin}` }
      } catch (e) {
        // try the next one
      }
    }
    return null
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

  // Connects and waits up to patienceMs for the Lua prompt. nodemcu-tool's check gives up after
  // 1.5 s but leaves its reply listener queued, so a plain retry fails with "concurreny error"
  // until the board prints another line. A bare newline makes a running Lua print its prompt,
  // which releases the listener; then the check is tried again.
  private async connect(path: string, patienceMs = 4000) {
    await this.within(5000, "opening the port", () => this.nodemcu.connect(path, baudRate, false))
    this.portLost = false
    // nodemcu-tool opens the port with node-serialport's defaults, which switch DTR on under Windows. On NodeMCU's
    // auto-reset circuit that holds the FLASH pin low, so pressing RST meanwhile started flashing mode. Both off;
    // switching them off from there never pulls the reset line.
    await this.within(1000, "letting go of its reset lines", () => this.release()).catch(() => {})
    const deadline = Date.now() + patienceMs
    while (true) {
      try {
        return await this.nodemcu.checkConnection()
      } catch (e) {
        if (Date.now() >= deadline) throw e
        // a write to a port that vanished never settles: give up on it instead
        await this.within(1000, "waking it up", () => this.poke("\r\n")).catch(() => {})
        await this.sleep(300)
        // lines that arrived meanwhile (boot messages, the prompt) would be read as the next
        // answer and every check after would be one line behind
        await this.within(1000, "clearing its output", () => this.purge()).catch(() => {})
      }
    }
  }

  // nodemcu-tool waits for the board's reply without a time limit everywhere except its connection
  // check. A board that stops mid-reply would hold the port, and every later operation, forever.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async within(ms: number, doing: string, work: () => any): Promise<any> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`The board stopped answering while ${doing}.`)), ms)
    })
    try {
      return await Promise.race([work(), timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  // nodemcu-tool's wording is about its own internals; say what it means for the board
  static describeError(e: any): string {
    const message = e instanceof Error ? e.message : String(e)
    if (/concurreny error|Timeout, no response detected|No response detected/i.test(message)) {
      return "The board did not answer the hub's Lua commands."
    }
    return message
  }

  private async execute(idempotentCommand: string) {
    let retries = 3
    while (true) {
      try {
        const foo = await this.within(5000, "running a command", () => this.nodemcu.execute(`${idempotentCommand}; print("ok")`))
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

  // USB-to-serial chips seen on NodeMCU boards: CH340/CH341/CH9102 (QinHeng), CP2102 (Silicon Labs),
  // FT232 (FTDI). Anything else that is a USB serial port is still tried, after these.
  static readonly KNOWN_VENDOR_IDS = KNOWN_VENDOR_IDS

  // Picks the port most likely to be the board. nodemcu-tool only lists known vendors, which hides a
  // board with an unexpected chip and leaves the operator with "no device" and no clue.
  // preferredPath: the board the person picked when several are plugged in
  static pickBoard(ports: SerialPortInfo[], preferredPath?: string): SerialPortInfo | undefined {
    const candidates = boardCandidates(ports)
    return candidates.find(port => port.path === preferredPath) || candidates[0]
  }

  private async listPorts(): Promise<SerialPortInfo[]> {
    const list: SerialPortInfo[] = await this.nodemcu.listDevices(true)
    return list.map(port => ({ path: port.path, manufacturer: port.manufacturer, vendorId: port.vendorId, productId: port.productId }))
  }

  // Looks for the board until it is there or `until` passes: on its old port, or on whichever port it came back.
  // Windows numbers a CH340 board's port by the USB socket, so a board plugged into another socket moves.
  private async waitForBoard(path: string, until: number): Promise<{ ports: SerialPortInfo[], board?: SerialPortInfo }> {
    while (true) {
      const ports = await this.listPorts()
      const board = NodeMcuConnector.pickBoard(ports, path)
      if (board || Date.now() >= until) return { ports, board }
      await this.sleep(1000)
    }
  }

  // Listens for ms until the board gives its prompt. A port that closes meanwhile was unplugged and plugged back
  // in, or dropped by Windows; either way the board starts again, maybe on another port (COM6 became COM5). So it
  // is looked for again for a while, and the listening goes on there.
  private async listenFollowing(board: SerialPortInfo, ms: number): Promise<{ heard: HeardFromBoard, board: SerialPortInfo }> {
    const deadline = Date.now() + ms
    let text = "", bytes = 0, sawPrompt = false, closed = false
    let lostAt: number | undefined
    for (let remaining = ms; ; remaining = Math.max(0, deadline - Date.now())) {
      const heard = await this.listen({ path: board.path, ms: remaining, untilPrompt: true })
      text = (text + heard.text).slice(-8000)
      bytes += heard.bytes
      sawPrompt = heard.sawPrompt
      closed = !!heard.closed
      if (heard.bytes > 0) lostAt = undefined
      if (sawPrompt || !closed || Date.now() >= deadline) break
      lostAt = lostAt ?? Date.now()
      await this.sleep(1000)
      const back = (await this.waitForBoard(board.path, Math.min(deadline, lostAt + NodeMcuConnector.boardReturnMs))).board
      if (!back) break
      if (back.path !== board.path) console.info(`[board] the board moved from ${board.path} to ${back.path}`)
      board = back
    }
    return { heard: { text, sawPrompt, bytes, ...(closed ? { closed } : {}) }, board }
  }

  // what a check that reached a page means for the install before it
  private afterCheck(device: TallyDevice, delivered: boolean) {
    const install = this.recentInstall()
    if (!install || !delivered) return
    install.checks++
    if (device.boardState === "ready") this.lastInstall = null // it answers: that install needs no follow-up
    if (this.firmwareJob?.firstStart) {
      this.firmwareJob.firstStart = false
      this.publishFirmwareJob()
    }
  }

  // One line per check in the hub log: the port, what the board did, and what the page advises. Then what the board
  // printed, written once (see BoardOutputLog).
  private logCheck(device: TallyDevice, ms: number, heard?: HeardFromBoard, listenedMs = 0) {
    const took = `check (${secs(ms)})`
    if (!device.path) {
      const ports = device.serialPorts.map(describePort).join(", ") || "none"
      console.info(`[board] ${took}: no NodeMCU board; serial ports: ${ports}${device.errorMessage ? `; ${device.errorMessage}` : ""}`)
      return
    }
    const where = `[board ${device.path}]`
    if (device.nodeMcuVersion !== undefined) {
      const problem = device.firmwareProblem ? `; firmware problem: ${device.firmwareProblem}` : ""
      console.info(`${where} ${took}: answers, NodeMCU ${device.nodeMcuVersion}, tally software ${device.update}${problem}${device.errorMessage ? `; then: ${device.errorMessage}` : ""}`)
      return
    }
    const next = nextStepFor(device)
    const listened = heard ? `listened ${secs(listenedMs)}, ${heard.bytes} bytes${heard.closed ? ", the port closed" : ""}` : device.errorMessage
    const advice = device.firmwareAvailable ? `advice shown (${next.action}): ${next.text}` : "this hub has no firmware image to offer"
    console.info(`${where} ${took}: no answer; ${listened} → ${device.boardState || "unknown"}; ${advice}`)
    if (heard?.bytes) this.boardOutputLog.write(device.path, heard.text)
  }

  // listenMs: how long to listen to a board that does not answer, before saying what it printed.
  // stillWanted: false once the page that asked has closed (reloaded, say); its check then leaves the port alone.
  async getDevice(listenMs = 6000, preferredPath?: string, stillWanted: () => boolean = () => true): Promise<TallyDevice> {
    const started = Date.now()
    const tallyDevice = new TallyDevice()
    const localFiles = await NodeMcuConnector.getLocalFiles()
    const updatePossible = localFiles.length > 0
    tallyDevice.firmwareAvailable = (await NodeMcuConnector.getFirmwareFile()) !== null
    if (!updatePossible) {
      tallyDevice.update = "not-available"
    }
    let heard: HeardFromBoard | undefined
    let listened = 0
    let skipped = false

    try {
      await this.withMutex(async () => {
        if (!stillWanted()) { skipped = true; return }
        const install = this.recentInstall()
        if (install) tallyDevice.recentInstall = { path: install.path, restart: install.restart, checks: install.checks + 1 }
        // Right after an install the board formats its storage on its first start, which takes a while. The hub
        // decides that, not the page: a page reloaded meanwhile does not know that an install ran.
        const firstStart = !!install && !!this.firmwareJob?.firstStart
        if (firstStart) {
          listenMs = Math.max(listenMs, NodeMcuConnector.firstStartListenMs)
          console.info(`[board] first check after the install on ${install.path}: listening up to ${secs(listenMs)} for the board's first start`)
        }
        try {
          let ports = await this.listPorts()
          let device = NodeMcuConnector.pickBoard(ports, preferredPath ?? install?.path)
          // unplugged to restart it after the install: give it a moment to come back
          if (!device && firstStart) ({ ports, board: device } = await this.waitForBoard(install.path, Date.now() + NodeMcuConnector.boardReturnMs))
          tallyDevice.serialPorts = ports
          if (!device) return
          const found = (port: SerialPortInfo) => {
            tallyDevice.path = port.path
            tallyDevice.vendorId = port.vendorId
            tallyDevice.productId = port.productId
          }
          found(device)

          try {
            await this.connect(device.path)
          } catch (e) {
            // nothing answered: hear what the board prints instead, and wait for it if it is starting up
            await this.closeBoardPort()
            const listenedFrom = Date.now()
            const followed = await this.listenFollowing(device, listenMs)
            listened = Date.now() - listenedFrom
            heard = followed.heard
            device = followed.board
            found(device)
            tallyDevice.boardOutput = heard.text.slice(-1500)
            tallyDevice.boardState = classifyBoardOutput(heard)
            if (tallyDevice.boardState !== "ready") throw e
            await this.connect(device.path, 10000)
          }
          tallyDevice.boardState = "ready"
          const deviceInfo = await this.within(5000, "reporting its firmware", () => this.nodemcu.deviceInfo())

          tallyDevice.chipId = deviceInfo.chipID
          tallyDevice.flashId = deviceInfo.flashID
          tallyDevice.nodeMcuVersion = deviceInfo.version
          tallyDevice.nodeMcuModules = deviceInfo.modules
          const numberAnswer = await this.within(5000, "answering a question", () => this.nodemcu.execute("print(1/2)")).catch(() => null)
          tallyDevice.firmwareProblem = firmwareProblem({
            version: deviceInfo.version, modules: deviceInfo.modules, numberType: numberTypeFrom(numberAnswer?.response),
          }) || undefined

          const fsinfo = await this.within(8000, "listing its files", () => this.nodemcu.fsinfo())
          if (updatePossible) {
            tallyDevice.update = await NodeMcuConnector.doFilesNeedUpdate(fsinfo.files) ? "updateable" : "up-to-date"
          }

          const settingsFileExists = fsinfo.files.some(file => file.name === fileName)

          if (settingsFileExists) {
            const res = await this.within(10000, "sending its settings", () => this.nodemcu.download(fileName))
            tallyDevice.tallySettings = new TallySettingsIni(res.toString())
          }
        } finally {
          this.afterCheck(tallyDevice, stillWanted())
        }
      })
    }
    catch (e) {
      // an Error object serialises to {} over the socket; keep the words
      tallyDevice.errorMessage = NodeMcuConnector.describeError(e)
    }
    finally {
      await this.closeBoardPort()
    }
    if (skipped) console.info("[board] check skipped: the page that asked for it has closed")
    else this.logCheck(tallyDevice, Date.now() - started, heard, listened)
    return tallyDevice
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
        // never upload bytecode the firmware cannot load: the light would stay dark
        const deviceInfo = await this.within(5000, "reporting its firmware", () => this.nodemcu.deviceInfo())
        const numberAnswer = await this.within(5000, "answering a question", () => this.nodemcu.execute("print(1/2)")).catch(() => null)
        const problem = firmwareProblem({ version: deviceInfo.version, modules: deviceInfo.modules, numberType: numberTypeFrom(numberAnswer?.response) })
        if (problem) { throw new Error(problem) }

        progress.connectionDone = true
        onProgress(progress)

        for(const file of files) {
          await this.saveFileUpload(file.fileName, file.filePath)
          progress.filesUploaded = progress.filesUploaded + 1
          onProgress(progress)
        }

        await this.restartBoard(path)

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
      await this.closeBoardPort()
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
        
        await this.restartBoard(path)

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
      await this.closeBoardPort()
    }
  }

  // Puts the NodeMCU firmware on a bare board. Holds the port like every other USB job. The install runs in the
  // hub whether or not the page that started it stays open; onFirmwareJob() hears every step of it.
  // One install at a time: asking while one runs (from another page, or a reloaded one) joins it instead of
  // queuing a second install of the same board behind it.
  async flashFirmware(path: string, onProgress: (progress: FirmwareProgressType) => void = () => {}): Promise<boolean> {
    if (this.firmwareJob?.running) {
      console.info(`[firmware ${path}] asked again while the install on ${this.firmwareJob.path} runs: joining it`)
      onProgress({ ...this.firmwareJob.progress })
      return false
    }
    const job: FirmwareJob = { path, running: true, progress: { phase: "connecting", percent: 0 }, firstStart: false }
    this.firmwareJob = job
    this.restartConfirmed = false
    const update = (progress: FirmwareProgressType) => {
      if (!job.running) return // a late report after the job ended (its deadline) changes nothing
      job.progress = { ...progress }
      if (progress.phase === "done" || progress.phase === "error") {
        job.running = false
        if (progress.written) {
          job.firstStart = true
          this.lastInstall = { path, restart: progress.restart || "timeout", checks: 0, at: Date.now() }
        }
      }
      onProgress(progress)
      this.publishFirmwareJob()
    }
    this.publishFirmwareJob()

    let failure: any
    const binPath = await NodeMcuConnector.getFirmwareFile()
    if (!binPath) {
      failure = "This hub was started without a firmware image, so it cannot install one."
    } else {
      await this.withMutex(async () => {
        await this.closeBoardPort()
        return this.flashFirmwareFn({ path, binPath, onProgress: update, stopWaiting: () => this.restartConfirmed })
      }).catch(e => { failure = e })
    }
    if (job.running) {
      // The flasher reports its own end; this covers the job's deadline and a failure before the flasher could
      // report. Once the firmware was read back it is on the board, and a verified install never reads as failed.
      update(job.progress.written
        ? { phase: "done", percent: 100, message: "Firmware installed and checked", written: true, restart: "timeout" }
        : { phase: "error", percent: 0, message: describeFlashError(failure || "The install stopped without saying why.") })
    }
    return job.progress.phase === "done"
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
      await this.closeBoardPort()
      await this.connect(path)
      this.wiringTest = { path, profile }
      await this.applyWiringProfile(profile)
      this.touchWiringTest()
      return this.getWiringTestState()
    } catch (e) {
      console.error(`Could not start the wiring test: ${e}`)
      await this.closeBoardPort()
      this.wiringTest = null
      mutex = false
      return { active: false, error: tallyNotRunning(String(e?.message || e)) ? TALLY_NOT_RUNNING : `Could not talk to the light: ${e?.message || e}` }
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
      if (tallyNotRunning(String(e?.message || e))) return { active: false, error: TALLY_NOT_RUNNING }
      return { active: false, error: `Lost the light: ${e?.message || e}. Unplug it, plug it back in and start the test again.` }
    }
  }

  async stopWiringTest(): Promise<WiringTestState> {
    const test = this.wiringTest
    if (!test) { return this.getWiringTestState() }
    if (test.idleTimer) { clearTimeout(test.idleTimer) }
    this.wiringTest = null
    try {
      if (this.boardPortOpen()) {
        await this.execute(endTestLua).catch(() => {})
        await this.closeBoardPort()
      }
    } finally {
      mutex = false
    }
    return this.getWiringTestState()
  }

  // Restarts the light and passes along what it prints while it joins the Wi-Fi and looks for the
  // hub, until it finds the hub, maxMs passes, or stopNetworkWatch() is called. Resolves with all of it.
  async watchNetwork(path: string, onText: (text: string) => void, maxMs = 90000): Promise<string> {
    return await this.withMutex(async () => {
      const { done, stop } = this.stream({
        path, ms: maxMs, onText,
        writeFirst: "\r\nnode.restart()\r\n",
        stopWhen: all => /Found hub at \d+\.\d+\.\d+\.\d+/.test(all),
      })
      this.stopWatch = stop
      try {
        return await done
      } finally {
        this.stopWatch = null
      }
    })
  }

  // Listens for the chip's own start-up message (74880 baud) while someone presses RST, and stops
  // shortly after it arrives. Resolves with everything heard.
  async readBootMessage(path: string, onText: (text: string) => void, maxMs = 30000): Promise<string> {
    return await this.withMutex(async () => {
      let settle: ReturnType<typeof setTimeout> | undefined
      let heard = ""
      const { done, stop } = this.stream({
        path, ms: maxMs, baudRate: 74880,
        onText: text => {
          heard += text
          onText(text)
          // the load lines follow the boot line within a moment; then stop
          if (!settle && /boot mode:\s*\(\d,\s*\d\)/.test(heard)) settle = setTimeout(() => stop(), 2500)
        },
      })
      this.stopWatch = stop
      try {
        return await done
      } finally {
        if (settle) clearTimeout(settle)
        this.stopWatch = null
      }
    })
  }

  stopNetworkWatch() {
    if (this.stopWatch) this.stopWatch()
  }

  // Restarts the board so it runs what was just uploaded, and waits until it answers again.
  // node.restart() works on every board; the RTS reset line does not reset some boards (the same
  // boards that need FLASH and RST pressed to install the firmware). The command is written
  // without waiting for a reply: the board may restart before it sends one.
  private async restartBoard(path: string) {
    await this.within(1000, "restarting", () => this.poke("node.restart()\r\n"))
    await this.sleep(300)
    await this.closeBoardPort()
    await this.sleep(1500)
    await this.connect(path, 20000)
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
    if (!this.boardPortOpen())  {
      throw new Error("Expected to have an already established connection to NodeMCU, but did not.")
    }

    const copyFileName = remoteFilePath + ".swp"

    try {
      await this.within(60000, `receiving ${remoteFilePath}`, () => this.nodemcu.upload(localFilePath, copyFileName, {}, () => {}))
      await this.sleep(1000)
      const gotContent = await this.within(30000, `sending back ${remoteFilePath}`, () => this.nodemcu.download(copyFileName))
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