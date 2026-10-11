-- The light has about 40 KB of RAM free for Lua, and the loaded program takes most of it. Upstream ran into
-- that limit once (v0.4.0 moved work to the hub because of it). Then 0.9.12 added Wi-Fi handover code,
-- and the light stopped answering after a restart and never reached the hub. Since 0.9.13 the .lc
-- files are compiled without debug info (Makefile: luac.cross -s), which NodeMCU would otherwise keep
-- in RAM.
--
-- This measures what the stripped program takes once loaded, with the host's Lua 5.1, so growth shows
-- up here and not in the booth. The numbers are not the board's (64-bit pointers, a different line
-- table) but they move together. Measured by this test:
--   0.9.11, with debug info:    46.5 KB  worked
--   0.9.12, with debug info:    53.5 KB  stopped answering, by all signs out of memory
--   0.9.13, without debug info: 35.9 KB
-- 40 KB stripped is still about what 0.9.11 took on the board. The board itself says how much memory
-- is free in its boot line, which the hub logs: trust that over this estimate.
local budgetKb = 40

local bootModules = { "my-log-buffer", "my-log", "my-settings", "my-led", "my-tally", "my-wifi", "my-app" }

local findLuac = function()
    for _, name in ipairs({ "luac5.1", "luac" }) do
        local pipe = io.popen(name .. " -v 2>&1")
        local version = pipe and pipe:read("*a") or ""
        if pipe then pipe:close() end
        if version:find("Lua 5.1", 1, true) then return name end
    end
end

describe("the light program's memory", function()
    it("stays within the budget once loaded on the board", function()
        local luac = findLuac()
        if not luac then
            pending("no Lua 5.1 luac on this computer to measure with")
            return
        end
        local loaded = {}
        local tmp = os.tmpname()
        collectgarbage("collect")
        collectgarbage("collect")
        local before = collectgarbage("count")
        for _, module in ipairs(bootModules) do
            assert.is_true(os.execute(luac .. " -s -o " .. tmp .. " src/" .. module .. ".lua") == 0, "could not compile " .. module)
            local chunk = loadfile(tmp)
            assert.is_function(chunk)
            table.insert(loaded, chunk)
        end
        collectgarbage("collect")
        collectgarbage("collect")
        local usedKb = collectgarbage("count") - before
        os.remove(tmp)
        assert.is_same(#bootModules, #loaded)
        assert.is_true(usedKb <= budgetKb, string.format(
            "The light program takes %.1f KB loaded (budget %d KB). The board has little RAM to spare: make it smaller, "
            .. "or load the new part only when it is needed, before raising the budget.", usedKb, budgetKb))
    end)
end)
