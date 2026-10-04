insulate("myHandleReceive", function()
    require "spec.nodemcu-mock"
    require "src.my-tally"
    require "src.my-settings"

    local currentOpR, currentOpG, currentOpB, currentStR, currentStG, currentStB, currentPattern, currentStepDuration
    _G.MyLed = {
        static = function(operatorR, operatorG, operatorB, stageR, stageG, stageB)
            currentOpR = operatorR
            currentOpG = operatorG
            currentOpB = operatorB
            currentStR = stageR
            currentStG = stageG
            currentStB = stageB
            currentPattern = nil
            currentStepDuration = nil
        end,
        flash = function(operatorR, operatorG, operatorB, stageR, stageG, stageB, pattern, stepDuration)
            currentOpR = operatorR
            currentOpG = operatorG
            currentOpB = operatorB
            currentStR = stageR
            currentStG = stageG
            currentStB = stageB
            currentPattern = pattern
            currentStepDuration = stepDuration
        end,
    }

    local realIt = it
    it = function(name, func)
        insulate(function()
            realIt(name, func)
        end)
    end

    it("parse a package with BLACK", function()
        myHandleReceive("O000/000/000 S000/000/000")
        assert.is_same({0, 0, 0}, {currentOpR, currentOpG, currentOpB})
        assert.is_same({0, 0, 0}, {currentStR, currentStG, currentStB})
        assert.is_nil(currentPattern)
        assert.is_nil(currentStepDuration)
    end)
    it("parses a package with strange colors", function()
        myHandleReceive("O010/020/030 S040/050/060")
        assert.is_same({10, 20, 30}, {currentOpR, currentOpG, currentOpB})
        assert.is_same({40, 50, 60}, {currentStR, currentStG, currentStB})
        assert.is_nil(currentPattern)
        assert.is_nil(currentStepDuration)
    end)
    it("parses a package with strange colors and a flash pattern", function()
        myHandleReceive("O010/020/030 S040/050/060 0xAA 300")
        assert.is_same({10, 20, 30}, {currentOpR, currentOpG, currentOpB})
        assert.is_same({40, 50, 60}, {currentStR, currentStG, currentStB})
        assert.is_same({true, false, true, false, true, false, true, false}, currentPattern)
        assert.is_same(300, currentStepDuration)
    end)
    it("parses a quick flash pattern", function()
        myHandleReceive("O255/255/255 S255/255/255 0x80 300")
        assert.is_same({true, false, false, false, false, false, false, false}, currentPattern)
        assert.is_same(300, currentStepDuration)
    end)
    it("should log a warning on too long package", function()
        local warnings = {}
        _G.MyLog = {
            warning = function(warning) table.insert(warnings, warning) end,
            getWarnings = function() return warnings end,
        }
        myHandleReceive("this is a very much too long message")
        assert.is_same(1, #warnings)
    end)
    it("should log a warning on too short package", function()
        local warnings = {}
        _G.MyLog = {
            warning = function(warning) table.insert(warnings, warning) end,
            getWarnings = function() return warnings end,
        }
        myHandleReceive("shrt")
        assert.is_same(1, #warnings)
    end)
end)

insulate("hub discovery", function()
    require "spec.nodemcu-mock"

    local sentTo = {}
    local logs = {}
    _G.net = {
        createUDPSocket = function()
            return {
                on = function() end,
                listen = function() end,
                send = function(_, port, ip, data) table.insert(sentTo, ip .. ":" .. port) end,
            }
        end,
    }
    _G.MyWifi = {
        isConnected = function() return true end,
        getBroadcast = function() return "192.168.1.255" end,
    }
    _G.MyLog = {
        info = function(msg) table.insert(logs, msg) end,
        warning = function(msg) table.insert(logs, msg) end,
        error = function(msg) table.insert(logs, msg) end,
    }
    _G.MyLed = {
        static = function() end,
        flash = function() end,
        waitForServerConnection = function() end,
    }

    local realIt = it
    it = function(name, func)
        insulate(function()
            realIt(name, func)
        end)
    end

    local function useSettings(hubIp)
        _G.MySettings = {
            hubIp = function() return hubIp end,
            hubPort = function() return 7411 end,
            name = function() return "Doe" end,
        }
        sentTo = {}
        require "src.my-tally"
        MyTally:connect()
    end

    it("talks to the configured hub when hub.ip is set", function()
        useSettings("10.10.1.1")
        assert.is_same("10.10.1.1", MyTally.hubAddress())
        assert.is_same({"10.10.1.1:7411"}, sentTo)
    end)
    it("broadcasts when no hub.ip is set", function()
        useSettings(nil)
        assert.is_same("192.168.1.255", MyTally.hubAddress())
        assert.is_same({"192.168.1.255:7411"}, sentTo)
    end)
    it("learns the hub address from the first valid reply", function()
        useSettings(nil)
        myHandleReceive("O000/000/000 S000/000/000", "192.168.1.20")
        assert.is_same("192.168.1.20", MyTally.hubAddress())
        MyTally:sendInfo()
        assert.is_same("192.168.1.20:7411", sentTo[#sentTo])
    end)
    it("keeps the configured hub.ip even when a reply comes from elsewhere", function()
        useSettings("10.10.1.1")
        myHandleReceive("O000/000/000 S000/000/000", "192.168.1.20")
        assert.is_same("10.10.1.1", MyTally.hubAddress())
    end)
    it("does not learn an address from an invalid package", function()
        useSettings(nil)
        myHandleReceive("garbage", "192.168.1.20")
        assert.is_same("192.168.1.255", MyTally.hubAddress())
    end)
    it("leaves the LEDs alone while the hub tests the wiring over USB", function()
        useSettings(nil)
        local shown = 0
        MyLed.static = function() shown = shown + 1 end
        _G.testMode = true
        myHandleReceive("O255/000/000 S000/000/000", "192.168.1.20")
        assert.is_same(0, shown)
        assert.is_same("192.168.1.255", MyTally.hubAddress())
        _G.testMode = nil
        myHandleReceive("O255/000/000 S000/000/000", "192.168.1.20")
        assert.is_same(1, shown)
    end)
    it("ignores other tallies' broadcasts without logging", function()
        useSettings(nil)
        local before = #logs
        myHandleReceive('tally-ho "Cam 2"', "192.168.1.21")
        myHandleReceive('log "Cam 2" INFO "hello"', "192.168.1.21")
        assert.is_same("192.168.1.255", MyTally.hubAddress())
        assert.is_same(before, #logs)
        assert.is_false(MyTally:isConnected())
    end)
end)
