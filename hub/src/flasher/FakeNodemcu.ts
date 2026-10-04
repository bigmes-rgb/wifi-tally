// A pretend NodeMCU on a pretend USB port, used when the hub runs with --with-test
// so the "Build a light" pages can be walked through without hardware.
// It behaves like nodemcu-tool: files, device info, Lua execution, resets.
class FakeNodemcu {
  files: Record<string, Buffer> = {}
  executed: string[] = []
  private connected = false

  onError() {}
  isConnected() { return this.connected }
  async connect() { this.connected = true }
  async disconnect() { this.connected = false }
  async checkConnection() {}
  async listDevices() { return [{ path: "FAKE0", vendorId: "10c4", productId: "ea60" }] }
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
