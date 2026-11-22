/**
 * @jest-environment node
 */
import TallyContainer from './TallyContainer'
import ServerEventEmitter from '../lib/ServerEventEmitter'
import { AppConfiguration } from '../lib/AppConfiguration'
import WebTallyDriver from './WebTallyDriver'

// a phone's open page, as the driver sees it
const fakePage = (id: string) => {
  const said: any[] = []
  const socket: any = {
    id, connected: true, handshake: { address: "192.168.1.40" },
    emit: (...args: any[]) => said.push(args),
    on: () => {},
  }
  return { socket, said }
}

const setUp = () => {
  const emitter = new ServerEventEmitter()
  const configuration = new AppConfiguration(emitter)
  const container = new TallyContainer(configuration, emitter)
  const driver = new WebTallyDriver(configuration, container)
  return { configuration, container, driver }
}

test("a phone renamed by the director keeps its input and its open page, which is told the new name", () => {
  const { container, driver, configuration } = setUp()
  driver.create("Phone 1", "3")
  const page = fakePage("a")
  driver.subscribe("Phone 1", page.socket)
  expect(container.get("Phone 1", "web")?.isConnected()).toBe(true)

  driver.rename("Phone 1", "Balcony")
  expect(container.get("Phone 1", "web")).toBeUndefined()
  const renamed = container.get("Balcony", "web")
  expect(renamed?.channelId).toBe("3")
  expect(renamed?.isConnected()).toBe(true)
  expect(configuration.getTallies().map(t => t.name)).toEqual(["Balcony"])
  expect(page.said).toContainEqual(['webTally.renamed', { from: "Phone 1", to: "Balcony" }])
  // its state keeps coming under the new name
  expect(page.said.filter(([event, data]) => event === 'webTally.state' && data.tally.name === "Balcony").length).toBeGreaterThan(0)
})

test("a phone removed by the director is told so, even while it is on", () => {
  const { container, driver } = setUp()
  driver.create("Phone 2", undefined as any)
  const page = fakePage("b")
  driver.subscribe("Phone 2", page.socket)
  driver.remove("Phone 2")
  expect(container.get("Phone 2", "web")).toBeUndefined()
  expect(page.said).toContainEqual(['webTally.invalid', "Phone 2"])
})
