-- "Update lights": the hub tells a light where to fetch the new program; the light downloads it over TCP, puts it
-- in place only once it has arrived whole, and restarts so init.lua loads it into the flash.

local memoryFiles = require "spec.memory_files"

local stamp = "0123456789abcdef"
local body = string.rep("L", 3000) -- the program image; split into frames by the network

-- the board, with the answer the fake hub gives: status line and body
local function board(opts)
    opts = opts or {}
    local files = memoryFiles(opts.files or { ["lfs.img"] = "old", ["lfs.stamp"] = "oldstamp", ["lfs.tried"] = "oldstamp" })
    local sent, logs, restarts, alarms, sock = {}, {}, 0, {}, nil
    _G.MyTally = { send = function(_, data) table.insert(sent, data) end }
    _G.MySettings = { name = function() return "Cam 1" end }
    _G.MyLog = { info = function(m) table.insert(logs, m) end, error = function(m) table.insert(logs, "ERROR " .. m) end, warning = function() end }
    _G.node = { restart = function() restarts = restarts + 1 end }
    _G.tmr = { ALARM_SINGLE = "single", create = function()
        return { alarm = function(_, ms, _, fn) table.insert(alarms, { ms = ms, fn = fn }) end, unregister = function() end }
    end }
    _G.net = { TCP = "tcp", createConnection = function()
        sock = { callbacks = {}, sent = nil, connected = nil, closed = 0 }
        sock.on = function(_, event, fn) sock.callbacks[event] = fn end
        sock.send = function(_, data) sock.sent = data end
        sock.connect = function(_, port, host) sock.connected = { port = port, host = host } end
        sock.close = function() sock.closed = sock.closed + 1 end
        return sock
    end }
    _G.lfsStamp = opts.lfsStamp
    _G.updating = nil
    local update = dofile("src/my-update.lua")
    return {
        files = files, sent = sent, logs = logs, update = update,
        sock = function() return sock end,
        restarts = function() return restarts end,
        -- the restart is the 500 ms alarm; the download has a 60 s one
        restartScheduled = function() for _, a in ipairs(alarms) do if a.ms == 500 then return true end end return false end,
        -- the hub took too long: the 60 s alarm fires
        timeout = function() for _, a in ipairs(alarms) do if a.ms == 60000 then a.fn() end end end,
        -- the hub's answer, delivered in frames
        answer = function(status, headers, content, frame)
            local text = "HTTP/1.0 " .. status .. "\r\n" .. (headers or "") .. "\r\n" .. (content or "")
            local pos = 1
            while pos <= #text do
                sock.callbacks.receive(sock, text:sub(pos, pos + frame - 1))
                pos = pos + frame
            end
        end,
    }
end

describe("fetching a new light program from the hub", function()
    it("downloads it in frames, puts it in place with its stamp, answers, and restarts", function()
        local b = board()
        assert.is_true(b.update("update 192.168.1.5 3000 " .. stamp))
        assert.is_same({ port = 3000, host = "192.168.1.5" }, b.sock().connected)
        b.sock().callbacks.connection(b.sock())
        assert.truthy(b.sock().sent:find("^GET /tally/lfs%.img HTTP/1%.0\r\n"))
        b.answer("200 OK", "Content-Type: application/octet-stream\r\nContent-Length: " .. #body .. "\r\n", body, 1460)
        assert.is_same(body, b.files["lfs.img"])
        assert.is_same(stamp, b.files["lfs.stamp"])
        assert.is_nil(b.files["lfs.tried"])
        assert.is_nil(b.files["lfs.img.new"])
        assert.is_same('update-saved "Cam 1" "' .. stamp .. '"', b.sent[#b.sent])
        assert.is_true(b.restartScheduled())
        assert.is_same(1, b.sock().closed)
    end)

    it("keeps the old program when the connection is lost half-way", function()
        local b = board()
        b.update("update 192.168.1.5 3000 " .. stamp)
        b.sock().callbacks.connection(b.sock())
        b.answer("200 OK", "Content-Length: " .. #body .. "\r\n", body:sub(1, 1000), 500)
        b.sock().callbacks.disconnection(b.sock(), -1)
        assert.is_same("old", b.files["lfs.img"])
        assert.is_same("oldstamp", b.files["lfs.stamp"])
        assert.is_same("oldstamp", b.files["lfs.tried"])
        assert.is_nil(b.files["lfs.img.new"])
        assert.is_same('update-failed "Cam 1" "' .. stamp .. '"', b.sent[#b.sent])
        assert.truthy(b.logs[#b.logs]:find("1000 of 3000 bytes", 1, true))
        assert.is_false(b.restartScheduled())
    end)

    it("fails when the hub has no program to give, and when the hub cannot be reached", function()
        local b = board()
        b.update("update 192.168.1.5 3000 " .. stamp)
        b.sock().callbacks.connection(b.sock())
        b.answer("404 Not Found", "Content-Length: 9\r\n", "Not Found", 1460)
        assert.is_same("old", b.files["lfs.img"])
        assert.is_same('update-failed "Cam 1" "' .. stamp .. '"', b.sent[#b.sent])
        assert.truthy(b.logs[#b.logs]:find("answered 404", 1, true))

        local c = board()
        c.update("update 192.168.1.5 3000 " .. stamp)
        c.sock().callbacks.disconnection(c.sock(), -1)
        assert.is_same('update-failed "Cam 1" "' .. stamp .. '"', c.sent[#c.sent])
        assert.truthy(c.logs[#c.logs]:find("could not reach the hub", 1, true))
        -- a second disconnection does not answer twice
        c.sock().callbacks.disconnection(c.sock(), -1)
        assert.is_same(1, #c.sent)
    end)

    it("fails on an empty program instead of installing nothing", function()
        local b = board()
        b.update("update 192.168.1.5 3000 " .. stamp)
        b.sock().callbacks.connection(b.sock())
        b.answer("200 OK", "Content-Length: 0\r\n", "", 1460)
        assert.is_same("old", b.files["lfs.img"])
        assert.is_same('update-failed "Cam 1" "' .. stamp .. '"', b.sent[#b.sent])
        assert.truthy(b.logs[#b.logs]:find("empty program", 1, true))
    end)

    it("fails when the board's storage refuses the file, or a write into it", function()
        local b = board()
        local open = _G.file.open
        _G.file.open = function(name, mode) if mode ~= "r" then return nil end return open(name, mode) end
        assert.is_false(b.update("update 192.168.1.5 3000 " .. stamp))
        assert.is_nil(b.sock())
        assert.is_same('update-failed "Cam 1" "' .. stamp .. '"', b.sent[#b.sent])
        assert.truthy(b.logs[#b.logs]:find("storage", 1, true))

        local c = board()
        local open2 = _G.file.open
        _G.file.open = function(name, mode)
            local f = open2(name, mode)
            if mode ~= "r" and f then f.write = function() return nil end end
            return f
        end
        c.update("update 192.168.1.5 3000 " .. stamp)
        c.sock().callbacks.connection(c.sock())
        c.answer("200 OK", "Content-Length: " .. #body .. "\r\n", body, 1460)
        assert.is_same("old", c.files["lfs.img"])
        assert.is_nil(c.files["lfs.img.new"])
        assert.is_same('update-failed "Cam 1" "' .. stamp .. '"', c.sent[#c.sent])
        assert.is_false(c.restartScheduled())
    end)

    it("gives up on a hub that connects but never answers, and on an answer that is no HTTP", function()
        local b = board()
        b.update("update 192.168.1.5 3000 " .. stamp)
        b.sock().callbacks.connection(b.sock())
        b.timeout()
        assert.is_same('update-failed "Cam 1" "' .. stamp .. '"', b.sent[#b.sent])
        assert.truthy(b.logs[#b.logs]:find("too long", 1, true))
        assert.is_same(1, b.sock().closed)
        -- late frames after giving up change nothing
        b.sock().callbacks.receive(b.sock(), "HTTP/1.0 200 OK\r\nContent-Length: 3\r\n\r\nabc")
        assert.is_same("old", b.files["lfs.img"])

        local c = board()
        c.update("update 192.168.1.5 3000 " .. stamp)
        c.sock().callbacks.connection(c.sock())
        c.sock().callbacks.receive(c.sock(), string.rep("x", 4500))
        assert.is_same('update-failed "Cam 1" "' .. stamp .. '"', c.sent[#c.sent])
        assert.truthy(c.logs[#c.logs]:find("made no sense", 1, true))
    end)

    it("fetches one program at a time, and a leftover from a cut-off download is replaced", function()
        local b = board({ files = { ["lfs.img"] = "old", ["lfs.stamp"] = "oldstamp", ["lfs.img.new"] = "half of something" } })
        b.update("update 192.168.1.5 3000 " .. stamp)
        local first = b.sock()
        assert.is_same("", b.files["lfs.img.new"])
        -- the button pressed again while it is being fetched: no second download, no second answer
        assert.is_true(b.update("update 192.168.1.5 3000 " .. stamp))
        assert.is_same(first, b.sock())
        assert.is_same(0, #b.sent)
        first.callbacks.connection(first)
        b.answer("200 OK", "Content-Length: " .. #body .. "\r\n", body, 1460)
        assert.is_same(body, b.files["lfs.img"])
        assert.is_same({ 'update-saved "Cam 1" "' .. stamp .. '"' }, b.sent)
        -- once it is done, another update may start
        _G.lfsStamp = nil
        b.update("update 192.168.1.5 3000 fedcba9876543210")
        assert.is_not_same(first, b.sock())
    end)

    it("says so when it already runs that build, without connecting", function()
        local b = board({ lfsStamp = stamp })
        assert.is_true(b.update("update 192.168.1.5 3000 " .. stamp))
        assert.is_nil(b.sock())
        assert.is_same('update-done "Cam 1" "' .. stamp .. '"', b.sent[1])
    end)

    it("refuses a garbled message", function()
        local b = board()
        assert.is_false(b.update("update 192.168.1.5 abc"))
        assert.is_nil(b.sock())
        assert.is_same('update-failed "Cam 1" ""', b.sent[1])
    end)

    it("takes exactly the announced bytes, even when the frames carry more", function()
        local b = board()
        b.update("update 192.168.1.5 3000 " .. stamp)
        b.sock().callbacks.connection(b.sock())
        b.answer("200 OK", "Content-Length: " .. #body .. "\r\n", body .. "trailing", 700)
        assert.is_same(body, b.files["lfs.img"])
        assert.is_same('update-saved "Cam 1" "' .. stamp .. '"', b.sent[#b.sent])
    end)
end)
