-- "Change Wi-Fi on all lights": the hub sends a new Wi-Fi, the light saves it safely, keeps the
-- old one to go back to, and tries the new one once the current network goes away.

-- an in-memory SPIFFS with the calls my-settings.lua makes; readline keeps the line ending, as NodeMCU's does
local function memoryFiles(initial)
    local files = {}
    for name, content in pairs(initial or {}) do files[name] = content end
    _G.file = {
        exists = function(name) return files[name] ~= nil end,
        remove = function(name) files[name] = nil end,
        rename = function(from, to)
            if files[from] == nil or files[to] ~= nil then return false end
            files[to] = files[from]; files[from] = nil
            return true
        end,
        open = function(name, mode)
            if mode == "r" then
                if files[name] == nil then return nil end
                local pos = 1
                return {
                    readline = function()
                        if pos > #files[name] then return nil end
                        local e = files[name]:find("\n", pos, true) or #files[name]
                        local line = files[name]:sub(pos, e)
                        pos = e + 1
                        return line
                    end,
                    close = function() end,
                }
            end
            files[name] = ""
            return {
                writeline = function(_, s) files[name] = files[name] .. s .. "\n" end,
                close = function() end,
            }
        end,
    }
    return files
end

local ini = "/FLASH/tally-settings.ini"
local base = "station.ssid=Church\nstation.password=old-pass\ntally.name=Cam 1\noperator.ws2812=5 grb\n"

describe("saving a Wi-Fi sent by the hub", function()
    require "spec.nodemcu-mock"
    local realIt = it
    it = function(name, func) insulate(function() realIt(name, func) end) end
    _G.MyLog = { warning = function() end, info = function() end, error = function() end }

    it("saves the new network, keeps the old one to go back to, and keeps every other setting", function()
        local files = memoryFiles({ [ini] = base })
        require "src.my-settings"
        assert.is_true(MySettings.saveWifi("Church-New", "new=pass"))
        assert.is_same("Church-New", MySettings.staSsid())
        assert.is_same("new=pass", MySettings.staPw())
        assert.is_same("Church", MySettings.staPrevSsid())
        assert.is_same("old-pass", MySettings.staPrevPw())
        assert.truthy(files[ini]:find("tally.name=Cam 1", 1, true))
        assert.truthy(files[ini]:find("operator.ws2812=5 grb", 1, true))
        assert.is_nil(files[ini .. ".new"])
        assert.is_nil(files[ini .. ".bak"])
    end)

    it("reads the saved file back the same way after a restart", function()
        local files = memoryFiles({ [ini] = base })
        require "src.my-settings"
        MySettings.saveWifi("Church-New", "new-pass")
        local saved = files[ini]
        package.loaded["src.my-settings"] = nil
        memoryFiles({ [ini] = saved })
        require "src.my-settings"
        assert.is_same("Church-New", MySettings.staSsid())
        assert.is_same("Church", MySettings.staPrevSsid())
        assert.is_same("old-pass", MySettings.staPrevPw())
    end)

    it("starts from the backup when a save was cut off between its two renames", function()
        memoryFiles({ [ini .. ".bak"] = base })
        require "src.my-settings"
        assert.is_same("Church", MySettings.staSsid())
    end)
end)

describe("joining Wi-Fi after the hub sent a new one", function()
    require "spec.nodemcu-mock"
    local realIt = it
    it = function(name, func) insulate(function() realIt(name, func) end) end

    local function setup(previous)
        local handlers, configured, pending = {}, {}, {}
        _G.wifi = {
            STATION = 1,
            setmode = function() end,
            setmaxtxpower = function() end,
            sta = {
                config = function(c) table.insert(configured, c.ssid) end,
                sethostname = function() end,
                connect = function() end,
                disconnect = function() end,
            },
            eventmon = {
                STA_CONNECTED = 1, STA_DISCONNECTED = 2, STA_GOT_IP = 3, STA_DHCP_TIMEOUT = 4,
                reason = { NO_AP_FOUND = 201, AUTH_EXPIRE = 2 },
                register = function(event, fn) handlers[event] = fn end,
            },
        }
        -- one-shot timers, run by the test
        _G.tmr = { ALARM_SINGLE = 0, create = function() return { alarm = function(_, _, _, fn) table.insert(pending, fn) end } end }
        _G.MyLed = { waitForWifiConnection = function() end, waitForWifiIp = function() end, waitForServerConnection = function() end }
        _G.MyLog = { info = function() end, warning = function() end, error = function() end }
        _G.MySettings = {
            staSsid = function() return "Church-New" end, staPw = function() return "new-pass" end,
            staPrevSsid = function() return previous end, staPrevPw = function() return "old-pass" end,
            hostName = function() return "Tally-Cam-1" end,
        }
        require "src.my-wifi"
        local failJoin = function()
            handlers[2]({ SSID = configured[#configured], reason = 201 })
            table.remove(pending, 1)()
        end
        return { configured = configured, failJoin = failJoin, gotIp = function() handlers[3]({ IP = "10.0.0.9" }) end }
    end

    it("tries the new network first, and the previous one after three failures, back and forth", function()
        local t = setup("Church")
        MyWifi.connect()
        assert.is_same("Church-New", t.configured[1])
        t.failJoin(); t.failJoin()
        assert.is_same("Church-New", t.configured[#t.configured])
        t.failJoin()
        assert.is_same("Church", t.configured[#t.configured])
        t.failJoin(); t.failJoin(); t.failJoin()
        assert.is_same("Church-New", t.configured[#t.configured])
    end)

    it("without a previous network it keeps trying the one it has", function()
        local t = setup(nil)
        MyWifi.connect()
        for _ = 1, 7 do t.failJoin() end
        for _, ssid in ipairs(t.configured) do assert.is_same("Church-New", ssid) end
    end)
end)
