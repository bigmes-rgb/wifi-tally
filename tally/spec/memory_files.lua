-- an in-memory SPIFFS for the specs, with the calls my-settings.lua and my-wifi-handover.lua make.
-- readline keeps the line ending, as NodeMCU's does.
return function(initial)
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

