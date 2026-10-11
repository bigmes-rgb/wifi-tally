import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import DevicePanel, { InstallRunning, twoHubsText } from './DevicePanel'
import TallyDevice from '../../flasher/TallyDevice'
import { socket } from '../../hooks/useSocket'

const board = (fields: any) => TallyDevice.fromJson({ path: "COM5", firmwareAvailable: true, serialPorts: [], ...fields })

test("a board still formatting says to wait, offers Check again first, and shows what it printed", () => {
  render(<DevicePanel device={board({ boardState: "formatting", boardOutput: "Formatting file system. Please wait...", errorMessage: "The board did not answer the hub's Lua commands." })} onReload={() => {}} />)
  const alert = screen.getByTestId("device-state-formatting")
  expect(alert.textContent).toContain("setting up its storage")
  expect(screen.getByTestId("device-check")).toBeInTheDocument()
  expect(screen.queryByTestId("device-firmware")).toBeNull()
  expect(screen.getByTestId("device-output").textContent).toContain("Formatting file system")
})

test("a board crashing with something other than NodeMCU is offered the install, without blaming an earlier one", () => {
  render(<DevicePanel device={board({ boardState: "crashing", boardOutput: "Fatal exception 28" })} onReload={() => {}} />)
  const text = screen.getByTestId("device-state-crashing").textContent
  expect(text).toContain("keeps crashing")
  expect(text).not.toMatch(/did not install cleanly|again/)
  expect(screen.getByTestId("device-firmware")).toBeInTheDocument()
})

test("a board whose NodeMCU keeps restarting is told the firmware works, and offered the install that clears its program", () => {
  render(<DevicePanel device={board({ boardState: "restarting", boardOutput: "NodeMCU 3.0.0.0\r\nNodeMCU 3.0.0.0\r\n" })} onReload={() => {}} />)
  const text = screen.getByTestId("device-state-restarting").textContent
  expect(text).toContain("The NodeMCU firmware is on this board and starts")
  expect(text).toContain("clears the program")
  expect(screen.getByTestId("device-firmware")).toBeInTheDocument()
  expect(screen.getByTestId("boot-reader")).toBeInTheDocument()
})

test("a silent board says to plug it in again or press RST, then offers the install", () => {
  render(<DevicePanel device={board({ boardState: "silent" })} onReload={() => {}} />)
  expect(screen.getByTestId("device-state-silent").textContent).toContain("press its RST button once (do not hold FLASH)")
  expect(screen.getByTestId("device-firmware")).toBeInTheDocument()
  expect(screen.queryByTestId("device-output")).toBeNull()
})

const flipFlop = "[INFO]  Found hub at 192.168.1.35\r\n[INFO]  Found hub at 192.168.1.6\r\n[INFO]  Found hub at 192.168.1.35\r\n"

test("a light switching between two hubs says so, names both addresses, and offers Check again", () => {
  render(<DevicePanel device={board({ boardState: "twoHubs", boardOutput: flipFlop })} onReload={() => {}} />)
  const alert = screen.getByTestId("device-state-twoHubs")
  expect(alert.textContent).toContain("hears a vTally hub at two addresses")
  expect(alert.textContent).toContain("192.168.1.35 and 192.168.1.6")
  expect(alert.textContent).toContain("press RST on the board")
  expect(screen.getByTestId("device-check")).toBeInTheDocument()
  expect(screen.queryByTestId("device-firmware")).toBeNull()
})

test("a light running its tally software says to check again, not to reinstall the firmware", () => {
  render(<DevicePanel device={board({ boardState: "tallyBusy", boardOutput: "[INFO]  Got IP 192.168.1.50\r\n" })} onReload={() => {}} />)
  expect(screen.getByTestId("device-state-tallyBusy").textContent).toContain("tally software is running")
  expect(screen.getByTestId("device-check")).toBeInTheDocument()
  expect(screen.queryByTestId("device-firmware")).toBeNull()
})

describe("twoHubsText()", () => {
  test("both addresses are this computer: it is on the network twice", () => {
    const text = twoHubsText(["192.168.1.35", "192.168.1.6"], ["192.168.1.6", "192.168.1.35"])
    expect(text).toContain("Both, 192.168.1.35 and 192.168.1.6, are this computer")
    expect(text).toContain("Unplug its network cable or turn its Wi-Fi off")
  })
  test("one address is someone else's: another computer runs vTally", () => {
    const text = twoHubsText(["192.168.1.35", "192.168.1.20"], ["192.168.1.35"])
    expect(text).toContain("192.168.1.20 is another computer running vTally")
    expect(text).not.toContain("network twice")
  })
  test("without this computer's addresses it names both possibilities", () => {
    const text = twoHubsText(["192.168.1.35", "192.168.1.6"], [])
    expect(text).toContain("another computer on this network runs vTally")
    expect(text).toContain("on the network twice")
  })
})

describe("the install dialog follows the hub's install", () => {
  const server = socket as any
  afterEach(() => server.cleanUp())
  const job = (fields: any = {}) => ({ path: "COM6", running: true, firstStart: false, progress: { phase: "writing", percent: 40 }, ...fields })
  const waitingForRst = job({ progress: { phase: "restarting", percent: 97, pressReset: true, written: true } })
  const finished = (restart = "restarted") => job({ running: false, firstStart: true, progress: { phase: "done", percent: 100, written: true, restart } })
  const hubSays = (j: any) => act(() => { server.emitServerEvent('flasher.firmware.job', j) })

  test("the panel asks the hub for a running install when it opens", () => {
    let asked = 0
    server.onServerEvent('flasher.firmware.job.get', () => asked++)
    render(<DevicePanel device={undefined} onReload={() => {}} />)
    expect(asked).toBe(1)
  })

  test("a page loaded during an install shows that install, not a bare spinner", () => {
    render(<DevicePanel device={undefined} onReload={() => {}} />)
    hubSays(waitingForRst)
    expect(screen.getByTestId("device-install-running").textContent).toContain("COM6")
    expect(screen.getByTestId("device-install-running").textContent).toContain("unplug the board and plug it back in")
    expect(screen.getByTestId("firmware-phase").textContent).toBe("Restarting the board…")
  })

  test("the RST card says RST once, not FLASH, or unplug and plug back in; Done tells the hub", () => {
    let told = 0
    server.onServerEvent('flasher.firmware.restarted', () => told++)
    render(<DevicePanel device={undefined} onReload={() => {}} />)
    hubSays(waitingForRst)
    const card = screen.getByTestId("firmware-press-reset").textContent
    expect(card).toContain("Press its RST button once")
    expect(card).toContain("do not hold FLASH")
    expect(card).toContain("or unplug the board and plug it back in")
    expect(card).toContain("The firmware is installed and checked")
    fireEvent.click(screen.getByTestId("firmware-restarted"))
    expect(told).toBe(1)
  })

  test("while it runs the dialog can be hidden, never locked, and shown again", () => {
    render(<DevicePanel device={undefined} onReload={() => {}} />)
    hubSays(waitingForRst)
    expect(screen.getByTestId("firmware-hide")).toBeEnabled()
    fireEvent.click(screen.getByTestId("firmware-hide"))
    fireEvent.click(screen.getByText("Show"))
    expect(screen.getByTestId("firmware-press-reset")).toBeInTheDocument()
  })

  test("on the page that started the install, Hide can be undone, and the board's advice from before is not shown meanwhile", () => {
    render(<DevicePanel device={board({ boardState: "otherFirmware" })} onReload={() => {}} />)
    hubSays(waitingForRst)
    fireEvent.click(screen.getByTestId("firmware-hide"))
    expect(screen.getByTestId("device-install-running").textContent).toContain("press its RST button once")
    expect(screen.queryByTestId("device-state-otherFirmware")).toBeNull()
    expect(screen.queryByTestId("device-firmware")).toBeNull()
    fireEvent.click(screen.getByText("Show"))
    expect(screen.getByTestId("firmware-press-reset")).toBeInTheDocument()
  })

  test("an install that ends with the firmware on the board: the panel waits for the board's first start", () => {
    // asking the hub again is up to whoever holds the board (useTallyDevice), so it happens on any step and once
    const reloads: any[] = []
    const { rerender } = render(<DevicePanel device={board({ boardState: "otherFirmware" })} onReload={o => reloads.push(o)} />)
    hubSays(job())
    hubSays(finished())
    expect(reloads).toEqual([])
    rerender(<DevicePanel device={undefined} onReload={o => reloads.push(o)} />)
    expect(screen.getByTestId("device-first-start").textContent).toContain("starting for the first time")
    expect(document.body.textContent).not.toContain("failed")
  })

  test("a restart the hub did not see is not a failure: the first start card asks for RST or plugging it in again", () => {
    render(<DevicePanel device={undefined} onReload={() => {}} />)
    hubSays(finished("timeout"))
    const text = screen.getByTestId("device-first-start").textContent
    expect(text).toContain("Firmware installed and checked")
    expect(text).toContain("unplug it and plug it back in")
    expect(text).not.toMatch(/failed|install it again/i)
  })

  test("an install that failed before the firmware was on the board says so, and can be closed", () => {
    render(<DevicePanel device={board({ boardState: "otherFirmware" })} onReload={() => {}} />)
    hubSays(job())
    hubSays(job({ running: false, progress: { phase: "error", percent: 0, message: "The board stopped answering during the install." } }))
    expect(screen.getByTestId("firmware-phase").textContent).toBe("Installing the firmware failed.")
    expect(screen.getByRole("dialog").textContent).toContain("hold the FLASH button")
    expect(screen.getByTestId("firmware-close")).toBeEnabled()
  })

  test("restarting right after an install that was read back: no install button, the power, cable and wiring instead", () => {
    const reloads: any[] = []
    render(<DevicePanel device={board({ boardState: "restarting", recentInstall: { path: "COM6", restart: "restarted", checks: 1 } })} onReload={o => reloads.push(o)} />)
    expect(screen.queryByTestId("device-firmware")).toBeNull()
    const alert = screen.getByTestId("device-state-restarting")
    expect(alert.textContent).toContain("installing it again would not change anything")
    expect(alert.textContent).toContain("plug in another board and press Check the other board")
    expect(screen.getByTestId("boot-reader")).toBeInTheDocument()
    // both buttons the text names are on the alert, where it is read
    expect(within(alert).getByTestId("device-check")).toBeInTheDocument()
    fireEvent.click(within(alert).getByTestId("device-other-board"))
    expect(reloads).toEqual([{ newBoard: true }])
  })

  test("silent after an install whose restart was not seen: unplug and plug back in, then Check again", () => {
    const reloads: any[] = []
    render(<DevicePanel device={board({ boardState: "silent", recentInstall: { path: "COM6", restart: "timeout", checks: 1 } })} onReload={o => reloads.push(o)} />)
    expect(screen.queryByTestId("device-firmware")).toBeNull()
    expect(screen.getByTestId("device-state-silent").textContent).toContain("Unplug the board and plug it back in, then press Check again")
    fireEvent.click(screen.getByTestId("device-check"))
    expect(reloads).toEqual([undefined])
  })
})

test("other pages show a running install the same way (the Flasher page uses this too)", () => {
  render(<InstallRunning job={{ path: "COM5", running: true, firstStart: false, progress: { phase: "erasing", percent: 4 } }} />)
  expect(screen.getByTestId("device-install-running").textContent).toContain("installing the NodeMCU firmware on COM5: Erasing the board…")
})
