import NodeMcuConnector from './NodeMcuConnector'

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
