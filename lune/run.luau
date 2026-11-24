-- Feasibility shim: runs roblox-ts output under Lune (no Roblox engine).
-- Builds a fake Instance tree from `rojo sourcemap` JSON (build/sourcemap.json, relative to the project root),
-- provides the `game` and `script` globals, and replaces `require` so it accepts Instances.
-- Run from the project root: lune run lune/run.luau

local fs = require("@lune/fs")
local serde = require("@lune/serde")

local Inst = {}
-- Methods first, then children by name (so `script.Parent.Promise` works as in Roblox).
Inst.__index = function(self, key)
	local method = Inst[key]
	if method ~= nil then
		return method
	end
	return self.Children[key]
end

function Inst:WaitForChild(name)
	local child = self.Children[name]
	if child == nil then
		error(("WaitForChild: '%s' not found under '%s'"):format(name, self.Name))
	end
	return child
end

function Inst:FindFirstChild(name)
	return self.Children[name]
end

-- Services that are not in the sourcemap tree. RuntimeLib only queries these at load time.
local fakeServices = {
	RunService = {
		IsRunning = function(_) return false end,
		IsClient = function(_) return false end,
		IsServer = function(_) return true end,
	},
}

function Inst:GetService(name)
	local child = self.Children[name]
	if child ~= nil then
		return child
	end
	local svc = fakeServices[name]
	if svc == nil then
		error(("GetService: no service '%s'"):format(name))
	end
	return svc
end

function Inst:IsLoaded()
	return true
end

local function build(node, parent)
	local inst = setmetatable({ Name = node.name, ClassName = node.className, Parent = parent, Children = {} }, Inst)
	for _, fp in node.filePaths or {} do
		if string.match(fp, "%.luau?$") ~= nil then
			inst.File = fp
			break
		end
	end
	for _, child in node.children or {} do
		inst.Children[child.name] = build(child, inst)
	end
	return inst
end

local sourcemap = serde.decode("json", fs.readFile("build/sourcemap.json"))
game = build(sourcemap, nil)

-- Compiles and runs one ModuleScript/Script once (cached, like Roblox), with `script` set to its Instance.
-- Nested requires restore `script` on return, so top-level `script` reads in the parent stay correct.
local cache = {}
local function loadInstance(inst)
	local hit = cache[inst]
	if hit ~= nil then
		return hit.value
	end
	if inst.File == nil then
		error(("cannot load '%s': no source file"):format(inst.Name))
	end
	local chunk, err = loadstring(fs.readFile(inst.File), "@" .. inst.File)
	if chunk == nil then
		error(err)
	end
	local prev = script
	script = inst
	local value = chunk()
	script = prev
	cache[inst] = { value = value }
	return value
end

require = function(target)
	if type(target) == "table" then
		return loadInstance(target)
	end
	error("require: only Instances are supported in this shim")
end

local entry = game:GetService("ServerScriptService").Children.Server.Children.headless
loadInstance(entry)
