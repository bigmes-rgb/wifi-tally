-- The hub's wiring test drives a running tally with short Lua commands over USB (see
-- hub/src/flasher/HardwareProfile.ts). fixtures/wiring-test-strip.txt holds exactly what the hub
-- sends for a 5-pixel strip, in order: the profile, dark, red, end of test. The hub's own test fails if those commands change. This runs them through the real
-- tally code, appending '; print("ok")' as the hub does, and checks what the LEDs get.

local function readFixture()
    local lines = {}
    for line in io.lines("spec/fixtures/wiring-test-strip.txt") do table.insert(lines, line) end
    return lines
end

local function run(line, printed)
    local chunk, err = loadstring(line .. '; print("ok")')
    assert.is_nil(err, line)
    local realPrint = print
    _G.print = function(...) table.insert(printed, table.concat({...}, " ")) end
    chunk()
    _G.print = realPrint
end

describe("wiring test commands from the hub", function()
    insulate("a 5-pixel operator strip", function()
        require "spec.nodemcu-mock"
        require "src.my-settings"
        require "src.my-led"

        local lines = readFixture()
        local printed = {}
        for i = 1, 5 do run(lines[i], printed) end -- profile, dark, red
        local red = _G.ws2812:getDataAt(0)

        run(lines[6], printed) -- end of test

        it("every command runs and answers ok", function()
            assert.is_same({"ok", "ok", "ok", "ok", "ok", "ok"}, printed)
        end)
        it("writes red to all five pixels, in GRB order", function()
            assert.is_same({
                --g  r    b
                0, 255, 0,
                0, 255, 0,
                0, 255, 0,
                0, 255, 0,
                0, 255, 0,
            }, red)
        end)
        it("ends the test mode", function()
            assert.is_nil(_G.testMode)
        end)
    end)
    insulate("a board without the tally program", function()
        -- the hub's tallyNotRunning() recognises this answer and says so, instead of asking the
        -- person to judge an LED
        it("fails the first command with an error that names MySettings", function()
            local chunk = loadstring(readFixture()[1] .. '; print("ok")')
            local ok, err = pcall(chunk)
            assert.is_false(ok)
            assert.truthy(err:find("attempt to index global 'MySettings' (a nil value)", 1, true))
        end)
    end)
end)
