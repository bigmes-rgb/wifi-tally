/**
 * @jest-environment node
 */
import fs from 'fs'

// Every settings change the hub makes must reach the browsers that show those settings. The Roland
// forms once kept showing the values from page load, and pressing Save there quietly undid the
// change, because server.ts forwarded every config.changed.* event except the two Roland ones.
// This fails when a settings event the browser listens for has no forwarder in server.ts.
test("every config.changed.<x> that has a config.state.<x> for the browser is forwarded by server.ts", () => {
  const read = (file: string) => fs.readFileSync(`${__dirname}/${file}`, "utf8")
  const emitted = new Set([...read("AppConfiguration.ts").matchAll(/emit\("config\.changed\.(\w+)"/g)].map(m => m[1]))
  const browserListens = new Set([...read("SocketEvents.ts").matchAll(/'config\.state\.(\w+)'/g)].map(m => m[1]))
  const forwarded = new Set([...read("../server.ts").matchAll(/SocketAwareEvent\(myEmitter, 'config\.changed\.(\w+)'/g)].map(m => m[1]))

  const needed = [...emitted].filter(name => browserListens.has(name))
  expect(needed).toEqual(expect.arrayContaining(["atem", "rolandV8HD", "rolandV60HD"]))
  expect(needed.filter(name => !forwarded.has(name))).toEqual([])
})
