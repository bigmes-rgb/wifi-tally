--- Fetches a new light program from the hub over the network and restarts into it. The hub sends
--- "update <hub ip> <port> <stamp>": where to get it and which build it is. The hub serves lfs.img, the program
--- for the board's flash (see init.lua). It is written to a new file and becomes lfs.img only once it has arrived
--- whole, so a cut-off download leaves the running program alone; init.lua then loads it into the flash once,
--- and falls back to the files if it does not load.
--- Loaded only when that message arrives and dropped afterwards, like my-wifi-handover.lua.
--- Returns a function(data) that answers the hub: "update-done" when the light already runs that build,
--- "update-saved" once the download is complete (the light restarts), "update-failed" otherwise. It is true when
--- the download was started or nothing had to be done.

local newFile = "lfs.img.new"

return function(data)
    local host, port, stamp = data:match("^update (%d+%.%d+%.%d+%.%d+) (%d+) (%x+)%s*$")
    local answer = function(what)
        MyTally:send(string.format('%s "%s" "%s"', what, MySettings:name(), stamp or ""))
    end
    if not host then
        answer("update-failed")
        return false
    end
    if _G.lfsStamp == stamp then
        answer("update-done")
        return true
    end
    -- a second "update" while one is being fetched (the button pressed on two pages, say) would write into the
    -- same file; the first one answers for both
    if _G.updating then
        MyLog.info("Already fetching the new light program.")
        return true
    end
    _G.updating = true
    file.remove(newFile)
    local out = file.open(newFile, "w+")
    if not out then
        _G.updating = nil
        MyLog.error("Update failed: could not write to the board's storage")
        answer("update-failed")
        return false
    end

    local sck = net.createConnection(net.TCP, 0)
    local timer = tmr.create()
    local header, expected, got, done = "", nil, 0, false
    local stop = function()
        done = true
        _G.updating = nil
        timer:unregister()
        pcall(sck.close, sck)
    end
    local fail = function(why)
        if done then return end
        stop()
        out:close()
        file.remove(newFile)
        MyLog.error("Update failed: " .. why)
        answer("update-failed")
    end
    local complete = function()
        stop()
        out:close()
        -- the new program takes the place of the old one; the stamp last, so a power cut in between leaves a
        -- stamp that still matches the flash and the light keeps running what it has
        file.remove("lfs.img")
        local ok = file.rename(newFile, "lfs.img")
        local f = ok and file.open("lfs.stamp", "w+")
        if not f or not f:write(stamp) then
            if f then f:close() end
            file.remove(newFile)
            MyLog.error("Update failed: could not save the new program")
            answer("update-failed")
            return
        end
        f:close()
        -- init.lua gets one try at loading it into the flash
        file.remove("lfs.tried")
        MyLog.info("Got the new light program " .. stamp .. ". Restarting to load it into the flash.")
        answer("update-saved")
        -- the answer and the log line leave first
        tmr.create():alarm(500, tmr.ALARM_SINGLE, node.restart)
    end

    sck:on("connection", function(s)
        s:send("GET /tally/lfs.img HTTP/1.0\r\nHost: " .. host .. "\r\nConnection: close\r\n\r\n")
    end)
    sck:on("receive", function(_, chunk)
        if done then return end
        if expected == nil then
            -- the answer arrives in frames of up to 1460 bytes; the header may end in any of them
            header = header .. chunk
            local eoh = header:find("\r\n\r\n", 1, true)
            if not eoh then
                if #header > 4000 then fail("the hub's answer made no sense") end
                return
            end
            local status = header:match("^HTTP/%d%.%d (%d+)")
            local length = header:match("\n[Cc]ontent%-[Ll]ength:%s*(%d+)")
            -- an empty file is no program either
            if status ~= "200" or not length or length == "0" then
                fail("the hub answered " .. (status or "nothing readable") .. (length == "0" and " with an empty program" or ""))
                return
            end
            expected = tonumber(length)
            chunk = header:sub(eoh + 4)
            header = nil
        end
        chunk = chunk:sub(1, expected - got)
        if #chunk > 0 then
            if not out:write(chunk) then
                fail("could not write to the board's storage")
                return
            end
            got = got + #chunk
        end
        if got >= expected then complete() end
    end)
    local lost = function()
        if done then return end
        fail(expected and string.format("the connection was lost after %d of %d bytes", got, expected) or "could not reach the hub")
    end
    sck:on("disconnection", lost)
    sck:on("reconnection", lost)
    timer:alarm(60000, tmr.ALARM_SINGLE, function() fail("it took too long") end)
    MyLog.info("Fetching the new light program " .. stamp .. " from " .. host)
    sck:connect(tonumber(port), host)
    return true
end
