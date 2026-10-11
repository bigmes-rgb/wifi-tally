LUAC?="luac.cross"
NODEMCU_TOOL?="nodemcu-tool"
BUSTED?="busted"

FILES=$(wildcard src/*.lua)
SOURCES=$(filter-out src/init.lua,$(FILES))
TARGETS=$(patsubst src/%.lua,out/%.lc,$(SOURCES))
# the size of the flash area for Lua (LFS) in the firmware in ../firmware/prebuilt ("LFS: 0x15000 bytes")
LFS_SIZE=0x15000

.PHONY: test build flash flash-dev flash-prod clean unflash

test: build
	# if it compiles it is syntactically valid
	$(LUAC) -o /dev/null src/init.lua
	$(BUSTED)

out:
	mkdir -p out/
out/tally-settings.ini: tally-settings.ini out
	cp $< $@
out/tally-settings.ini.example: tally-settings.ini.example out
	cp $< $@

out/init.lua: src/init.lua out
	cp $< $@

# -s: no debug info (local names, line numbers). NodeMCU keeps whatever a .lc carries in RAM, and the
# light has little of it: 0.9.12 grew too big and the light stopped answering. spec/memory_spec.lua
# keeps an eye on the size. Errors on the light show "?" instead of a line number.
out/%.lc: src/%.lua out
	$(LUAC) -s -o $@ $<

# The light program for the board's flash (LFS): init.lua loads it once and runs it from there, which keeps the
# code out of the board's RAM. gen/lfs-stamp.lua is a module in the image that says which build it is; lfs.stamp,
# next to it, says which build the files are. The .lc files stay as the fallback. gen/ is not uploaded to boards.
gen:
	mkdir -p gen/
gen/lfs-stamp.lua: $(SOURCES) gen
	printf 'return "%s"\n' "$$(cat $(SOURCES) | sha256sum | cut -c1-16)" > $@
out/lfs.stamp: gen/lfs-stamp.lua out
	sed -n 's/^return "\(.*\)"$$/\1/p' $< | tr -d '\n' > $@
out/lfs.img: $(SOURCES) gen/lfs-stamp.lua out
	$(LUAC) -f -s -m $(LFS_SIZE) -o $@ $(SOURCES) gen/lfs-stamp.lua

build: $(TARGETS) out/init.lua out/tally-settings.ini.example out/lfs.img out/lfs.stamp

flash: flash-dev

flash-dev: build out/init.lua out/tally-settings.ini
	$(NODEMCU_TOOL) upload $(TARGETS) out/tally-settings.ini
	# prevent endless reboot
	$(NODEMCU_TOOL) remove init.lua
	$(NODEMCU_TOOL) upload --remotename _init.lua out/init.lua
	$(NODEMCU_TOOL) reset
	sleep 1
	$(NODEMCU_TOOL) terminal --run _init.lua

flash-prod: build out/init.lua out/tally-settings.ini
	$(NODEMCU_TOOL) remove _init.lua
	$(NODEMCU_TOOL) upload $(TARGETS) out/tally-settings.ini out/init.lua
	$(NODEMCU_TOOL) reset

clean:
	rm -rf out/ gen/

unflash:
	$(NODEMCU_TOOL) mkfs
