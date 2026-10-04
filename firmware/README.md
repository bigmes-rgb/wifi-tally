# NodeMCU firmware

The tally lights run the stock [NodeMCU firmware](https://github.com/nodemcu/nodemcu-firmware)
built with a fixed set of modules (`encoder,file,gpio,net,node,pwm2,struct,tmr,uart,wifi,ws2812`).
The Lua code in `../tally` is compiled to bytecode with a `luac.cross` from the same firmware
revision, so the two must always match.

## `prebuilt/`

`prebuilt/nodemcu-3.0-master_20200610-cfe68233-float.bin` is byte-for-byte the firmware that
upstream shipped in vTally 0.5.1 (taken from the `vtally@0.5.1` npm package, sha256
`eb95a77f999314aeae6feb601ae8c984e852c75af23a75c70cab8bec3b35855a`). The release workflow
copies it into every `vtally-<version>-esp8266.zip`.

It only needs rebuilding if the module list or the firmware revision changes. Until then, no
release depends on the firmware toolchain.

## Rebuilding

Upstream built it with the scripts from [nodemcu-custom-build](https://github.com/marcelstoer/nodemcu-custom-build)
(the same ones behind nodemcu-build.com) and `script.sh` in this directory. The easiest route is
still https://nodemcu-build.com/: pick branch `release` / the revision above, tick exactly the
modules listed, download the **float** build, and replace the file in `prebuilt/`. Update
`NODEMCU_FIRMWARE` in `.github/workflows/build.yml` at the same time so `luac.cross` matches.
