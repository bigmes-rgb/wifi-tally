# Upcoming

This is the `bigmes-rgb/wifi-tally` fork. Releases are published on this repository's
[Releases page](https://github.com/bigmes-rgb/wifi-tally/releases) instead of npmjs.com.

* [BUGFIX] The wiring test failed lights whose board has no LED on D0, which is many boards,
  including the LoLin board it was found on. It asked whether "the small LED next to the USB socket"
  blinked, and read "No" as "the tally software is not running", even after the strip had just shown
  red, green and blue on cue. Next then stayed locked. The question is gone. It was never needed:
  every test colour goes through the tally program, and a board without that program answers the
  hub's first command with a Lua error naming it. The hub now recognises that answer and says
  "The tally software is not running on this light" by itself.
* [BUGFIX] A light that heard two hubs followed whichever spoke last, so it flickered between their
  states and printed "Found hub at …" for each, over and over. One computer on the network twice
  (cable and Wi-Fi) is enough to cause it. The light now stays with the first hub it hears, warns
  once that another hub is also sending, and moves on only if its own hub goes silent for 10 seconds.
  The flood also kept the light too busy to answer *Build a light*, which then called it a board
  without NodeMCU and offered to reinstall the firmware. The page now recognises a light hearing two
  hubs, names both addresses and says which case it is: this computer twice, or another computer
  running vTally. A light running its tally software that is slow to answer is no longer mistaken
  for one without firmware either. Found on a real board.
* [BUGFIX] *Build a light* only looked for boards with a CH340 or CP2102 chip and said "Did not find
  any connected device" for everything else. It now tries any USB serial port, preferring the known
  chips, and when it finds none it lists the ports the computer does see, so "Windows is not seeing
  the board" (cable, socket, driver) and "the board is there but unrecognised" are told apart.
* [BUGFIX] The wiring table, notes and guide said to power a NeoPixel strip from VIN. On LoLin-style
  boards VIN is dead while the board runs from USB; the strip then has no power, stays dark, and holds
  D4 low so the board does not even start. They now say VU on boards that have it, and warn that an
  unpowered strip stops the board starting. Found on a real board.
* [FEATURE] *Read the start-up message* on the "nothing answers" screen listens at 74880 baud while you
  press RST and translates the chip's own start-up line: starts normally, keeps restarting, started in
  flashing mode (D3 low), D4 held low (unpowered strip), or D8 held high.
* [FEATURE] Every firmware install is read back (MD5) and a bad write is reported as one.
* [BUGFIX] On boards whose automatic reset does not work (the ones that need FLASH and RST to install),
  the board stayed in flashing mode after *Install firmware* and the page waited minutes before saying
  "not saying anything". The install now listens for the board to restart; when it stays silent the
  install window says "Press the RST button on the board once" and carries on as soon as it does.
* [BUGFIX] Reading a board's info, running a command, listing files, uploading and downloading had no
  time limit (nodemcu-tool waits forever), so a board that stopped mid-reply could hold the USB port and
  freeze every later step. Each now gives up after a few seconds with a message.
* [FEATURE] The wiring test starts with a control: it blinks the small LED next to the board's USB
  socket and asks whether it blinks. No blink means the tally software is not running and the test
  says so, instead of blaming the wiring. It also says up front which lights and pins it will drive,
  so a step 1 left on the wrong light type is caught before testing.
* [CHANGE] A strip that stays dark while the board follows the hub gets the checks in order: data wire
  on the DIN end, shared GND, +5V on VIN, then the 3.3 V-signal test (power from 3V3 briefly) with the
  usual remedies.
* [CHANGE] The exact Lua the wiring test sends is pinned in tally/spec/fixtures and run through the
  real tally code by the Lua tests, so the hub and the tally software cannot drift apart unnoticed.
* [FEATURE] *On the network* (step 5 of Build a light) shows the light's own report while it is still
  on USB: settings read, Wi-Fi found, password accepted, address, hub found. When it stops it says
  why in words: network not seen (name or 5 GHz), password refused, another network than this
  computer's, or the hub not answering (Windows Firewall).
* [FEATURE] Before installing the tally software the hub checks that the light's firmware can run it
  (NodeMCU 3, float build, the modules it uses), so an existing light cannot be left dark. A light
  keeps its name and Wi-Fi when its firmware is reinstalled, and when going back a step to fix the
  password.
* [BUGFIX] After uploading, the hub restarted the board through the reset line, which some boards
  ignore, and could hang or crash if the board took more than 10 seconds to come back. It now
  restarts the board by command and waits for it with a limit.
* [BUGFIX] The Windows app unpacked to a new folder for every version, so Windows Firewall forgot its
  permission after each update and could silently block the lights. It now unpacks to the same folder.
* [CHANGE] Releases are published as soon as they are built; no draft to publish by hand.
* [CHANGE] Every build walks *Build a light* end to end in a browser against the pretend board, which
  now behaves like a real one (factory firmware, first start, Wi-Fi report). See
  `hub/e2e/build-a-light.js` and `docs/building-a-light.md`.
* [BUGFIX] After *Install firmware* reached 100 % the page said "nothing answers" and offered the install
  again. A freshly flashed board formats its storage on its first start and answers nothing for up to
  a couple of minutes. The page now says so and waits for it, then carries on by itself.
* [FEATURE] When a board does not answer, the hub listens to what it prints and says what that means:
  still setting up, keeps crashing (install again), running other firmware (install), or silent (press
  RST). What it printed is shown too.
* [BUGFIX] "Check again" could never recover once one check had timed out: nodemcu-tool leaves its reply
  listener queued and every later check failed with "concurreny error - receive listener already
  in-queue". The hub now nudges the board with a newline, which releases it.
* [BUGFIX] A failed firmware install blamed "serial noise or corruption" when the board had simply
  stopped answering; it now says that, and the tally-software dialog no longer opens during it.
* [FEATURE] *Build a light* draws the wiring for exactly what is selected: only the lights chosen, a
  strip with the number of pixels entered and where to cut it, an RGB LED with its common leg, and
  every wire from its board pin to its pad in the colour the pin table uses. The pin table is built
  from the same plan, so the two cannot disagree. *Print diagram and table* puts both on paper for
  the bench, and when the wiring test finds a fault it shows the drawing with the pins to check ringed.
  Replaces the four stock pictures, which showed a stage strip even when none was selected.
* [BUGFIX] The power note said a light needs "well under 200 mA". True for plain LEDs, not for strips:
  it now works out the current from the pixel count and asks for a 1 A charger.
* [BUGFIX] "Install firmware" stopped with "Could not auto-detect Flash size" on every ESP8266. The
  flashing library (esptool-js 0.7.0) programs the wrong SPI register on the ESP8266 when it asks
  the flash chip for its ID. The hub corrects that register map as soon as the chip is detected, and
  if the size still cannot be read it keeps the firmware image's own 1 MB setting instead of giving up.
* [BUGFIX] "Install firmware" in the Windows app failed at once with "Cannot find package
  'esptool-js'". The flashing library is an ES module and Node cannot import one from inside the
  packed app. The build now ships it as a plain bundle next to the flasher.
* [BUGFIX] When looking for the board failed outright (e.g. the serial driver could not load), the
  error was lost on the way to the browser and the page looked like "no ports". The error is shown.
* [BUGFIX] The Roland V-8HD connection tried once at start-up and gave up. If the switcher was off,
  unplugged, or its MIDI port was held by the Roland remote software at that moment, the hub stayed
  disconnected until restarted. It now keeps looking every few seconds, reconnects on its own, notices
  when the switcher stops answering, and the Tallies page says *why* it is not connected.
* [BUGFIX] Starting a second vTally while one is running showed a wall of stack trace. It now says
  "vTally is already running" and what to do.
* [FEATURE] The hub installs the NodeMCU firmware on a board straight from the box, over USB, from
  *Build a light*. No separate flashing tool any more. Uses Espressif's esptool-js with the same
  settings as NodeMCU PyFlasher (DIO, 40 MHz, size detected).
* [FEATURE] *Build a light*: one page takes a bare board to a tested light on the network. Say what is
  soldered on (RGB LED with common + or −, NeoPixel strip, optional stage light) and get the exact pin
  table for it; plug it in; **wiring test** — the hub lights each colour through the USB cable and asks
  what you see, then tells you which wire to move, or corrects the common-pin and pixel-order settings
  itself; name and Wi-Fi; then it waits until the light reports in. The tally software gained a test
  mode for this (`_G.testMode`), so update the lights' software to use the wiring test.
* [BUGFIX] Saving settings to a light over USB refused to run without a hub IP, although the IP has been
  optional since the lights learned to find the hub themselves. The wizard's *Save to the light* hit this.
* [FEATURE] Setup wizard. A hub that has never been configured opens with it; afterwards it lives under
  *Setup* in the menu. It walks through the video switcher, shows the hub's own network addresses, and
  sets up lights one after another: plug a board in via USB, install the tally software if needed, type a
  name and the Wi-Fi, done. No addresses to type in. *Add a light* on the Tallies page jumps straight to
  that step.
* [BUGFIX] Asking for the USB-connected tally crashed the hub when it was started without the tally
  software bundle next to it. It now reports that the bundle is missing instead.
* [FEATURE] Tallies find the hub on their own. `hub.ip` in `tally-settings.ini` is now optional: without
  it the tally announces itself to the whole network and remembers whichever hub answers. If the hub's
  address changes, the tally notices within 10 seconds and searches again. Needs the tally software
  (`.lc` files) from this release on the tally.
* [FEATURE] A single GitHub Actions workflow builds the hub, the Windows desktop app and the
  tally firmware bundle, and attaches all three to a GitHub Release when a `v*` tag is pushed.
  The Electron wrapper from `wifi-tally/electron-dist` now lives in `electron/`.
* [FEATURE] The NodeMCU firmware binary shipped with v0.5.1 is checked in under `firmware/prebuilt/`,
  so a release no longer needs the firmware toolchain unless the firmware itself changes.

* [BUGFIX] Don't suggest vMix is connected until a hello message is received and tally subscription was acknowledged #85
* [BUGFIX] The logs where written with the path segment `vally-electron`, missing a `t` that is essential to our name. It is now fixed an the files are now:
  * **on Linux**: ~/.config/vtally-electron/logs/main.log
  * **on macOS**: ~/Library/Logs/vtally-electron/main.log
  * **on Windows**: %USERPROFILE%\AppData\Roaming\vtally-electron\logs\main.log

# v0.5.1

* [BUGFIX] Atem did not work when using the Electron distribution #78
* [FEATURE] Improved support when editing scenes in OBS #87 (Thanks, @Fuechschen)
* [FEATURE] When using the Electron distribution, logs are written to a file (please note that the path of the files is wrong in this release and called `vally` instead of `vtally` #93 ):
  * **on Linux**: ~/.config/vally-electron/logs/main.log
  * **on macOS**: ~/Library/Logs/vally-electron/main.log
  * **on Windows**: %USERPROFILE%\AppData\Roaming\vally-electron\logs\main.log

# v0.5.0

Code on the Tally did not change.

* [BREAKING] way of installation has changed. We ship platform specific executables now.
  See [Download Instructions](https://wifi-tally.github.io/download.html) for details.
* [FEATURE] support for Roland V-8HD and V-60HD. Thanks @JWandscheer #58
* [FEATURE] The project got a new name and a logo. Say hello to `vTally` and enjoy the new logo in the GUI.
* [FEATURE] experimental support to edit `tally-settings.ini` and flash the code from the Hub via USB
* [FEATURE] The hub automatically tries to restart in case it crashes. Consider this a safety net: It should never be necessary
  – if it is, please file an issue – but there might be cases where it helps.
* [FEATURE] All releases are published to [npmjs.com](https://www.npmjs.com/package/vtally)

# v0.4.2

A minor feature and maintenance release.

Code on the Tally did not change from `v0.4.1`.

* [ADDED] allow to dim operator light to 1% brightness #57
* [CHANGED] npm dependencies of the hub updated

# v0.4.1

A minor feature and bugfix release.

You only need to update the code on the Tally if you plan on using the new feature
that supports red-green-blue WS2812 light.

* [ADDED] the dim green light for the operator, that indicates the tally is working, can be turned off #50
* [ADDED] support WS2812 leds with red-green-blue order #52
* [CHANGED] npm dependencies of the hub updated
* [BUGFIX] add `init.lua` to the release package. For some reason it got lost along the way

# v0.4.0

**IMPORTANT**: Code on the Tally **HAS** changed. Tallies and the Hub will not be able to communicate
unless you also update the `.lc` files on the Tallies.

* [BREAKING] The protocol between Tally and Hub has been modified. The hub now sends specific information on what colors to show. This step was necessary because we reached the memory limit on NodeMCU with the newly added features.
* [ADDED] Tallies can use a pink-yellow color scheme to be better distinguishable for people with a red-green weakness (Protanopia, Deuteranopia)
* [ADDED] Tallies can be dimmed and the stage light can be turned off completely
* [ADDED] Tallies have an option to hide preview state on the stage light.
* [ADDED] All of the settings above can be changed for ALL Tallies or on a per-Tally basis.
* [ADDED] OBS support to only show on-air status when actually recording or streaming. The Tally Lights will show up as "in preview" when this is not the case.

# v0.3.0

A feature release.

Code on the Tally did not change. If you are doing an upgrade there is no need to
modify the Tallies.

* [ADDED] The Hub allows to turn any device with a browser into a Tally Light ("Web Tally")
* [CHANGED] We recommend updating Node.js to version `14`. The hub will still run with Node.js `12` in the foreseeable future though.
* [CHANGED] Documentation has been cleaned up and the Getting Started Guide has a different order now

# v0.2.1

* [BUGFIX] Tallies and their configuration are stored again

# v0.2.0

There have been numerous technical changes on the hub and the way the release
is built under the hood. One of the results is, that the release packages are now
significantly smaller. We made sure that nothing broke, but if you spot anything
please report it.

Code on the Tally did not change. If you are doing an upgrade there is no need to
modify the Tallies.

* [ADDED] Support for OBS added #27
* [CHANGED] the release size has been reduced significantly. This should speed up download and extraction by a magnitude
* [CHANGED] replaced the UI framework (from bootstrap to MaterialUI). There are some minor changes in the UI, but the general flow stayed the same
* [CHANGED] npm dependencies of the hub updated
* [OTHER] TravisCI, the service we used to build the release packages, has basically discontinued its Open Source support. So the release is now built with Github Actions. This is nothing that you would see when using the software, but still worth mentioning.

# v0.1.0

* [BREAKING] location where the hub stores its configuration has been changed from `hub/config.json` to `$HOME/.wifi-tally.json` #21
* [BREAKING] Pins for Stage Light have been moved from `D2-D4` to `D1-D3`
* [BREAKING] The firmware is no longer part of the repository and will be built on Travis. If you need a firmware for development, get it from the latest release. #25
* [BREAKING] The firmware needs to be updated as the `ws2812` module was added
* [FIXED] prevent hub from crashing on invalid message #19
* [FIXED] hub does boot even if the configuration is empty
* [ADDED] Support for vMix added #12
* [ADDED] the hub does not use generic channel names (like `Channel 1`) if the video mixer has a name configured
* [ADDED] the channel drop-down in the hub is limited to the number of channels supported by the video mixer
* [ADDED] the web page shows if it has lost connection to the hub and reloads #20
* [ADDED] allow the use of LEDs with common cathode #31
* [ADDED] allow the use of WS2812 strips, NeoPixel and the like #29
* [ADDED] better log if it looks as if Atem rejected a connection #16
* [CHANGED] use cross-env to allow hub to run on windows #18
* [CHANGED] npm dependencies of the hub updated
* [CHANGED] firmware version of the tally updated
* [CHANGED] tallies that are not patched in the hub now do not show the "video mixer not connected" error

# v0.1-alpha4

* [FIXED] Compiled `lc` files in the release are working again. #24
* [ADDED] The hub shows indications if the video mixer is connected. #15

# v0.1-alpha3

* [BREAKING] The tallies name is trimmed to `26` characters.
* [BREAKING] Pinout of the tally was changed. See updated documentation. #5
* [FIXED] Following links on the hub is now possible when using the web interface on the machine that runs the hub #1
* [FIXED] Tally sanitizes its hostname if it contains spaces or is longer than 32 characters
* [ADDED] Tally logs the boot reason when starting. This could help determine if the tally crashed (which it never does of course ;) ) or the wifi signal was lost
* [ADDED] Tally buffers up to 10 log messages if the hub is not available. This helps detecting issues once the wifi connection is re-established.
* [ADDED] A separate LED can be used for the operator light on the tally #2
* [ADDED] the operator light is dimly glowing green when everything is connected, but the camera is neither on preview nor program. #7
* [ADDED] the NodeMCU onboard LED indicates if the board is powered and the code started
* [ADDED] Tally indicates if the settings.ini is invalid by blinking blue #11
* [CHANGED] Tally reconnects faster to wifi (`200ms`) when auth timed out, because it indicates low signal strength
* [CHANGED] Logs are better categorized as info, warning and error
