import Channel from '../domain/Channel'
import Tally from '../domain/Tally'

// Numbers as numbers ("2" before "10"), everything else by letter
const compareIds = (a: string, b: string) => {
  const na = Number(a), nb = Number(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
  return a.localeCompare(b, undefined, { numeric: true })
}

// The Tallies page in the order of the switcher's inputs: a light on input 1 first, then input 2, and so on, as the
// switcher lists them; lights on an input the switcher does not list after those, then lights on no input. Lights on
// the same input, and lights on no input, go by name. A light that is off keeps its place, so the page looks the
// same whether or not every light is on.
export function orderTallies(tallies: Tally[], channels: Channel[] = []): Tally[] {
  const position = new Map(channels.map((c, i) => [c.id, i]))
  const rank = (tally: Tally) => {
    if (tally.channelId === undefined) return 2
    return position.has(tally.channelId) ? 0 : 1
  }
  return [...tallies].sort((one, two) => {
    const r = rank(one) - rank(two)
    if (r !== 0) return r
    if (one.channelId !== undefined && two.channelId !== undefined && one.channelId !== two.channelId) {
      if (rank(one) === 0) return (position.get(one.channelId) as number) - (position.get(two.channelId) as number)
      return compareIds(one.channelId, two.channelId)
    }
    return one.name.localeCompare(two.name)
  })
}
