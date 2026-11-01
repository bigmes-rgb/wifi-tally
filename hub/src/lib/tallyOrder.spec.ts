import Channel from '../domain/Channel'
import { UdpTally } from '../domain/Tally'
import { orderTallies } from './tallyOrder'

const light = (name: string, channelId?: string) => new UdpTally(name, channelId)
const names = (tallies: ReturnType<typeof light>[]) => tallies.map(t => t.name)

test("lights follow the order of the switcher's inputs, whatever they are called", () => {
  const channels = [new Channel("1", "Cam Wide"), new Channel("2", "Pulpit"), new Channel("3"), new Channel("10")]
  const ordered = orderTallies([light("Zed", "10"), light("Pulpit", "2"), light("Wide", "1"), light("Side", "3")], channels)
  expect(names(ordered)).toEqual(["Wide", "Pulpit", "Side", "Zed"])
})

test("lights on no input come last, by name; lights on an input the switcher does not know come between", () => {
  const channels = [new Channel("1"), new Channel("2")]
  const ordered = orderTallies([light("Spare B"), light("Old", "7"), light("Spare A"), light("Main", "2"), light("Older", "12")], channels)
  expect(names(ordered)).toEqual(["Main", "Old", "Older", "Spare A", "Spare B"])
})

test("two lights on one input go by name, and a light that is off keeps its place", () => {
  const channels = [new Channel("1"), new Channel("2")]
  const off = light("Alpha", "1")
  const ordered = orderTallies([light("Beta", "1"), light("Second", "2"), off], channels)
  expect(names(ordered)).toEqual(["Alpha", "Beta", "Second"])
})

test("without a channel list, inputs sort as numbers: 2 before 10", () => {
  const ordered = orderTallies([light("Ten", "10"), light("Two", "2"), light("One", "1")])
  expect(names(ordered)).toEqual(["One", "Two", "Ten"])
})
