import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'
import NodeMcuConnector from './NodeMcuConnector'
import TallyDevice from './TallyDevice'

const fakeNodemcu = () => ({
  onError: () => {},
  isConnected: () => false,
  disconnect: async () => {},
  listDevices: async () => [],
})

describe("getLocalFiles()", () => {
  test("it returns an empty list instead of failing when no bundle exists", async () => {
    const files = await NodeMcuConnector.getLocalFiles(["/does/not/exist", "/neither/does/this"])
    expect(files).toEqual([])
  })
  test("it skips missing directories and uses the first one that exists", async () => {
    const files = await NodeMcuConnector.getLocalFiles(["/does/not/exist", __dirname + "/../../../tally/src"])
    expect(files.length).toBeGreaterThan(0)
    expect(files.every(f => f.fileName.endsWith(".lua"))).toBe(true)
  })
  test("the program for the board's flash and its stamp go to the board with the .lc files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tally-out-"))
    for (const name of ["my-app.lc", "init.lua", "lfs.img", "lfs.stamp", "tally-settings.ini.example", "nodemcu.bin"]) {
      await fs.writeFile(path.join(dir, name), "x")
    }
    const files = await NodeMcuConnector.getLocalFiles([dir])
    expect(files.map(f => f.fileName).sort()).toEqual(["init.lua", "lfs.img", "lfs.stamp", "my-app.lc"])
  })
})

describe("getDevice()", () => {
  test("it reports 'not-available' rather than crashing the hub when the bundle is missing", async () => {
    const dirs = NodeMcuConnector.localFileDirs
    NodeMcuConnector.localFileDirs = ["/does/not/exist"]
    try {
      const connector = new NodeMcuConnector(fakeNodemcu())
      const device = await connector.getDevice()
      expect(device.update).toEqual("not-available")
      expect(device.path).toBeUndefined()
    } finally {
      NodeMcuConnector.localFileDirs = dirs
    }
  })
})

describe("writeTallySettingsIni()", () => {
  // a NodeMCU that remembers what was uploaded and answers like the real one
  const rememberingNodemcu = () => {
    const files: Record<string, string> = {}
    let connected = false
    return {
      files,
      onError: () => {},
      isConnected: () => connected,
      connect: async () => { connected = true },
      disconnect: async () => { connected = false },
      checkConnection: async () => {},
      listDevices: async () => [{ path: "/dev/fake" }],
      upload: async (local: string, remote: string) => { files[remote] = require('fs').readFileSync(local).toString() },
      download: async (remote: string) => files[remote],
      execute: async (cmd: string) => {
        const rename = cmd.match(/file\.rename\("([^"]+)", "([^"]+)"\)/)
        if (rename) { files[rename[2]] = files[rename[1]]; delete files[rename[1]] }
        const remove = cmd.match(/file\.remove\("([^"]+)"\)/)
        if (remove) { delete files[remove[1]] }
        return { response: "ok" }
      },
      hardreset: async () => {},
    }
  }

  test("a light without hub.ip is written: it finds the hub on its own", async () => {
    const nodemcu = rememberingNodemcu()
    const written: string[] = []
    const connector = new NodeMcuConnector(nodemcu, undefined, { poke: async (d: string) => { written.push(d) }, purge: async () => {} })
    const states = []
    const ok = await connector.writeTallySettingsIni("/dev/fake", "station.ssid=Church\nstation.password=secret\ntally.name=Cam 1\n", s => states.push({ ...s }))
    expect(ok).toBe(true)
    expect(states[states.length - 1].allDone).toBe(true)
    expect(states[states.length - 1].error).toBe(false)
    expect(nodemcu.files["tally-settings.ini"]).toContain("tally.name=Cam 1")
    // restarted by command, not through the reset line that some boards ignore
    expect(written).toContain("node.restart()\r\n")
    expect(nodemcu.files["tally-settings.ini.swp"]).toBeUndefined()
  }, 20000)

  test("a light without a name is refused", async () => {
    const connector = new NodeMcuConnector(rememberingNodemcu())
    const states = []
    const ok = await connector.writeTallySettingsIni("/dev/fake", "station.ssid=Church\n", s => states.push({ ...s }))
    expect(ok).toBe(false)
    expect(states[states.length - 1].error).toBe(true)
  })
})

describe("wiring test session", () => {
  const scriptedNodemcu = () => {
    const executed: string[] = []
    let connected = false
    return {
      executed,
      onError: () => {},
      isConnected: () => connected,
      connect: async () => { connected = true },
      disconnect: async () => { connected = false },
      checkConnection: async () => {},
      listDevices: async () => [],
      execute: async (cmd: string) => { executed.push(cmd); return { response: "ok" } },
    }
  }
  const profile = { operator: { kind: "rgb", polarity: "anode", pixels: 5, order: "grb" }, stage: { kind: "none", polarity: "anode", pixels: 0, order: "grb" } } as const

  test("it keeps the connection open between colours and hands the LEDs back at the end", async () => {
    const nodemcu = scriptedNodemcu()
    const connector = new NodeMcuConnector(nodemcu)

    const started = await connector.startWiringTest("/dev/fake", profile)
    expect(started).toEqual({ active: true, path: "/dev/fake" })
    expect(nodemcu.isConnected()).toBe(true)
    expect(nodemcu.executed.join("\n")).toContain("_G.testMode=true")

    const shown = await connector.wiringTestShow(profile, [255, 0, 0], [0, 0, 0])
    expect(shown.active).toBe(true)
    expect(nodemcu.executed[nodemcu.executed.length - 1]).toContain("MyLed.static(255,0,0,0,0,0)")
    expect(nodemcu.isConnected()).toBe(true)

    // a changed profile is sent before the next colour
    const cathode = { ...profile, operator: { ...profile.operator, polarity: "cathode" } } as const
    await connector.wiringTestShow(cathode, [0, 255, 0], [0, 0, 0])
    expect(nodemcu.executed.slice(-4).join("\n")).toContain('"grb-"')

    const stopped = await connector.stopWiringTest()
    expect(stopped).toEqual({ active: false, path: undefined })
    expect(nodemcu.executed[nodemcu.executed.length - 1]).toContain("_G.testMode=nil")
    expect(nodemcu.isConnected()).toBe(false)
  })

  test("showing a colour without a session is refused instead of touching the board", async () => {
    const nodemcu = scriptedNodemcu()
    const connector = new NodeMcuConnector(nodemcu)
    const state = await connector.wiringTestShow(profile, [255, 0, 0], [0, 0, 0])
    expect(state.active).toBe(false)
    expect(state.error).toContain("not running")
    expect(nodemcu.executed).toEqual([])
  })

  test("a board without the tally program is reported as such when the test starts, and the port is freed", async () => {
    const nodemcu = scriptedNodemcu()
    nodemcu.execute = async () => ({ response: "stdin:1: attempt to index global 'MySettings' (a nil value)" })
    const connector = new NodeMcuConnector(nodemcu)
    const state = await connector.startWiringTest("/dev/fake", profile)
    expect(state.active).toBe(false)
    expect(state.error).toContain("tally software is not running")
    expect(nodemcu.isConnected()).toBe(false)
  }, 20000)

  test("a board that stops answering ends the session and frees the port", async () => {
    const nodemcu = scriptedNodemcu()
    const connector = new NodeMcuConnector(nodemcu)
    await connector.startWiringTest("/dev/fake", profile)
    nodemcu.execute = async () => { throw new Error("unplugged") }
    const state = await connector.wiringTestShow(profile, [255, 0, 0], [0, 0, 0])
    expect(state.active).toBe(false)
    expect(state.error).toContain("Lost the light")
    expect(nodemcu.isConnected()).toBe(false)
    // and the port is free for the next thing
    expect((await connector.getDevice()).errorMessage).toBeUndefined()
  }, 20000)
})

describe("flashFirmware()", () => {
  const quietNodemcu = () => ({ onError: () => {}, isConnected: () => false, disconnect: async () => {}, listDevices: async () => [] })

  test("it hands the port and the bundled image to the flasher and reports its progress", async () => {
    const dirs = NodeMcuConnector.localFileDirs
    NodeMcuConnector.localFileDirs = [__dirname + "/../../../firmware/prebuilt"]
    try {
      const seen: any[] = []
      const connector = new NodeMcuConnector(quietNodemcu(), async ({ path, binPath, onProgress }) => {
        seen.push({ path, binPath })
        onProgress({ phase: "done", percent: 100 })
        return true
      })
      const progress = []
      const ok = await connector.flashFirmware("COM9", p => progress.push(p))
      expect(ok).toBe(true)
      expect(seen[0].path).toBe("COM9")
      expect(seen[0].binPath).toMatch(/nodemcu-.*\.bin$/)
      expect(progress).toEqual([{ phase: "done", percent: 100 }])
      // the port is free again afterwards
      expect((await connector.getDevice()).firmwareAvailable).toBe(true)
    } finally {
      NodeMcuConnector.localFileDirs = dirs
    }
  })

  test("a hub without a firmware image says so instead of trying", async () => {
    const dirs = NodeMcuConnector.localFileDirs
    NodeMcuConnector.localFileDirs = ["/does/not/exist"]
    try {
      let called = false
      const connector = new NodeMcuConnector(quietNodemcu(), async () => { called = true; return true })
      const progress = []
      const ok = await connector.flashFirmware("COM9", p => progress.push(p))
      expect(ok).toBe(false)
      expect(called).toBe(false)
      expect(progress[0].phase).toBe("error")
      expect((await connector.getDevice()).firmwareAvailable).toBe(false)
    } finally {
      NodeMcuConnector.localFileDirs = dirs
    }
  })
})

describe("pickBoard()", () => {
  test("takes the board the person picked when several are plugged in", () => {
    const ports = [{ path: "COM6", vendorId: "1A86" }, { path: "COM7", vendorId: "1A86" }]
    expect(NodeMcuConnector.pickBoard(ports, "COM7")?.path).toEqual("COM7")
    expect(NodeMcuConnector.pickBoard(ports, "COM3")?.path).toEqual("COM6") // unplugged since: the likeliest
    expect(NodeMcuConnector.pickBoard(ports)?.path).toEqual("COM6")
  })
  test("it prefers a known NodeMCU chip over other USB serial devices", () => {
    const board = NodeMcuConnector.pickBoard([
      { path: "COM3", vendorId: "2341", productId: "0043", manufacturer: "Arduino" },
      { path: "COM4", vendorId: "1a86", productId: "7523", manufacturer: "wch.cn" },
    ])
    expect(board?.path).toBe("COM4")
  })
  test("it falls back to any USB serial device, e.g. a board with an unexpected chip", () => {
    const board = NodeMcuConnector.pickBoard([
      { path: "COM1" },
      { path: "COM7", vendorId: "303a", productId: "1001" },
    ])
    expect(board?.path).toBe("COM7")
  })
  test("it never picks a port without a vendor id, which is on-board or Bluetooth", () => {
    expect(NodeMcuConnector.pickBoard([{ path: "COM1" }, { path: "COM2", manufacturer: "Microsoft" }])).toBeUndefined()
    expect(NodeMcuConnector.pickBoard([])).toBeUndefined()
  })
})

describe("getDevice() reports what the computer sees", () => {
  test("with no board it still lists every serial port so the operator knows what was seen", async () => {
    const nodemcu = { ...fakeNodemcu(), listDevices: async (showAll?: boolean) => showAll ? [{ path: "COM1", manufacturer: "Microsoft" }] : [] }
    const device = await new NodeMcuConnector(nodemcu).getDevice()
    expect(device.path).toBeUndefined()
    expect(device.serialPorts).toEqual([{ path: "COM1", manufacturer: "Microsoft", vendorId: undefined, productId: undefined }])
    expect(device.toJson().serialPorts).toHaveLength(1)
  })
  test("it asks for all ports, not only the vendors nodemcu-tool knows", async () => {
    const asked: any[] = []
    const nodemcu = { ...fakeNodemcu(), listDevices: async (showAll?: boolean) => { asked.push(showAll); return [] } }
    await new NodeMcuConnector(nodemcu).getDevice()
    expect(asked).toEqual([true])
  })
  test("a failure while listing ports is reported in words, not as an empty object", async () => {
    const nodemcu = { ...fakeNodemcu(), listDevices: async () => { throw new Error("bindings missing") } }
    const device = await new NodeMcuConnector(nodemcu).getDevice()
    expect(device.errorMessage).toBe("bindings missing")
    expect(JSON.parse(JSON.stringify(device.toJson())).errorMessage).toBe("bindings missing")
  })
})

// A board modelled on nodemcu-tool's real behaviour: a check that times out leaves its reply
// listener queued, and every later check fails with "concurreny error" until the board prints
// another line, which it does when it gets a newline while Lua is running.
const stickyBoard = (answering = false) => {
  const board = { answering, stale: false, pokes: 0 }
  let connected = false
  const nodemcu = {
    onError: () => {},
    isConnected: () => connected,
    connect: async () => { connected = true },
    disconnect: async () => { connected = false },
    listDevices: async () => [{ path: "COM5", vendorId: "1a86", productId: "7523", manufacturer: "wch.cn" }],
    checkConnection: async () => {
      if (board.stale) throw new Error("concurreny error - receive listener already in-queue")
      if (!board.answering) { board.stale = true; throw new Error("Timeout, no response detected - is NodeMCU online and the Lua interpreter ready ?") }
    },
    deviceInfo: async () => ({ chipID: "c0ffee", flashID: "1640ef", version: "3.0.0", modules: "file,gpio,net,node,pwm2,tmr,wifi,ws2812" }),
    execute: async (cmd: string) => ({ response: cmd === "print(1/2)" ? "0.5" : "ok" }),
    fsinfo: async () => ({ files: [] }),
    download: async () => Buffer.from(""),
  }
  const poke = async () => { board.pokes++; if (board.answering) board.stale = false }
  return { board, nodemcu, poke }
}
const heard = (text: string, sawPrompt = false) => async () => ({ text, sawPrompt, bytes: text.length })

describe("getDevice() with a board that does not answer straight away", () => {
  jest.setTimeout(20000)

  test("without the newline nudge a timed-out check stays stuck (the nodemcu-tool behaviour)", async () => {
    const { board, nodemcu } = stickyBoard(false)
    setTimeout(() => { board.answering = true }, 200)
    const device = await new NodeMcuConnector(nodemcu, undefined, { poke: async () => {}, listen: heard("") }).getDevice(100)
    expect(device.nodeMcuVersion).toBeUndefined()
    expect(device.errorMessage).toBe("The board did not answer the hub's Lua commands.")
  })

  test("with the newline nudge it connects once the board starts answering", async () => {
    const { board, nodemcu, poke } = stickyBoard(false)
    setTimeout(() => { board.answering = true }, 200)
    const device = await new NodeMcuConnector(nodemcu, undefined, { poke, listen: heard("") }).getDevice(100)
    expect(board.pokes).toBeGreaterThan(0)
    expect(device.nodeMcuVersion).toBe("3.0.0")
    expect(device.boardState).toBe("ready")
  })

  test("a board that never answers reports what it printed, in words", async () => {
    const { nodemcu, poke } = stickyBoard(false)
    const listened: any[] = []
    const listen = async (options: any) => { listened.push(options); return { text: "Formatting file system. Please wait...\r\n", sawPrompt: false, bytes: 40 } }
    const device = await new NodeMcuConnector(nodemcu, undefined, { poke, listen }).getDevice(150000)
    expect(listened[0]).toMatchObject({ path: "COM5", ms: 150000, untilPrompt: true })
    expect(device.path).toBe("COM5")
    expect(device.boardState).toBe("formatting")
    expect(device.boardOutput).toContain("Formatting file system")
    expect(device.errorMessage).toBe("The board did not answer the hub's Lua commands.")
    expect(nodemcu.isConnected()).toBe(false)
  })

  test("when the prompt shows up while listening, the board is read after all", async () => {
    const { board, nodemcu, poke } = stickyBoard(false)
    const listen = async () => { board.answering = true; return { text: "NodeMCU 3.0.0.0\r\n> ", sawPrompt: true, bytes: 20 } }
    const device = await new NodeMcuConnector(nodemcu, undefined, { poke, listen }).getDevice()
    expect(device.nodeMcuVersion).toBe("3.0.0")
    expect(device.boardState).toBe("ready")
    expect(device.errorMessage).toBeUndefined()
  })
})

describe("the firmware is checked before the tally software goes on", () => {
  const board = (info: any, half: string) => {
    const { nodemcu, poke } = stickyBoard(true)
    nodemcu.deviceInfo = async () => ({ chipID: "c0ffee", flashID: "1640ef", ...info })
    nodemcu.execute = async (cmd: string) => ({ response: cmd === "print(1/2)" ? half : "ok" })
    return { nodemcu, poke }
  }
  test("a light on the integer build is reported, in words", async () => {
    const { nodemcu, poke } = board({ version: "3.0.0", modules: "file,gpio,net,node,pwm2,tmr,wifi,ws2812" }, "0")
    const device = await new NodeMcuConnector(nodemcu, undefined, { poke, purge: async () => {} }).getDevice()
    expect(device.firmwareProblem).toContain("integer")
  })
  test("a light without pwm2 is reported", async () => {
    const { nodemcu, poke } = board({ version: "3.0.0", modules: "file,gpio,net,node,tmr,wifi,ws2812" }, "0.5")
    const device = await new NodeMcuConnector(nodemcu, undefined, { poke, purge: async () => {} }).getDevice()
    expect(device.firmwareProblem).toContain("pwm2")
  })
  test("a matching light has no problem", async () => {
    const { nodemcu, poke } = board({ version: "3.0.0", modules: "file,gpio,net,node,pwm2,tmr,wifi,ws2812,uart" }, "0.5")
    const device = await new NodeMcuConnector(nodemcu, undefined, { poke, purge: async () => {} }).getDevice()
    expect(device.firmwareProblem).toBeUndefined()
  })
  test("program() refuses to upload to a light that could not run it", async () => {
    const { nodemcu, poke } = board({ version: "2.2.1", modules: null }, "0.5")
    const uploads: string[] = []
    ;(nodemcu as any).upload = async (_l: string, remote: string) => { uploads.push(remote) }
    const states: any[] = []
    await new NodeMcuConnector(nodemcu, undefined, { poke, purge: async () => {} }).program("COM5", s => states.push({ ...s }))
    expect(uploads).toEqual([])
    expect(states[states.length - 1].error).toBe(true)
  })
})

test("watchNetwork restarts the light and stops once it found the hub", async () => {
  const { nodemcu, poke } = stickyBoard(true)
  let options: any
  const stream = (o: any) => { options = o; o.onText("[INFO]  Found hub at 192.168.1.10\r\n"); return { done: Promise.resolve("[INFO]  Found hub at 192.168.1.10\r\n"), stop: () => {} } }
  const seen: string[] = []
  const all = await new NodeMcuConnector(nodemcu, undefined, { poke, purge: async () => {}, stream }).watchNetwork("COM5", t => seen.push(t))
  expect(options.path).toBe("COM5")
  expect(options.writeFirst).toContain("node.restart()")
  expect(options.stopWhen("[INFO]  Found hub at 192.168.1.10")).toBe(true)
  expect(options.stopWhen("[INFO]  Got IP 192.168.1.50")).toBe(false)
  expect(seen.join("")).toContain("Found hub")
  expect(all).toContain("Found hub")
})

test("readBootMessage listens at 74880 baud and stops shortly after the start-up line", async () => {
  const { nodemcu, poke } = stickyBoard(true)
  let options: any
  let stopped = false
  const stream = (o: any) => {
    options = o
    let resolveDone: (s: string) => void = () => {}
    const done = new Promise<string>(r => { resolveDone = r })
    setTimeout(() => o.onText(" ets Jan  8 2013,rst cause:2, boot mode:(2,6)\r\n"), 10)
    return { done, stop: () => { stopped = true; resolveDone(" ets Jan  8 2013,rst cause:2, boot mode:(2,6)\r\n") } }
  }
  const all = await new NodeMcuConnector(nodemcu, undefined, { poke, purge: async () => {}, stream }).readBootMessage("COM7", () => {})
  expect(options.baudRate).toBe(74880)
  expect(stopped).toBe(true)
  expect(all).toContain("boot mode:(2,6)")
})

describe("a board that was unplugged", () => {
  // nodemcu-tool after an unplug: the port is already closed, so its close fails with "Port is not
  // open" and it keeps reporting a connection (lib/transport/serialport.js clears its handle only
  // after a successful close); a later connect replaces the handle
  const unpluggedNodemcu = () => {
    let handle = true
    const nodemcu: any = {
      executed: [] as string[],
      onError: () => {},
      isConnected: () => handle,
      connect: async () => { handle = true; nodemcu.reopened = true },
      disconnect: async () => { throw new Error("Port is not open") },
      checkConnection: async () => {},
      listDevices: async () => [],
      execute: async (cmd: string) => { nodemcu.executed.push(cmd); return { response: "ok" } },
    }
    return nodemcu
  }
  const profile = { operator: { kind: "rgb", polarity: "anode", pixels: 5, order: "grb" }, stage: { kind: "none", polarity: "anode", pixels: 0, order: "grb" } } as const

  test("a close that fails does not make later board jobs fail or hang", async () => {
    const nodemcu = unpluggedNodemcu()
    const connector = new NodeMcuConnector(nodemcu)
    const first = await connector.getDevice()
    expect(first.errorMessage).toBeUndefined()
    const second = await connector.getDevice()
    expect(second.errorMessage).toBeUndefined()
    // and the wiring test opens the port again instead of failing on the stale handle
    const started = await connector.startWiringTest("/dev/fake", profile)
    expect(started.active).toBe(true)
    expect(nodemcu.reopened).toBe(true)
    await connector.stopWiringTest()
  })

  test("a job that never finishes gives the USB port back after its deadline", async () => {
    const connector = new NodeMcuConnector(unpluggedNodemcu())
    const deadline = NodeMcuConnector.jobDeadlineMs
    NodeMcuConnector.jobDeadlineMs = 200
    try {
      await expect(connector.withMutex(() => new Promise(() => { /* a write to a vanished port */ }))).rejects.toThrow("stopped answering")
      await expect(connector.withMutex(() => 42)).resolves.toBe(42)
    } finally {
      NodeMcuConnector.jobDeadlineMs = deadline
    }
  })

  test("a wake-up write to a vanished port does not hold up connecting", async () => {
    const nodemcu = unpluggedNodemcu()
    nodemcu.checkConnection = async () => { throw new Error("Timeout, no response detected") }
    const connector = new NodeMcuConnector(nodemcu, undefined, { poke: () => new Promise(() => { /* never settles */ }), purge: async () => {} })
    const started = Date.now()
    const state = await connector.startWiringTest("/dev/fake", profile)
    expect(state.active).toBe(false)
    expect(Date.now() - started).toBeLessThan(9000)
  }, 15000)
})

describe("the firmware install belongs to the hub, not to a page", () => {
  jest.setTimeout(20000)
  const restartLoop = (from = 0) => "NodeMCU 3.0.0.0 \r\n\tbranch: HEAD\r\nPANIC: unprotected error in call to Lua API (not enough memory)\r\n".repeat(30).slice(from)
  // a board that does not answer Lua; listDevices answers from the list of port lists, the last one repeating
  const silentBoard = (portLists: any[][] = [[{ path: "COM6", vendorId: "1a86", productId: "7523" }]]) => {
    let call = 0
    return {
      onError: () => {}, isConnected: () => false, disconnect: async () => {},
      connect: async () => { throw new Error("No response detected") },
      listDevices: async () => portLists[Math.min(call++, portLists.length - 1)],
    }
  }
  // a flasher that stops where the real one waits for RST, until told how the restart went
  const heldFlasher = () => {
    const calls: any[] = []
    let finish: (restart: string) => void = () => {}
    let reached: () => void = () => {}
    const waiting = new Promise<void>(r => { reached = r }) // resolves once it asks for RST
    const fn = async (options: any) => {
      calls.push(options)
      options.onProgress({ phase: "writing", percent: 50 })
      options.onProgress({ phase: "restarting", percent: 97, pressReset: true, written: true })
      const restart = await new Promise<string>(resolve => {
        const poll = setInterval(() => { if (options.stopWaiting()) { clearInterval(poll); resolve("operator") } }, 10)
        finish = r => { clearInterval(poll); resolve(r) }
        reached()
      })
      options.onProgress({ phase: "done", percent: 100, written: true, restart })
      return true
    }
    return { fn, calls, waiting, finish: (restart = "timeout") => finish(restart) }
  }
  const listening = (text = restartLoop()) => {
    const asked: any[] = []
    const listen = async (o: any) => { asked.push(o); return { text, sawPrompt: false, bytes: text.length } }
    return { asked, listen }
  }
  // an install that finished, with the given restart
  const installed = async (connector: NodeMcuConnector, flasher: ReturnType<typeof heldFlasher>, restart = "restarted") => {
    const install = connector.flashFirmware("COM6")
    await flasher.waiting
    flasher.finish(restart)
    await install
  }
  let dirs: string[]
  beforeEach(() => { dirs = NodeMcuConnector.localFileDirs; NodeMcuConnector.localFileDirs = [__dirname + "/../../../firmware/prebuilt"] })
  afterEach(() => { NodeMcuConnector.localFileDirs = dirs })

  test("a page that asks while an install runs gets it at once, with its live state", async () => {
    const flasher = heldFlasher()
    const connector = new NodeMcuConnector(silentBoard(), flasher.fn)
    const seen: any[] = []
    connector.onFirmwareJob(job => seen.push(job))
    const install = connector.flashFirmware("COM6") // nobody listens to its progress: the job carries on regardless
    await flasher.waiting
    expect(connector.getFirmwareJob()).toMatchObject({ path: "COM6", running: true, progress: { phase: "restarting", pressReset: true, written: true } })
    flasher.finish()
    expect(await install).toBe(true)
    expect(connector.getFirmwareJob()).toMatchObject({ running: false, firstStart: true, progress: { phase: "done", written: true, restart: "timeout" } })
    expect(seen.map(j => j.progress.phase)).toEqual(["connecting", "writing", "restarting", "done"])
  })

  test("asking for a second install while one runs joins it instead of queuing another", async () => {
    const flasher = heldFlasher()
    const connector = new NodeMcuConnector(silentBoard(), flasher.fn)
    const first = connector.flashFirmware("COM6")
    await flasher.waiting
    const joined: any[] = []
    expect(await connector.flashFirmware("COM6", p => joined.push(p))).toBe(false)
    expect(joined[0]).toMatchObject({ phase: "restarting", pressReset: true })
    flasher.finish()
    await first
    expect(flasher.calls.length).toBe(1)
  })

  test("the operator's Done reaches the flasher's wait", async () => {
    const flasher = heldFlasher()
    const connector = new NodeMcuConnector(silentBoard(), flasher.fn)
    const install = connector.flashFirmware("COM6")
    await flasher.waiting
    connector.confirmRestart()
    await install
    expect(connector.getFirmwareJob()?.progress.restart).toBe("operator")
  })

  test("a firmware that was read back is installed, even if the job then runs out of time", async () => {
    const deadline = NodeMcuConnector.jobDeadlineMs
    NodeMcuConnector.jobDeadlineMs = 200
    try {
      const stuck = async (options: any) => {
        options.onProgress({ phase: "restarting", percent: 96, written: true })
        return new Promise<boolean>(() => { /* a restart wait that never ends */ })
      }
      const progress: any[] = []
      expect(await new NodeMcuConnector(silentBoard(), stuck).flashFirmware("COM6", p => progress.push(p))).toBe(true)
      expect(progress[progress.length - 1]).toMatchObject({ phase: "done", written: true, restart: "timeout" })
      // before the read-back it is a failure, and says so
      const failing = async (options: any) => { options.onProgress({ phase: "writing", percent: 40 }); return new Promise<boolean>(() => {}) }
      const before: any[] = []
      expect(await new NodeMcuConnector(silentBoard(), failing).flashFirmware("COM6", p => before.push(p))).toBe(false)
      expect(before[before.length - 1]).toMatchObject({ phase: "error" })
      expect(before[before.length - 1].written).toBeUndefined()
    } finally {
      NodeMcuConnector.jobDeadlineMs = deadline
    }
  })

  test("the first check after an install listens for the first start, whatever the page asked", async () => {
    const flasher = heldFlasher()
    const { asked, listen } = listening()
    const connector = new NodeMcuConnector(silentBoard(), flasher.fn, { listen, poke: async () => {}, purge: async () => {} })
    const install = connector.flashFirmware("COM6")
    await flasher.waiting
    // a page reloaded during the install asks with the default 6 s: it does not know an install ran
    const read = connector.getDevice(6000)
    flasher.finish("restarted")
    await install
    const device = await read
    // the first-start time runs from the end of the install
    expect(asked[0].ms).toBeGreaterThan(NodeMcuConnector.firstStartListenMs - 2000)
    expect(asked[0].ms).toBeLessThanOrEqual(NodeMcuConnector.firstStartListenMs)
    expect(device.boardState).toBe("restarting")
    expect(device.recentInstall).toEqual({ path: "COM6", restart: "restarted", checks: 1 })
    expect(TallyDevice.fromJson(device.toJson()).recentInstall).toEqual(device.recentInstall)
    expect(connector.getFirmwareJob()?.firstStart).toBe(false)
    const again = await connector.getDevice(6000)
    expect(asked[1].ms).toBe(6000)
    expect(again.recentInstall?.checks).toBe(2)
  })

  test("a check for a page that closed meanwhile does not count: the next one is still the first start, for what is left of it", async () => {
    const flasher = heldFlasher()
    const { asked, listen } = listening()
    const connector = new NodeMcuConnector(silentBoard(), flasher.fn, { listen, poke: async () => {}, purge: async () => {} })
    await installed(connector, flasher)
    let pageOpen = true
    const listenAndClose = async (o: any) => { pageOpen = false; return listen(o) }
    ;(connector as any).listen = listenAndClose
    await connector.getDevice(6000, undefined, () => pageOpen)
    ;(connector as any).listen = listen
    const device = await connector.getDevice(6000)
    expect(asked[1].ms).toBeGreaterThan(NodeMcuConnector.firstStartListenMs - 2000)
    expect(asked[1].ms).toBeLessThanOrEqual(asked[0].ms)
    expect(device.recentInstall?.checks).toBe(1)
  })

  test("a check queued for a page that has closed does not take the port", async () => {
    const flasher = heldFlasher()
    let listed = 0
    const connector = new NodeMcuConnector({ ...silentBoard(), listDevices: async () => { listed++; return [] } }, flasher.fn)
    const install = connector.flashFirmware("COM6")
    await flasher.waiting
    let pageOpen = true
    const read = connector.getDevice(6000, undefined, () => pageOpen)
    pageOpen = false // reloaded
    flasher.finish()
    await install
    await read
    expect(listed).toBe(0)
  })

  test("the first check follows the board when it comes back on another port (COM6 became COM5)", async () => {
    const flasher = heldFlasher()
    const COM6 = [{ path: "COM6", vendorId: "1a86", productId: "7523" }], COM5 = [{ path: "COM5", vendorId: "1a86", productId: "7523" }]
    const asked: string[] = []
    const listen = async (o: any) => {
      asked.push(o.path)
      if (o.path === "COM6") return { text: "", sawPrompt: false, bytes: 0, closed: true } // unplugged
      const text = restartLoop()
      return { text, sawPrompt: false, bytes: text.length }
    }
    const connector = new NodeMcuConnector(silentBoard([COM6, COM6, [], COM5]), flasher.fn, { listen, poke: async () => {}, purge: async () => {} })
    await installed(connector, flasher, "portClosed")
    const info = jest.spyOn(console, "info").mockImplementation(() => {})
    try {
      const device = await connector.getDevice()
      // Windows still lists COM6 for a moment after it closed: tried once more, then it is gone, then back as COM5
      expect(asked).toEqual(["COM6", "COM6", "COM5"])
      expect(device.path).toBe("COM5")
      expect(device.boardState).toBe("restarting")
      expect(info.mock.calls.map(c => String(c[0]))).toContain("[board] the board moved from COM6 to COM5")
    } finally {
      info.mockRestore()
    }
  })

  test("the first check waits a little for a board that is being plugged back in", async () => {
    const flasher = heldFlasher()
    const { asked, listen } = listening()
    const connector = new NodeMcuConnector(silentBoard([[], [], [{ path: "COM5", vendorId: "1a86" }]]), flasher.fn, { listen, poke: async () => {}, purge: async () => {} })
    await installed(connector, flasher, "portClosed")
    const device = await connector.getDevice()
    expect(device.path).toBe("COM5")
    expect(asked[0].path).toBe("COM5")
  })

  test("once the board answers, the install is kept as answered; another board starts afresh", async () => {
    const flasher = heldFlasher()
    const { nodemcu, poke } = stickyBoard(true)
    const connector = new NodeMcuConnector(nodemcu, flasher.fn, { poke, purge: async () => {} })
    await installed(connector, flasher)
    expect((await connector.getDevice()).recentInstall).toEqual({ path: "COM6", restart: "restarted", checks: 1 })
    expect((await connector.getDevice()).recentInstall).toEqual({ path: "COM6", restart: "restarted", checks: 2, answered: true })

    const other = new NodeMcuConnector(silentBoard(), heldFlasher().fn, { listen: listening().listen, poke, purge: async () => {} })
    const otherFlasher = heldFlasher()
    ;(other as any).flashFirmwareFn = otherFlasher.fn
    await installed(other, otherFlasher)
    other.forgetInstall()
    const next = await other.getDevice(6000)
    expect(next.recentInstall).toBeUndefined()
    expect(other.getFirmwareJob()?.firstStart).toBe(false)
  })

  test("the hub log has one line per check: the port, what the board did and the advice shown, then what it printed, once", async () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => {})
    try {
      let from = 0
      const listen = async () => { const text = restartLoop(from += 17) + "station.password=hunter2\r\n"; return { text, sawPrompt: false, bytes: text.length } }
      const connector = new NodeMcuConnector(silentBoard(), undefined, { listen, poke: async () => {}, purge: async () => {} })
      await connector.getDevice(100)
      await connector.getDevice(100)
      const lines = info.mock.calls.map(c => String(c[0]))
      const checks = lines.filter(l => l.startsWith("[board COM6] check"))
      expect(checks).toHaveLength(2)
      expect(checks[0]).toMatch(/no answer; listened \d+\.\d s, \d+ bytes → restarting; advice shown \(install\): The NodeMCU firmware is on this board and starts/)
      const blocks = lines.filter(l => l.startsWith("[board COM6] printed (the last"))
      expect(blocks).toHaveLength(1) // the same restart loop, cut at another place, is not written twice
      expect(blocks[0]).toContain("  | PANIC: unprotected error")
      expect(lines.join("\n")).not.toContain("hunter2")
      expect(lines).toContainEqual(expect.stringMatching(/^\[board COM6\] printed the same lines as at \d\d:\d\d:\d\d$/))
    } finally {
      info.mockRestore()
    }
  })

  test("a check of a board that answers is one line", async () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => {})
    try {
      const { nodemcu, poke } = stickyBoard(true)
      await new NodeMcuConnector(nodemcu, undefined, { poke, purge: async () => {} }).getDevice()
      const lines = info.mock.calls.map(c => String(c[0])).filter(l => l.startsWith("[board"))
      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatch(/^\[board COM5\] check \(\d+\.\d s\): answers, NodeMCU 3\.0\.0, tally software/)
    } finally {
      info.mockRestore()
    }
  })
})

test("after nodemcu-tool opens the port, the hub switches DTR and RTS off, before talking to the board", async () => {
  const { nodemcu, poke } = stickyBoard(true)
  const order: string[] = []
  const connect = nodemcu.connect
  nodemcu.connect = async () => { order.push("connect"); await connect() }
  const checkConnection = nodemcu.checkConnection
  nodemcu.checkConnection = async () => { order.push("check"); await checkConnection() }
  await new NodeMcuConnector(nodemcu, undefined, { poke, purge: async () => {}, release: async () => { order.push("release") } }).getDevice()
  expect(order.slice(0, 3)).toEqual(["connect", "release", "check"])
})

describe("the install record: what the checks after an install advise, and for how long", () => {
  jest.setTimeout(30000)
  const { nextStepFor } = require('./BoardAdvice')
  const COM = (path: string) => ({ path, vendorId: "1a86", productId: "7523" })
  const restartLoop = "NodeMCU 3.0.0.0 \r\n\tbranch: HEAD\r\nPANIC: unprotected error in call to Lua API (not enough memory)\r\n".repeat(5)
  // a flasher that finishes at once, the firmware read back
  const quickFlasher = (restart = "restarted") => async (options: any) => {
    options.onProgress({ phase: "restarting", percent: 96, written: true })
    options.onProgress({ phase: "done", percent: 100, written: true, restart })
    return true
  }
  // a board that answers Lua while `answering`, and otherwise prints `output`; its chip id can change (another board)
  const board = () => {
    const state = { answering: false, output: restartLoop, chipID: "c0ffee", ports: [COM("COM6")] as any[] }
    let connected = false
    const nodemcu = {
      onError: () => {},
      isConnected: () => connected,
      // like nodemcu-tool on a board that does not answer: the connection check fails at once
      connect: async () => { if (!state.answering) throw new Error("No response detected"); connected = true },
      disconnect: async () => { connected = false },
      listDevices: async () => state.ports,
      checkConnection: async () => {},
      deviceInfo: async () => ({ chipID: state.chipID, flashID: "1640ef", version: "3.0.0", modules: "file,gpio,net,node,pwm2,tmr,wifi,ws2812" }),
      execute: async (cmd: string) => ({ response: cmd === "print(1/2)" ? "0.5" : "ok" }),
      fsinfo: async () => ({ files: [] }),
      download: async () => Buffer.from(""),
      upload: async () => {},
    }
    const listen = async () => ({ text: state.output, sawPrompt: false, bytes: state.output.length })
    return { state, nodemcu, listen }
  }
  const extras = (listen: any, more: any = {}) => ({ listen, poke: async () => {}, purge: async () => {}, release: async () => {}, ...more })
  const memoryStore = () => {
    const store = { saved: null as any, load: () => store.saved, save: (r: any) => { store.saved = r && JSON.parse(JSON.stringify(r)) } }
    return store
  }
  // a silent board; the listen stops early when the check is no longer wanted, as listenToBoard does
  const quietListen = (asked: any[]) => (o: any) => new Promise(resolve => {
    const from = Date.now()
    asked.push({ ms: o.ms, at: from })
    const poll = setInterval(() => {
      if (Date.now() - from >= o.ms || o.cancelled?.()) { clearInterval(poll); resolve({ text: "", sawPrompt: false, bytes: 0 }) }
    }, 10)
  })
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  let dirs: string[], firstStart: number, boardReturn: number, recent: number
  beforeEach(() => {
    dirs = NodeMcuConnector.localFileDirs; NodeMcuConnector.localFileDirs = [__dirname + "/../../../firmware/prebuilt"]
    firstStart = NodeMcuConnector.firstStartListenMs; boardReturn = NodeMcuConnector.boardReturnMs; recent = NodeMcuConnector.recentInstallMs
    jest.spyOn(console, "info").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    NodeMcuConnector.localFileDirs = dirs
    NodeMcuConnector.firstStartListenMs = firstStart; NodeMcuConnector.boardReturnMs = boardReturn; NodeMcuConnector.recentInstallMs = recent
    jest.restoreAllMocks()
  })

  test("a board that answered after the install and then restarts is not offered the same install again", async () => {
    const b = board()
    const connector = new NodeMcuConnector(b.nodemcu, quickFlasher(), extras(b.listen))
    expect(nextStepFor(await connector.getDevice(100)).action).toBe("install") // before: the program on it restarts it
    await connector.flashFirmware("COM6")
    b.state.answering = true
    expect((await connector.getDevice(100)).boardState).toBe("ready") // the fresh firmware answers
    expect(await connector.program("COM6", () => {})).not.toBe(false) // "Install now": the light program goes back
    b.state.answering = false // and with the Wi-Fi and the LEDs on, the board restarts over and over
    const after = await connector.getDevice(100)
    expect(after.boardState).toBe("restarting")
    expect(after.recentInstall).toMatchObject({ answered: true, programmed: true })
    const next = nextStepFor(after)
    expect(next.action).not.toBe("install")
    expect(next.text).toContain("LED wires")
  })

  test("the install is remembered across a hub restart, so closing and opening vTally does not send the board round again", async () => {
    const b = board()
    const store = memoryStore()
    const first = new NodeMcuConnector(b.nodemcu, quickFlasher(), extras(b.listen, { installStore: store }))
    await first.flashFirmware("COM6")
    expect(nextStepFor(await first.getDevice(100)).action).toBe("hardware")
    const restarted = new NodeMcuConnector(b.nodemcu, quickFlasher(), extras(b.listen, { installStore: store }))
    const again = await restarted.getDevice(100)
    expect(again.recentInstall).toMatchObject({ path: "COM6", restart: "restarted", checks: 2 })
    expect(nextStepFor(again).action).toBe("hardware")
    // what is stored is checked when it is read back
    store.saved = { path: 7, at: "yesterday" }
    expect((await new NodeMcuConnector(b.nodemcu, quickFlasher(), extras(b.listen, { installStore: store })).getDevice(100)).recentInstall).toBeUndefined()
  })

  test("the install is forgotten after recentInstallMs, so a board from the box next week is offered the install", async () => {
    NodeMcuConnector.recentInstallMs = 300
    const b = board()
    const connector = new NodeMcuConnector(b.nodemcu, quickFlasher(), extras(b.listen))
    await connector.flashFirmware("COM6")
    expect(nextStepFor(await connector.getDevice(100)).action).toBe("hardware")
    await sleep(350)
    const later = await connector.getDevice(100)
    expect(later.recentInstall).toBeUndefined()
    expect(nextStepFor(later).action).toBe("install")
  })

  test("another board that answers is another board: the install on the last one no longer applies", async () => {
    const b = board()
    const connector = new NodeMcuConnector(b.nodemcu, quickFlasher(), extras(b.listen))
    await connector.flashFirmware("COM6")
    b.state.answering = true
    await connector.getDevice(100) // the installed board answers: chip c0ffee
    b.state.chipID = "beef00" // "Build another light": a board with a working NodeMCU
    const other = await connector.getDevice(100)
    expect(other.recentInstall).toBeUndefined()
    b.state.answering = false
    expect(nextStepFor(await connector.getDevice(100)).action).toBe("install")
  })

  test("nobody checked during the first start: once its time is over, pages are not sent to it any more", async () => {
    NodeMcuConnector.firstStartListenMs = 200
    const b = board()
    const connector = new NodeMcuConnector(b.nodemcu, quickFlasher("timeout"), extras(b.listen))
    await connector.flashFirmware("COM6")
    expect(connector.getFirmwareJob()?.firstStart).toBe(true)
    await sleep(250)
    expect(connector.getFirmwareJob()?.firstStart).toBe(false)
  })

  test("a page reloaded during the first-start listen gets the answer of the check that runs, within the first-start time", async () => {
    NodeMcuConnector.firstStartListenMs = 1500
    const asked: any[] = []
    const b = board()
    const connector = new NodeMcuConnector(b.nodemcu, quickFlasher("timeout"), extras(quietListen(asked)))
    await connector.flashFirmware("COM6")
    const installed = Date.now()
    let open = true
    connector.getDevice(100, undefined, () => open)
    await sleep(300)
    open = false // reloaded: the new page asks at once
    const device = await connector.getDevice(100, undefined, () => true)
    expect(Date.now() - installed).toBeLessThan(2300)
    expect(asked).toHaveLength(1)
    expect(device.recentInstall?.checks).toBe(1)
    expect(connector.getFirmwareJob()?.firstStart).toBe(false)
  })

  test("a check nobody waits for any more gives the port back, and the next one listens only for what is left of the first start", async () => {
    NodeMcuConnector.firstStartListenMs = 1500
    const asked: any[] = []
    const b = board()
    const connector = new NodeMcuConnector(b.nodemcu, quickFlasher("timeout"), extras(quietListen(asked)))
    await connector.flashFirmware("COM6")
    const installed = Date.now()
    let open = true
    connector.getDevice(100, undefined, () => open)
    await sleep(300)
    open = false // closed, and nobody asks for a while
    await sleep(300)
    await connector.getDevice(100, undefined, () => true)
    expect(asked).toHaveLength(2)
    expect(asked[1].at - installed).toBeLessThan(1300) // the closed page's listen did not hold the port to its end (1500)
    expect(asked[1].ms).toBeLessThanOrEqual(1500 - 500)
    expect(Date.now() - installed).toBeLessThan(2300)
  })

  test("a page reloaded again and again still gets an answer", async () => {
    NodeMcuConnector.firstStartListenMs = 1200
    const asked: any[] = []
    const b = board()
    const connector = new NodeMcuConnector(b.nodemcu, quickFlasher("timeout"), extras(quietListen(asked)))
    await connector.flashFirmware("COM6")
    const installed = Date.now()
    const delivered: number[] = []
    const pages: Promise<any>[] = []
    for (let i = 0; i < 4; i++) {
      let open = true
      pages.push(connector.getDevice(100, undefined, () => open).then(() => { if (open) delivered.push(i) }))
      if (i < 3) { await sleep(400); open = false }
    }
    await Promise.all(pages)
    expect(delivered).toEqual([3])
    expect(asked).toHaveLength(1)
    expect(Date.now() - installed).toBeLessThan(2200) // one first-start wait (1200), not two
    expect(connector.getFirmwareJob()?.firstStart).toBe(false)
  })

  test("two windows that ask at the same time get the same check, and the same advice", async () => {
    const asked: any[] = []
    const b = board()
    b.state.output = ""
    const connector = new NodeMcuConnector(b.nodemcu, quickFlasher("timeout"), extras(async (o: any) => { asked.push(o); return { text: "", sawPrompt: false, bytes: 0 } }))
    await connector.flashFirmware("COM6")
    const [one, two] = await Promise.all([connector.getDevice(6000), connector.getDevice(6000)])
    expect(asked).toHaveLength(1)
    expect(one.recentInstall).toEqual(two.recentInstall)
    expect(nextStepFor(one)).toEqual(nextStepFor(two))
    expect(nextStepFor(one).action).toBe("replug")
  })

  test("a check that found no board does not use up the first start: the next check, with the board back, listens for it", async () => {
    NodeMcuConnector.boardReturnMs = 100
    const asked: number[] = []
    const b = board()
    const connector = new NodeMcuConnector(b.nodemcu, quickFlasher("portClosed"), extras(async (o: any) => { asked.push(o.ms); return { text: "", sawPrompt: false, bytes: 0 } }))
    await connector.flashFirmware("COM6")
    b.state.ports = [] // unplugged at the RST card, and Windows is slow to bring it back
    const none = await connector.getDevice(6000)
    expect(none.path).toBeUndefined()
    expect(connector.getFirmwareJob()?.firstStart).toBe(true)
    b.state.ports = [COM("COM5")]
    const back = await connector.getDevice(6000)
    expect(asked[0]).toBeGreaterThan(NodeMcuConnector.firstStartListenMs - 5000)
    expect(back.recentInstall?.checks).toBe(1)
  })

  test("following the board after its port closed: another board that was plugged in all along is not it", async () => {
    NodeMcuConnector.firstStartListenMs = 8000
    const lists = [[COM("COM3"), COM("COM6")], [COM("COM3")], [COM("COM3")], [COM("COM3"), COM("COM5")]]
    let call = 0
    const asked: string[] = []
    const listen = async (o: any) => {
      asked.push(o.path)
      if (o.path === "COM6") return { text: "", sawPrompt: false, bytes: 0, closed: true } // unplugged to restart it
      if (o.path === "COM3") return { text: "NodeMCU 3.0.0.0\r\n> ", sawPrompt: true, bytes: 20 } // a finished light
      return { text: restartLoop, sawPrompt: false, bytes: restartLoop.length }
    }
    const nodemcu = { ...board().nodemcu, connect: async (path: string) => { if (path !== "COM3") throw new Error("No response detected") }, listDevices: async () => lists[Math.min(call++, lists.length - 1)] }
    const connector = new NodeMcuConnector(nodemcu, quickFlasher("portClosed"), extras(listen))
    await connector.flashFirmware("COM6")
    const device = await connector.getDevice(6000, "COM6")
    expect(asked).toEqual(["COM6", "COM5"])
    expect(device.path).toBe("COM5")
    expect(device.boardState).toBe("restarting")
    expect(device.recentInstall?.checks).toBe(1)
  })

  test("a board whose port closed and did not come back is reported as not plugged in, not as a silent board", async () => {
    NodeMcuConnector.firstStartListenMs = 3000
    NodeMcuConnector.boardReturnMs = 500
    const lists = [[COM("COM6")], []]
    let call = 0
    const b = board()
    const nodemcu = { ...b.nodemcu, listDevices: async () => lists[Math.min(call++, lists.length - 1)] }
    const connector = new NodeMcuConnector(nodemcu, quickFlasher("operator"), extras(async () => ({ text: "", sawPrompt: false, bytes: 0, closed: true })))
    await connector.flashFirmware("COM6")
    const device = await connector.getDevice(6000)
    expect(device.path).toBeUndefined()
    expect(device.serialPorts).toEqual([])
    expect(device.boardState).toBeUndefined()
  })

  test("replugging the board during a listen is not a restart loop: what it printed before the replug is not counted again", async () => {
    NodeMcuConnector.firstStartListenMs = 3000
    const formatting = "Formatting file system. Please wait...\r\n"
    let call = 0
    const lists = [[COM("COM6")], [COM("COM5")]]
    const listen = async (o: any) => o.path === "COM6"
      ? { text: formatting, sawPrompt: false, bytes: formatting.length, closed: true } // unplugged in the middle of it
      : { text: formatting, sawPrompt: false, bytes: formatting.length } // and it starts over
    const nodemcu = { ...board().nodemcu, listDevices: async () => lists[Math.min(call++, lists.length - 1)] }
    const connector = new NodeMcuConnector(nodemcu, quickFlasher("restarted"), extras(listen))
    await connector.flashFirmware("COM6")
    const device = await connector.getDevice(6000)
    expect(device.boardState).toBe("formatting")
    expect(device.boardOutput).toContain("the port closed here")
  })

  test("a page that asks once the running check has settled whom it answers gets a check of its own, which counts", async () => {
    const b = board()
    b.state.answering = true
    let closing = false
    const disconnect = b.nodemcu.disconnect
    b.nodemcu.disconnect = async () => { closing = true; await sleep(200); return disconnect() } // closing the port takes a moment
    const connector = new NodeMcuConnector(b.nodemcu, quickFlasher(), extras(b.listen))
    await connector.flashFirmware("COM6")
    const first = connector.getDevice(100)
    while (!closing) await sleep(5)
    const second = await connector.getDevice(100)
    expect(second).not.toBe(await first)
    expect(second.recentInstall?.checks).toBe((await first).recentInstall.checks + 1)
  })

  test("pressing \"Check the other board\" while a check of the last one runs starts a check of its own", async () => {
    const asked: any[] = []
    const b = board()
    const connector = new NodeMcuConnector(b.nodemcu, quickFlasher(), extras(async (o: any) => { asked.push(o); await sleep(100); return { text: restartLoop, sawPrompt: false, bytes: restartLoop.length } }))
    await connector.flashFirmware("COM6")
    const old = connector.getDevice(6000)
    while (asked.length === 0) await sleep(10) // it listens to the last board
    connector.forgetInstall()
    const fresh = await connector.getDevice(6000)
    expect((await old).recentInstall).toBeDefined()
    expect(fresh.recentInstall).toBeUndefined()
    expect(asked).toHaveLength(2)
  })
})
