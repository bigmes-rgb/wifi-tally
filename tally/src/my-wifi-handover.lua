--- Saves settings the hub sends over the network: a new Wi-Fi ("wifi <ssid in hex> <password in hex>"),
--- keeping the current one as the one to go back to (the light stays on its current network until that
--- goes away), or a new name ("name <name in hex>").
--- Loaded only when such a message arrives and dropped afterwards: the light has little memory, and
--- having this in memory all the time made 0.9.12 stop answering.
--- Returns a function(data) that saves it, answers the hub, and is true when the setting was saved.

local fileName = "/FLASH/tally-settings.ini"

local fromHex = function(hex)
    return (hex:gsub("%x%x", function(h) return string.char(tonumber(h, 16)) end))
end

-- Rewrites the settings file with the lines in `drop` replaced by `add`. Written to a new file first, the
-- old one kept as .bak until the new one is in place, so a power cut never leaves the light without
-- settings (my-settings.lua restores a lone .bak at boot).
local rewrite = function(drop, add)
    local lines = {}
    local f = file.open(fileName, "r")
    if f then
        while true do
            local line = f:readline()
            if not line then break end
            local k = line:match("^%s*([^=]-)%s*=")
            if not drop[k] then
                table.insert(lines, (line:gsub("[\r\n]+$", "")))
            end
        end
        f:close()
    end
    for _, line in ipairs(add) do table.insert(lines, line) end
    local out = file.open(fileName .. ".new", "w+")
    if not out then return false end
    for _, line in ipairs(lines) do out:writeline(line) end
    out:close()
    file.remove(fileName .. ".bak")
    if file.exists(fileName) and not file.rename(fileName, fileName .. ".bak") then return false end
    if not file.rename(fileName .. ".new", fileName) then
        file.rename(fileName .. ".bak", fileName)
        return false
    end
    file.remove(fileName .. ".bak")
    return true
end

local saveWifi = function(newSsid, newPw)
    local ssid, pw = MySettings.staSsid(), MySettings.staPw()
    local keepPrevious = ssid ~= nil and ssid ~= newSsid
    local add = { "station.ssid=" .. newSsid, "station.password=" .. newPw }
    if keepPrevious then
        table.insert(add, "station.previous.ssid=" .. ssid)
        table.insert(add, "station.previous.password=" .. (pw or ""))
    end
    local drop = { ["station.ssid"] = true, ["station.password"] = true, ["station.previous.ssid"] = true, ["station.previous.password"] = true }
    if not rewrite(drop, add) then return false end
    if keepPrevious then
        MySettings.useWifi(newSsid, newPw, ssid, pw)
    else
        MySettings.useWifi(newSsid, newPw, MySettings.staPrevSsid(), MySettings.staPrevPw())
    end
    return true
end

-- the name is read once at start-up (my-settings.lua), so the light restarts after saving it (my-tally.lua)
local saveName = function(newName)
    if newName == "" or #newName > 26 or newName:find('[\r\n"]') then return false end
    return rewrite({ ["tally.name"] = true }, { "tally.name=" .. newName })
end

-- Saves what the hub sent, answers it under the light's current name, and for a new name restarts the light
-- so it comes back under it. Answers true when the setting was saved.
return function(data)
    if data:sub(1, 5) == "wifi " then
        local hexSsid, hexPw = data:match("^wifi (%x+) (%x*)%s*$")
        local ok = hexSsid ~= nil and #hexSsid % 2 == 0 and #hexPw % 2 == 0 and saveWifi(fromHex(hexSsid), fromHex(hexPw))
        MyTally:send(string.format('%s "%s"', ok and "wifi-saved" or "wifi-failed", MySettings:name()))
        if ok then MyLog.info("Saved the new Wi-Fi " .. MySettings:staSsid() .. ". Using it once the current one goes away.") end
        return ok
    end
    local hexName = data:match("^name (%x+)%s*$")
    local newName = hexName and #hexName % 2 == 0 and fromHex(hexName) or ""
    local ok = newName ~= "" and saveName(newName)
    MyTally:send(string.format('%s "%s" "%s"', ok and "name-saved" or "name-failed", MySettings:name(), ok and newName or ""))
    if ok then
        MyLog.info("Renamed to " .. newName .. ". Restarting.")
        -- the answer and the log line leave first
        tmr.create():alarm(500, tmr.ALARM_SINGLE, node.restart)
    end
    return ok
end
