--- Saves a new Wi-Fi the hub sent ("wifi <ssid in hex> <password in hex>"), keeping the current one
--- as the one to go back to. The light stays on its current network until that goes away.
--- Loaded only when such a message arrives and dropped afterwards: the light has little memory, and
--- having this in memory all the time made 0.9.12 stop answering.
--- Returns a function(data) that answers true when the new Wi-Fi was saved.

local fileName = "/FLASH/tally-settings.ini"

local fromHex = function(hex)
    return (hex:gsub("%x%x", function(h) return string.char(tonumber(h, 16)) end))
end

-- Written to a new file first, the old one kept as .bak until the new one is in place, so a power
-- cut never leaves the light without settings (my-settings.lua restores a lone .bak at boot).
local save = function(newSsid, newPw)
    local ssid, pw = MySettings.staSsid(), MySettings.staPw()
    local lines = {}
    local f = file.open(fileName, "r")
    if f then
        while true do
            local line = f:readline()
            if not line then break end
            local k = line:match("^%s*([^=]-)%s*=")
            if k ~= "station.ssid" and k ~= "station.password" and k ~= "station.previous.ssid" and k ~= "station.previous.password" then
                table.insert(lines, (line:gsub("[\r\n]+$", "")))
            end
        end
        f:close()
    end
    local keepPrevious = ssid ~= nil and ssid ~= newSsid
    table.insert(lines, "station.ssid=" .. newSsid)
    table.insert(lines, "station.password=" .. newPw)
    if keepPrevious then
        table.insert(lines, "station.previous.ssid=" .. ssid)
        table.insert(lines, "station.previous.password=" .. (pw or ""))
    end
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
    if keepPrevious then
        MySettings.useWifi(newSsid, newPw, ssid, pw)
    else
        MySettings.useWifi(newSsid, newPw, MySettings.staPrevSsid(), MySettings.staPrevPw())
    end
    return true
end

return function(data)
    local hexSsid, hexPw = data:match("^wifi (%x+) (%x*)%s*$")
    if hexSsid and #hexSsid % 2 == 0 and #hexPw % 2 == 0 then
        return save(fromHex(hexSsid), fromHex(hexPw))
    end
    return false
end
