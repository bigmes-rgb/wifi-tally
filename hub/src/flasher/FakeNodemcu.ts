import { FirmwarePhase, FlashFirmwareFn } from './FirmwareFlasher'
import { HeardFromBoard, ListenOptions } from './BoardListener'

// A pretend NodeMCU on a pretend USB port, used when the hub runs with --with-test
// so the "Build a light" pages can be walked through without hardware.
// It behaves like nodemcu-tool: files, device info, Lua execution, resets.
class FakeNodemcu {
  files: Record<string, Buffer> = {}
  executed: string[] = []
  // a board straight from the box has no NodeMCU firmware: nothing answers until it is flashed
  flashed = false
  // like a real board, the first start after flashing formats the file system and answers nothing
  firstStartUntil = 0
  private connected = false

  onError() {}
  isConnected() { return this.connected }
  async connect() { this.connected = true }
  async disconnect() { this.connected = false }
  async checkConnection() {
    if (!this.flashed) { throw new Error("No response detected - is NodeMCU online and the Lua interpreter ready ?") }
    if (Date.now() < this.firstStartUntil) { throw new Error("Timeout, no response detected - is NodeMCU online and the Lua interpreter ready ?") }
  }
  async listDevices(_showAll?: boolean) { return [{ path: "FAKE0", vendorId: "10c4", productId: "ea60" }] }
  async deviceInfo() {
    return { chipID: "fake1234", flashID: "1640ef", version: "3.0.0", modules: "encoder,file,gpio,net,node,pwm2,struct,tmr,uart,wifi,ws2812" }
  }
  async fsinfo() {
    return { files: Object.entries(this.files).map(([name, content]) => ({ name, size: content.length })) }
  }
  async download(name: string) { return this.files[name] ?? Buffer.from("") }
  async upload(local: string, remote: string) {
    // bytes, not text: the .lc files are binary and the hub compares sizes
    this.files[remote] = require('fs').readFileSync(local)
  }
  async execute(cmd: string) {
    this.executed.push(cmd)
    const rename = cmd.match(/file\.rename\("([^"]+)", "([^"]+)"\)/)
    if (rename) { this.files[rename[2]] = this.files[rename[1]]; delete this.files[rename[1]] }
    const remove = cmd.match(/file\.remove\("([^"]+)"\)/)
    if (remove) { delete this.files[remove[1]] }
    return { response: "ok" }
  }
  async hardreset() {}
  async softreset() {}
}

export default FakeNodemcu

// Pretends to flash the firmware: a few seconds of progress, then the board answers.
export const fakeFlashFirmware = (fake: FakeNodemcu): FlashFirmwareFn => async ({ onProgress }) => {
  const step = (phase: FirmwarePhase, percent: number, message?: string) => onProgress({ phase, percent, message })
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  step("connecting", 2, "Looking for the board")
  await sleep(500)
  for (let percent = 5; percent <= 95; percent += 15) {
    step("writing", percent)
    await sleep(200)
  }
  step("restarting", 96)
  await sleep(300)
  fake.flashed = true
  fake.firstStartUntil = Date.now() + 6000
  step("done", 100, "Firmware installed")
  return true
}

// What the pretend board prints: the ROM's boot line and "ready" from the factory firmware, then
// after flashing NodeMCU's formatting message, then its prompt.
export const fakeListen = (fake: FakeNodemcu) => async ({ ms }: ListenOptions): Promise<HeardFromBoard> => {
  const sleep = (t: number) => new Promise(resolve => setTimeout(resolve, t))
  if (!fake.flashed) return { text: "·ets Jan  8 2013,rst cause:2, boot mode:(3,6)·\r\nready\r\n", sawPrompt: false, bytes: 60 }
  const formatting = "Formatting file system. Please wait...\r\n"
  const wait = Math.max(0, fake.firstStartUntil - Date.now())
  if (wait > ms) {
    await sleep(ms)
    return { text: formatting, sawPrompt: false, bytes: formatting.length }
  }
  await sleep(wait)
  const text = formatting + "NodeMCU 3.0.0.0 built with Docker\r\n> "
  return { text, sawPrompt: true, bytes: text.length }
}
