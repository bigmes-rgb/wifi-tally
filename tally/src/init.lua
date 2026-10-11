-- Starts the light program. It runs from the board's flash (LFS) when it can: loaded into the board's RAM it left
-- under 6 kB free, too little for the Wi-Fi, and lights went silent after a few minutes. From the flash the code
-- takes almost no RAM.
-- "Install now" puts lfs.img (the program for the flash) and lfs.stamp (which build it is) on the board. A new stamp
-- is loaded into the flash once; the board restarts when that worked. If it did not, or the flash holds another
-- build, the .lc files run as before. One try per stamp (lfs.tried), so an image that does not load cannot restart
-- the light over and over; "Install now" removes lfs.tried, which allows another try.

local lfsModule = function(name)
    local fn, base = node.flashindex(name)
    if base == nil and type(fn) == "function" then return fn end
end

local readFile = function(name)
    if not file.exists(name) then return nil end
    local f = file.open(name, "r")
    if not f then return nil end
    local text = f:read() or ""
    f:close()
    return (text:gsub("%s+$", ""))
end

local inFlash = false
local ok, err = pcall(function()
    local want = readFile("lfs.stamp")
    if not want then return end
    local stamp = lfsModule("lfs-stamp")
    if stamp and stamp() == want then
        inFlash = true
        if file.exists("lfs.tried") then
            -- the boot right after the load: it ends in a watchdog reset by design, which is no crash
            _G.lfsJustLoaded = true
            file.remove("lfs.tried")
        end
        return
    end
    if not file.exists("lfs.img") then return end
    if readFile("lfs.tried") == want then
        print("The light program did not load into the flash. Running it from its files.")
        return
    end
    local f = file.open("lfs.tried", "w")
    if not f then
        print("Could not write lfs.tried, so the light program is not loaded into the flash. Running it from its files.")
        return
    end
    f:write(want)
    f:close()
    print("Loading the light program into the flash. The board restarts when it is done.")
    -- does not come back when it worked: the board restarts
    print("Could not load the light program into the flash: " .. tostring(node.flashreload("lfs.img")))
end)
if not ok then print("Checking the flash failed: " .. tostring(err)) end

if inFlash then
    -- modules from the flash before the .lc files: those would be loaded into RAM
    table.insert(package.loaders, 2, function(name)
        return lfsModule(name) or ("\n\tno module '" .. name .. "' in the flash")
    end)
end
require("my-app")
