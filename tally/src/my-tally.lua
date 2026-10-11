--- everything that handles the connection to the Hub,
--- send and receive messages

local diffMicroSeconds = function(time)
    local now = tmr.now()
    if now < time then return now + (2^32 - time) else return now - time end
end

local listenPort = 7411

local listenSocket = nil

local timeLastPackageReceived = nil

-- the hub's address as learned from its replies. Only used while no hub.ip is
-- configured: then "tally-ho" goes to the network's broadcast address and
-- whoever answers with a valid tally command is the hub.
local learnedHubIp = nil
-- give up on a learned address after this long without a packet and search again
local searchAgainAfterMicroSeconds = 10000000

-- "O255/000/000 S000/000/000", optionally followed by " 0xAA 300" (flash pattern, step in ms):
-- exactly what the hub's CommandCreator sends. One pattern, not a check per character: less code
-- for a board with little memory.
local parseMessage = function(data)
    data = data:match("^%s*(.-)%s*$") -- trim
    local opR, opG, opB, stR, stG, stB, rest = data:match("^O(%d%d%d)/(%d%d%d)/(%d%d%d) S(%d%d%d)/(%d%d%d)/(%d%d%d)(.*)$")
    if not opR then return end
    local pattern
    local duration
    if rest ~= "" then
        local hex, ms = rest:match("^ 0x(%x%x) (%d%d%d)$")
        if not hex then return end
        local patternNumber = tonumber(hex, 16)
        pattern = {}
        -- @TODO: Lua 5.3 comes with bit operators, but 5.1 does not yet
        for _, num in ipairs({128,64,32,16,8,4,2,1}) do
            if patternNumber >= num then
                patternNumber = patternNumber - num
                table.insert(pattern, true)
            else
                table.insert(pattern, false)
            end
        end
        duration = tonumber(ms, 10)
    end
    return tonumber(opR, 10), tonumber(opG, 10), tonumber(opB, 10), tonumber(stR, 10), tonumber(stG, 10), tonumber(stB, 10), pattern, duration
end

-- hubs other than ours that were already reported, so each is logged once
local otherHubsWarned = {}

-- "wifi <ssid in hex> <password in hex>": the hub hands every light a new Wi-Fi before the router
-- is switched over. Taken only from the hub this light follows; answered so the hub can show it.
-- The code that saves it is loaded only now (my-wifi-handover.lua): the light has little memory.
local handleWifi = function(data, ip)
    local ourHub = MySettings:hubIp() or learnedHubIp
    if ip == nil or ourHub == nil or ip ~= ourHub then return end
    -- a failed load (no memory, say) must not restart the light: it answers "wifi-failed"
    local ran, saved = pcall(function() return dofile("my-wifi-handover.lc")(data) end)
    if not ran then print("Could not save the new Wi-Fi: " .. tostring(saved)) end
    local ok = ran and saved == true
    MyTally:send(string.format('%s "%s"', ok and "wifi-saved" or "wifi-failed", MySettings:name()))
    if ok then MyLog.info("Saved the new Wi-Fi " .. MySettings:staSsid() .. ". Using it once the current one goes away.") end
end

_G.myHandleReceive = function(data, ip)
    if data:sub(1, 9) == "tally-ho " or data:sub(1, 4) == "log " then
        -- another tally searching for the hub by broadcast. Not for us.
        return
    end
    if data:sub(1, 5) == "wifi " then
        handleWifi(data, ip)
        return
    end
    if _G.testMode then
        -- the hub is driving the LEDs over USB to check the wiring; nothing may override them
        return
    end
    local opR, opG, opB, stR, stG, stB, pattern, duration = parseMessage(data)
    if not opR then
        MyLog.warning(string.format('invalid package: %s', data))
        return
    end
    -- stay with one hub. With two vTally hubs on the network (say the booth PC and a laptop used
    -- to build lights) both answer; following whichever spoke last made the light flicker between
    -- two switchers' states and flooded the log. The other hub is ignored until ours goes silent.
    local ourHub = MySettings:hubIp() or learnedHubIp
    if ip ~= nil and ourHub ~= nil and ip ~= ourHub then
        if not otherHubsWarned[ip] then
            otherHubsWarned[ip] = true
            MyLog.warning("Another hub at " .. ip .. " is also sending. Staying with " .. ourHub .. ". Run only one vTally on this network.")
        end
        return
    end
    timeLastPackageReceived = tmr.now()
    if ip ~= nil and ourHub == nil then
        learnedHubIp = ip
        MyLog.info("Found hub at " .. ip)
    end
    if pattern ~= nil and duration ~= nil then
        MyLed.flash(opR, opG, opB, stR, stG, stB, pattern, duration)
    else
        -- a static color
        MyLed.static(opR, opG, opB, stR, stG, stB)
    end
end

_G.MyTally = {
    connect = function(self)
        if listenSocket == nil then
            listenSocket = net.createUDPSocket()
            listenSocket:on("receive", function(sck, c, port, ip)
                myHandleReceive(c, ip)
            end)
            listenSocket:listen(listenPort)
        end
        MyLog.info(string.format("Listening for hub on port %d", listenPort))
        if MySettings:hubIp() ~= nil then
            MyLog.info(string.format("Contacting hub on %s:%d", MySettings:hubIp(), MySettings:hubPort()))
        else
            MyLog.info(string.format("Searching for hub by broadcast on port %d", MySettings:hubPort()))
        end
        self:sendInfo()
    end,
    -- where "tally-ho" goes: the configured hub, else the hub that answered, else everyone
    hubAddress = function()
        return MySettings:hubIp() or learnedHubIp or MyWifi.getBroadcast()
    end,
    isReady = function()
        return MyWifi.isConnected() and listenSocket ~= nil
    end,
    isConnected = function()
        return timeLastPackageReceived ~= nil and diffMicroSeconds(timeLastPackageReceived) <= 3000000
    end,
    send = function(_, data)
        if not MyWifi.isConnected() then
            MyLog.error("Not sending packet, because wifi is not connected.")
            return
        elseif listenSocket == nil then
            MyLog.error("Not sending packet, because UDP is not set up yet.")
            return
        end
        -- a send error must not restart the light; print, not MyLog, which sends through here
        local ok, err = pcall(listenSocket.send, listenSocket, MySettings:hubPort(), MyTally.hubAddress(), data .. "\n")
        if not ok then print("Could not send to the hub: " .. tostring(err)) end
    end,
    sendInfo = function(self)
        self:send(string.format('tally-ho "%s"', MySettings:name()))
    end,
    sendLog = function(self, severity, msg)
        self:send(string.format('log "%s" %s "%s"', MySettings:name(), severity, msg))
    end,
}

tmr.create():alarm(1000, tmr.ALARM_AUTO, function()
    if _G.testMode then return end
    if MyWifi ~= nil and MyWifi.isConnected() then
        -- check if we seemed to have lost connection to the base station
        if not MyTally:isConnected() then
            MyLed.waitForServerConnection()
            if learnedHubIp ~= nil and diffMicroSeconds(timeLastPackageReceived) > searchAgainAfterMicroSeconds then
                MyLog.info("Lost hub at " .. learnedHubIp .. ". Searching again.")
                learnedHubIp = nil
            end
        end

        -- send probes to show the base station that we are still there
        if MyTally:isReady() then MyTally:sendInfo() end
    end
end)
