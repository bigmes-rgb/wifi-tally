// The ESP8266's own ROM prints one message at every reset, at 74880 baud, before any firmware runs:
//
//   ets Jan  8 2013,rst cause:2, boot mode:(3,6)
//   load 0x40100000, len 27728, room 16 ... (only when it goes on to start the firmware)
//
// "boot mode" is what three pins read at that instant, and decides how the chip starts. It is the one
// thing that tells "the firmware does not start" apart from "the chip never tries to start it".

export interface BootMessage {
  rstCause?: number
  bootMode?: number // the first number: GPIO15 * 4 + GPIO0 * 2 + GPIO2
  starts: number // how many boot lines were seen (more than one: it keeps restarting)
  loads: boolean // the ROM loaded the firmware from flash
  waitingForHost: boolean // started in flashing mode, waiting for a flasher
}

export function parseBootMessage(text: string): BootMessage {
  const lines = [...text.matchAll(/rst cause:\s*(\d+),\s*boot mode:\s*\((\d),\s*(\d)\)/g)]
  const last = lines[lines.length - 1]
  return {
    rstCause: last ? parseInt(last[1], 10) : undefined,
    bootMode: last ? parseInt(last[2], 10) : undefined,
    starts: lines.length,
    loads: /load 0x[0-9a-f]+/i.test(text),
    waitingForHost: /waiting for host/i.test(text),
  }
}

export type BootVerdict = "noMessage" | "normal" | "restarting" | "flashingMode" | "d4Low" | "d8High"

export function bootVerdict(m: BootMessage): BootVerdict {
  if (m.bootMode === undefined) return "noMessage"
  if (m.bootMode >= 4) return "d8High"
  if (m.bootMode === 1 || m.waitingForHost) return "flashingMode"
  if (m.bootMode === 2 || m.bootMode === 0) return "d4Low"
  return m.starts >= 2 ? "restarting" : "normal"
}

// What it means for someone holding the board.
export const BOOT_ADVICE: Record<BootVerdict, string> = {
  noMessage: "No start-up message arrived. Press RST once while the hub listens; if nothing comes even then, the board is not powered or the cable carries no data.",
  normal: "The chip starts normally and hands over to the firmware. If nothing answers after that, the firmware itself does not start: install it again.",
  restarting: "The chip starts the firmware and then restarts, again and again. The firmware is damaged or does not suit this board: install it again.",
  flashingMode: "D3 (GPIO0) was low when the board started, so it started in flashing mode instead of running the firmware. Either FLASH was held, or something wired to D3 pulls it down (a common-cathode LED leg on D3 does). Release FLASH, and if something is on D3, unplug it and press RST again.",
  d4Low: "D4 (GPIO2) was low when the board started, so the chip did not start the firmware. A NeoPixel strip on D4 pulls it low when the strip itself has no power. Check the strip's + wire: on LoLin-style boards use the VU pin, VIN may carry no 5 V from USB. Unplug the D4 wire, press RST, and the board should start.",
  d8High: "D8 (GPIO15) was high when the board started, so the chip did not start the firmware. Something wired to D8 pulls it up: unplug it and press RST.",
}
