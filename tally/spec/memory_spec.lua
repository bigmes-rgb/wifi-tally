-- Since 0.9.17 the program runs from the board's flash (see src/init.lua) and takes almost no RAM. The .lc
-- files are the fallback when the flash holds no usable image, and this test keeps that fallback small.
--
-- The light has about 40 KB of RAM for Lua, and the program it loads at start-up takes a good part of
-- it. Upstream ran into that limit once (v0.4.0 moved work to the hub because of it). 0.9.12 grew the
-- program from 19792 to 22810 bytes of bytecode, and the light stopped answering after a restart and
-- never stayed on the hub: by all signs out of memory.
--
-- This compiles the start-up program exactly as a release does (luac.cross -s, see the Makefile) and
-- adds up the bytes the board loads into RAM. It may not be more than 0.9.11 loaded, the last version
-- known to work. Code needed only now and then belongs in its own file, loaded when needed and dropped
-- afterwards, like my-wifi-handover.lua. The light also reports its free memory in its boot line,
-- which the hub logs.
local budgetBytes = 19792 -- 0.9.11

-- what my-app.lua requires at start-up, and my-app itself; every other src file is loaded on demand
local bootModules = { "my-app", "my-led", "my-log-buffer", "my-log", "my-settings", "my-tally", "my-wifi" }

local luac = os.getenv("LUAC") or "luac.cross"

local available = function()
    local pipe = io.popen(luac .. " -v 2>&1")
    local version = pipe and pipe:read("*a") or ""
    if pipe then pipe:close() end
    return version:find("Lua 5.1", 1, true) ~= nil
end

describe("the light program's memory", function()
    it("is no bigger than 0.9.11's, the last version known to fit", function()
        if not available() then
            pending("luac.cross is not installed here (the release build has it)")
            return
        end
        local tmp = os.tmpname()
        local total, sizes = 0, {}
        for _, module in ipairs(bootModules) do
            assert.is_true(os.execute(luac .. " -s -o " .. tmp .. " src/" .. module .. ".lua") == 0, "could not compile " .. module)
            local f = io.open(tmp, "rb")
            local size = f:seek("end")
            f:close()
            total = total + size
            table.insert(sizes, module .. " " .. size)
        end
        os.remove(tmp)
        assert.is_true(total <= budgetBytes, string.format(
            "The light loads %d bytes of program at start-up, more than the %d that still fit (%s). Make it smaller, "
            .. "or move code that is needed only now and then into a file loaded on demand.",
            total, budgetBytes, table.concat(sizes, ", ")))
    end)
end)
