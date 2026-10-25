# Building a light

How a light goes from a bare NodeMCU board to a working tally, what each screen in
**Setup → Build a light** means, and what to do when one says something is wrong.

## Before you start

- **The computer:** the one that runs vTally Hub. The board plugs into it by USB.
- **The cable:** a USB *data* cable. Many micro-USB cables only charge. With one of those the
  board's LED lights but Windows never sees it. Test the cable with a phone first if in doubt.
- **The driver:** most boards have a CH340 USB chip. Windows usually installs the driver by itself.
  If Device Manager shows a yellow triangle, install CH341SER from wch-ic.com.
- **The Wi-Fi:** a 2.4 GHz network with a plain password (WPA2-Personal), on the same network as
  this computer. These boards cannot use 5 GHz or username-and-password networks.
- **Windows Firewall:** the first time a new vTally starts, Windows asks whether to allow it on
  networks. Allow it, including on Private networks. Without that the lights cannot reach the hub.

- **Strip power:** a NeoPixel strip's +5V goes to **VU** and its GND to the **G** right next to it,
  as the wiring diagram shows (LoLin boards). Boards without VU and G there (Amica) use **VIN** and a
  GND pin instead. On LoLin boards VIN can be dead while the board runs from USB. A strip
  without power holds D4 low, and then the board does not start at all: it prints one garbled
  line and stops. Unplug the D4 wire and press RST to check.

## The five steps

1. **What is on the board.** Pick what is soldered on: an RGB LED, with common + or common −, or
   a NeoPixel strip and its number of pixels. Do the same for the optional stage light. The
   drawing and the pin table show exactly those parts and wires. *Print diagram and table* puts
   both on paper for the bench. The common builds are drawn in [Wiring a light](wiring.md).
2. **Plug it in.** The hub finds the board and says what it found:
   - *Runs something other than the NodeMCU firmware* is a board from the box. Press
     **Install firmware**. If that cannot reach the board, hold FLASH, tap RST, release FLASH
     and press it again. The install erases the whole board first (up to a minute), so nothing
     of what was on it before is left, writes the firmware, reads it back to check it, then
     restarts the board by itself.
   - *Press its RST button once, or unplug the board and plug it back in*: the firmware is on
     the board and checked, but the board did not restart by itself. Do either (not FLASH), then
     press **Done**. If you do nothing, the install still finishes after half a minute: it is
     never reported as failed once the firmware was checked.
   - The install runs in the hub, not in the page. You can hide its window (**Show** brings it back),
     or reload the page: the page goes back to *Plug it in* and shows the install where it is, and
     keeps what you chose at step 1.
   - *Firmware installed, starting for the first time.* The board is formatting its storage,
     which takes up to two minutes. Leave it alone; the page carries on by itself. If the hub has
     not seen the board restart, the box says so: press RST once, or unplug the board and plug it
     back in. If Windows gives it another COM port when it comes back, the hub finds it there.
   - *Found a light … not set up yet* or *named …*: press **Install now** for the tally software.
     The light restarts twice: once after the files arrive, and once more after it has loaded the
     program into its flash, where it runs from then on.
   - *This light runs NodeMCU …* or *lacks the module …*: its firmware cannot run the tally
     software. Install the firmware first. Its name and Wi-Fi come back at step 4.
   - *Starts, but something restarts it over and over*: the NodeMCU firmware works, and the light
     program on the board, its settings, its power or someone pressing RST restarts it. Press
     **Install firmware**: the install erases the board, which clears the program and settings.
   - *Keeps crashing*: press **Install firmware**; it erases the board, which clears the program and
     settings, then puts a fresh NodeMCU on it.
   - *Not saying anything*: unplug the board and plug it back in, or press RST once, and press
     **Check again**. If it stays silent, install the firmware.
   - *Setting up its storage*: wait a minute and press **Check again**.

   After an install that was checked, the page never offers the same install again for the same
   problem: installing again could not change anything. If the hub did not see the board restart, it
   asks you once to unplug the board and plug it back in; then to unplug the LED wires and try another
   USB cable and socket; and last to plug in another board and press **Check the other board**, so
   the hub treats it as a new one (**Build another light** does the same). A board that answered
   after the install and starts restarting once the light program is on it usually lacks power for
   its LEDs and Wi-Fi; the page says what to try, and does not send it round the install again. The
   hub remembers the install for 12 hours, also when vTally is closed and opened again. **What the board printed** shows the board's own words, and **Read
   the start-up message** shows what the chip itself says when you press RST.
3. **Wiring test.** The hub lights each colour through the USB cable and asks what you see. It
   tells you which wire to move, or fixes the common-pin and pixel settings itself.
4. **Name and Wi-Fi.** A name (the camera's works well), the Wi-Fi name and password. No hub
   address: the light finds the hub on its own.
5. **On the network.** Keep the light plugged in. It restarts and reports, step by step, how it
   joins the Wi-Fi and finds the hub. When something stops it, the page says what:
   - *Cannot see the network* means a misspelled name, or the network is 5 GHz.
   - *Refused the password* means the password is wrong, or the network needs a username.
   - *Different networks* means the light is on another network than this computer, such as a
     guest Wi-Fi.
   - *The hub does not answer* usually means Windows Firewall is blocking vTally Hub.

   When it says it found the hub, unplug it and mount it.

## When you ask for help

The hub writes down what happened to each board: every check (the COM port, what the board
printed, the advice the page showed), every step of a firmware install and how the board's
restart was noticed, and pages opened and closed. In the Windows app the file is
`%APPDATA%\vtally-electron\logs\main.log`. Send that file along with a description of what you did.

## Existing lights

Run each through the same steps, between services. Step 2 reads the light's name, Wi-Fi and
hardware, and checks that its firmware can run the current tally software before installing
anything.

## Renaming a light

On the Tallies page, open the light's menu (the three dots) and choose **Rename**. The light has to be
on the network. It saves the new name, restarts, and comes back under it within a few seconds; its
channel and settings stay as they are. A light that is off is named over USB, in Build a light, step 4.
Lights need "Install now" once (0.9.18 or later) to understand the rename.

## Changing the church's Wi-Fi

Before you change the router's network name or password, open **Configuration → Wi-Fi of the
lights** with every light switched on, type the new name and password, and press **Send**. Each light
saves it and keeps working on the current network. When you switch the router over, the lights join
the new network by themselves, and go back to the old one if they cannot. Lights that were off at the
time are listed as not reached: plug those into the hub's computer and save the new Wi-Fi in Build a
light.
