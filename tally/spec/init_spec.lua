-- init.lua: the light program runs from the board's flash (LFS) once it is loaded there, and from its .lc files
-- otherwise. A build that does not load is tried once, so the light cannot restart over and over.

local function board(opts)
    local files = {}
    for name, content in pairs(opts.files or {}) do files[name] = content end
    local printed, reloads = {}, {}
    _G.print = function(s) table.insert(printed, tostring(s)) end
    _G.file = {
        exists = function(name) return files[name] ~= nil end,
        remove = function(name) files[name] = nil end,
        open = function(name, mode)
            if mode == "r" then
                if files[name] == nil then return nil end
                return { read = function() return files[name] end, close = function() end }
            end
            files[name] = ""
            return { write = function(_, s) files[name] = files[name] .. s end, close = function() end }
        end,
    }
    _G.node = {
        -- what is in the flash: the stamp module, if any
        flashindex = function(name)
            if name == "lfs-stamp" and opts.flashStamp then return function() return opts.flashStamp end end
            if opts.flashStamp and opts.flashModules and opts.flashModules[name] then return opts.flashModules[name] end
            return nil, 0x40200000, 0x100000, 0x15000 -- not loaded, or no such module
        end,
        flashreload = function(img)
            table.insert(reloads, img)
            return opts.reloadError or error("restart") -- a successful reload restarts the board
        end,
    }
    package.loaded["my-app"] = nil
    local appLoadedFrom = nil
    -- the board's file loader sits at package.loaders[2]; the flash loader must come before it
    table.insert(package.loaders, 2, function(name)
        if name == "my-app" then return function() appLoadedFrom = "file"; return true end end
    end)
    local ok, err = pcall(dofile, "src/init.lua")
    return { files = files, printed = printed, reloads = reloads, appLoadedFrom = appLoadedFrom, loaders = package.loaders, ok = ok, err = err }
end

describe("init.lua", function()
    local savedLoaders
    before_each(function() savedLoaders = {} for i, l in ipairs(package.loaders) do savedLoaders[i] = l end end)
    after_each(function() package.loaders = savedLoaders; package.loaded["my-app"] = nil; _G.print = print end)

    it("runs the files when there is no flash image", function()
        local b = board({ files = { ["my-app.lc"] = "x" } })
        assert.is_true(b.ok, tostring(b.err))
        assert.is_same({}, b.reloads)
        assert.is_same("file", b.appLoadedFrom)
    end)

    it("loads a new build into the flash once, and remembers the try", function()
        local b = board({ files = { ["lfs.img"] = "img", ["lfs.stamp"] = "abc\n" } })
        assert.is_same({ "lfs.img" }, b.reloads)
        assert.is_same("abc", b.files["lfs.tried"])
    end)

    it("does not try the same build again when loading it did not restart the board", function()
        local b = board({ files = { ["lfs.img"] = "img", ["lfs.stamp"] = "abc", ["lfs.tried"] = "abc" } })
        assert.is_same({}, b.reloads)
        assert.is_same("file", b.appLoadedFrom)
        assert.truthy(table.concat(b.printed, "\n"):find("did not load", 1, true))
    end)

    it("runs from the flash when it holds the current build, and forgets the try", function()
        local fromFlash = false
        local b = board({
            files = { ["lfs.img"] = "img", ["lfs.stamp"] = "abc", ["lfs.tried"] = "abc", ["my-app.lc"] = "x" },
            flashStamp = "abc",
            flashModules = { ["my-app"] = function() fromFlash = true; return true end },
        })
        assert.is_true(b.ok, tostring(b.err))
        assert.is_same({}, b.reloads)
        assert.is_true(fromFlash)
        assert.is_nil(b.appLoadedFrom)
        assert.is_nil(b.files["lfs.tried"])
    end)

    it("loads a newer build over an older one in the flash", function()
        local b = board({ files = { ["lfs.img"] = "img", ["lfs.stamp"] = "new" }, flashStamp = "old" })
        assert.is_same({ "lfs.img" }, b.reloads)
    end)

    it("still starts the program when the flash check itself fails", function()
        local b = board({ files = { ["lfs.img"] = "img", ["lfs.stamp"] = "abc" }, reloadError = nil })
        _G.node.flashindex = function() error("boom") end
        package.loaded["my-app"] = nil
        local ok = pcall(dofile, "src/init.lua")
        assert.is_true(ok)
    end)
end)
