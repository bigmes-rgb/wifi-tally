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

## The five steps

1. **What is on the board.** Pick what is soldered on: an RGB LED, with common + or common −, or
   a NeoPixel strip and its number of pixels. Do the same for the optional stage light. The
   drawing and the pin table show exactly those parts and wires. *Print diagram and table* puts
   both on paper for the bench.
2. **Plug it in.** The hub finds the board and says what it found:
   - *Runs something other than the NodeMCU firmware* is a board from the box. Press
     **Install firmware**. If that cannot reach the board, hold FLASH, tap RST, release FLASH
     and press it again.
   - *Firmware installed, starting for the first time.* The board is formatting its storage,
     which takes up to two minutes. Leave it alone; the page carries on by itself.
   - *Found a light … not set up yet* or *named …*: press **Install now** for the tally software.
   - *This light runs NodeMCU …* or *lacks the module …*: its firmware cannot run the tally
     software. Install the firmware first. Its name and Wi-Fi come back at step 4.
   - *Keeps crashing*, *not saying anything*, *setting up its storage*: follow the advice
     shown. **What the board printed** shows the board's own words.
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

## Existing lights

Run each through the same steps, between services. Step 2 reads the light's name, Wi-Fi and
hardware, and checks that its firmware can run the current tally software before installing
anything.
