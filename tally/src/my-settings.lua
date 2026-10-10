--- handles the tally settings file, reads it and provides an interface for
--- the other components to get validated, type-safe parameters from.

local fileName = "/FLASH/tally-settings.ini"

_G.LightTypes = {
    COMMON_ANODE = "grb+",
    COMMON_CATHODE = "grb-",
}

_G.Ws2812Types = {
    RGB = "rgb",
    GRB = "grb",
}

-- defaults
local staSsid = nil
local staPw = nil
local hubIp = nil
local hubPort = 7411
local name = string.format("%x", node.chipid())
local operatorType = LightTypes.COMMON_ANODE
local operatorWs2812Type = Ws2812Types.GRB
local operatorWs2812Lights = 5
local stageType = LightTypes.COMMON_ANODE
local stageWs2812Type = Ws2812Types.GRB
local stageWs2812Lights = 0

-- "192.168.1.20": four numbers from 0 to 255
local isIpAddress = function(s)
    local parts = { s:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$") }
    if #parts ~= 4 then return false end
    for _, part in ipairs(parts) do
        if tonumber(part) > 255 then return false end
    end
    return true
end

local trim = function(s)
    return s:match("^%s*(.-)%s*$")
end

local isValueInTable = function(value, table)
    for _, val in pairs(table) do
        if value == val then return true end
    end
    return false
end

local makeHostName = function(s)
    return "Tally-" .. s:gsub("[^%w]+", "-"):gsub("^\-+", ""):gsub("\-+$", "")
end

_G.MySettings = {
    staSsid = function()
        return staSsid
    end,
    staPw = function()
        return staPw
    end,
    hubIp = function()
        return hubIp
    end,
    hubPort = function()
        return hubPort
    end,
    name = function()
        return name
    end,
    hostName = function()
        return makeHostName(name)
    end,
    operatorType = function()
        return operatorType
    end,
    operatorNumberOfWs2812Lights = function()
        return operatorWs2812Lights
    end,
    operatorWs2812Type = function()
        return operatorWs2812Type
    end,
    stageType = function()
        return stageType
    end,
    stageNumberOfWs2812Lights = function()
        return stageWs2812Lights
    end,
    stageWs2812Type = function()
        return stageWs2812Type
    end,
    isValid = function()
        return staSsid ~= nil
    end,
}

--
-- PARSE SETTINGS FILE
--

if file.exists(fileName) then
    local f = file.open(fileName, "r")
    if not f then
        MyLog.error("Could not open settings file " .. fileName .. " to read configuration")
    else
        while true do
            local line = f:readline()
            if line then
                -- split at the first "=": a Wi-Fi password may contain "=" itself. readline keeps the
                -- line ending; trim() removes it with the spaces.
                local k, v = line:match("^%s*([^=]-)%s*=(.*)$")
                if k ~= nil and k ~= "" and line:sub(1,1) ~= ";" then
                    k = trim(k) -- trim
                    v = trim(v) -- trim
                    if k == "station.ssid" then
                        staSsid = v
                    elseif k == "station.password" then
                        staPw = v
                    elseif k == "hub.ip" then
                        -- empty or "auto": find the hub by broadcast instead. Anything else has to be
                        -- an address: sending to a malformed one raises, and the light restarted
                        -- every time it got onto the Wi-Fi.
                        if v ~= "" and v:lower() ~= "auto" then
                            if isIpAddress(v) then
                                hubIp = v
                            else
                                MyLog.warning("hub.ip \"" .. v .. "\" is not an IP address. Finding the hub by broadcast instead.")
                            end
                        end
                    elseif k == "hub.port" then
                        local port = tonumber(v)
                        if port ~= nil and port >= 1 and port <= 65535 and port == math.floor(port) then
                            hubPort = port
                        else
                            MyLog.warning("hub.port \"" .. v .. "\" is not a port number. Using " .. hubPort .. ".")
                        end
                    elseif k == "tally.name" then
                        name = v:sub(0, 26)
                    elseif k == "operator.type" then
                        local value = v:lower()
                        if isValueInTable(value, LightTypes) then
                            operatorType = value
                        else
                            MyLog.warning("Invalid operator.type \"" .. v .. "\"")
                        end
                    elseif k == "operator.ws2812" then
                        local value, type
                        local idx = v:find(" ", 1, true)
                        if idx ~= nil then
                            value = v:sub(1, idx-1)
                            type = v:sub(idx+1)
                        else
                            value = v
                            type = nil
                        end
                        value = tonumber(value)
                        if value ~= nil and value >= 0 and value <= 10 then
                            operatorWs2812Lights = value
                        else
                            MyLog.warning("operator.ws2812 needs to be number between 0 and 10, but got \"" .. v .. "\"")
                        end
                        if type ~= nil then
                            if isValueInTable(type, Ws2812Types) then
                                operatorWs2812Type = type
                            else
                                MyLog.warning("operator.ws2812 should have a supported light type, but got \"" .. type .. "\"")
                            end
                        end
                    elseif k == "stage.type" then
                        local value = v:lower()
                        if isValueInTable(value, LightTypes) then
                            stageType = value
                        else
                            MyLog.warning("Invalid stage.type \"" .. v .. "\"")
                        end
                    elseif k == "stage.ws2812" then
                        local value, type
                        local idx = v:find(" ", 1, true)
                        if idx ~= nil then
                            value = v:sub(1, idx-1)
                            type = v:sub(idx+1)
                        else
                            value = v
                            type = nil
                        end
                        value = tonumber(value)
                        if value ~= nil and value >= 0 and value <= 10 then
                            stageWs2812Lights = value
                        else
                            MyLog.warning("stage.ws2812 needs to be number between 0 and 10, but got \"" .. v .. "\"")
                        end
                        if type ~= nil then
                            if isValueInTable(type, Ws2812Types) then
                                stageWs2812Type = type
                            else
                                MyLog.warning("stage.ws2812 should have a supported light type, but got \"" .. type .. "\"")
                            end
                        end
                    else
                        MyLog.warning("Unknown key " .. k .. " in configuration file. Did you mistype it?")
                    end
                end
            else
                break
            end
        end
        f:close()
    end
else
    MyLog.warning("Configuration file " .. fileName .. " does not exist. Using defaults.")
end
