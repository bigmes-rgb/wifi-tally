--- everything establishing and maintaining a WiFi connection

local isConnected = false

-- After the hub sent a new Wi-Fi, the light tries it and, after a few failures, the one before it,
-- back and forth: a typo in the new password, or a router not switched over yet, never strands it.
local failures = 0
local usingPrevious = false
local currentNetwork = function()
    if usingPrevious and MySettings:staPrevSsid() then
        return MySettings:staPrevSsid(), MySettings:staPrevPw()
    end
    return MySettings:staSsid(), MySettings:staPw()
end

_G.MyWifi = {
    connect = function()
        MyLed.waitForWifiConnection()
        local ssid, pwd = currentNetwork()
        MyLog.info("Connect to WiFi " .. ssid)
        wifi.setmode(wifi.STATION)
        wifi.sta.config({
            ssid = ssid,
            pwd = pwd,
            auto = false,
            save = false,
        })
        wifi.sta.sethostname(MySettings:hostName())
        wifi.sta.connect()
    end,
    disconnect = function()
        wifi.sta.disconnect()
    end,
    isConnected = function()
        -- wifi.sta.status() returns wifi.STA_GOTIP even when the tally was thrown out of wifi -> so it's no good choice
        return isConnected
    end,
    getIp = function()
        return wifi.sta.getip()
    end,
    getMac = function()
        return wifi.sta.getmac()
    end,
    getBroadcast = function()
        return wifi.sta.getbroadcast()
    end,
}

wifi.setmaxtxpower(82)

wifi.eventmon.register(wifi.eventmon.STA_CONNECTED, function(T)
    isConnected = false
    MyLog.info("Connected to " .. T.SSID .. ". Waiting for IP.")

    if not _G.testMode then MyLed.waitForWifiIp() end
end)

wifi.eventmon.register(wifi.eventmon.STA_DISCONNECTED, function(T)
    isConnected = false

    local humanReadable = T.reason
    for key, val in pairs(wifi.eventmon.reason) do
        if val == T.reason then
            humanReadable = key
            break
        end
    end

    MyLog.error("Got disconnected from " ..T.SSID .. ". Reason " .. humanReadable)

    failures = failures + 1
    if failures >= 3 and MySettings:staPrevSsid() then
        failures = 0
        usingPrevious = not usingPrevious
        MyLog.warning("Trying the " .. (usingPrevious and "previous" or "new") .. " Wi-Fi " .. (currentNetwork()) .. " instead.")
    end

    if not _G.testMode then MyLed.waitForWifiConnection() end
    local delay = 2000
    if T.reason == wifi.eventmon.reason.AUTH_EXPIRE then delay = 200 end
    tmr.create():alarm(delay, tmr.ALARM_SINGLE, MyWifi.connect)
end)

wifi.eventmon.register(wifi.eventmon.STA_GOT_IP, function(T)
    MyLog.info("Got IP " .. T.IP)
    failures = 0

    isConnected = true
    MyLed.waitForServerConnection()
    MyTally:connect()
end)

wifi.eventmon.register(wifi.eventmon.STA_DHCP_TIMEOUT, function()

    isConnected = false
    MyLog.error("DHCP timeout")

    MyLed.waitForWifiConnection()
    MyWifi.disconnect()
    tmr.create():alarm(200, tmr.ALARM_SINGLE, MyWifi.connect)
end)
