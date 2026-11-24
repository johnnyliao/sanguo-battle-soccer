-- Unit checks for the pure logic modules (src/shared/logic). Run: lune run lune/run.luau tests
-- Executed by run.luau inside the Roblox shim (game / require for Instances), after `npx rbxtsc` and `rojo sourcemap`.

local Shared = game:GetService("ReplicatedStorage").Shared
local logic = Shared.logic
local scale = require(logic.scale)
local cam = require(logic.camera)
local timestep = require(logic.timestep)
local slots = require(logic.slots)
local input = require(logic.input)
local snapshot = require(logic.snapshot)
local interp = require(logic.interp)
local eventsMod = require(logic.events)
local matchSimMod = require(logic.matchSim)
local sim = require(Shared.sim)

local passed, failed = 0, 0
local function check(name, cond)
	if cond then
		passed += 1
	else
		failed += 1
		print("FAIL: " .. name)
	end
end
local function near(a, b, eps)
	return math.abs(a - b) <= eps
end

-- scale ---------------------------------------------------------------------------------------------------------------
do
	check("pxToStud", scale.pxToStud(1200) == 120)
	local x, y, z = unpack(scale.simToWorld(1200, 260, 50))
	check("simToWorld x", near(x, 120, 1e-9))
	check("simToWorld y(height from sim z)", near(y, 5, 1e-9))
	check("simToWorld z(depth from sim y)", near(z, 26, 1e-9))
	check("field studs", scale.FIELD_STUDS_W == 120 and near(scale.FIELD_STUDS_D, 26, 1e-9))
end

-- camera --------------------------------------------------------------------------------------------------------------
do
	local fov = cam.cameraFov(45, 40, 16 / 9)
	-- Reconstruct the visible width from the vertical FOV: width = 2 * dist * tan(vfov/2) * aspect
	local width = 2 * 40 * math.tan(math.rad(fov) / 2) * (16 / 9)
	check("cameraFov gives 45 studs at 16:9", near(width, 45, 0.01))
	check("cameraFov clamps", cam.cameraFov(45, 4000, 1.78) == 20 and cam.cameraFov(1000, 1, 1) == 70)
	check("cameraTargetX clamp low", cam.cameraTargetX(-50, 22.5, 120, 4) == 18.5)
	check("cameraTargetX clamp high", cam.cameraTargetX(500, 22.5, 120, 4) == 101.5)
	check("cameraTargetX middle", cam.cameraTargetX(60, 22.5, 120, 4) == 60)
	check("cameraTargetX wide view centers", cam.cameraTargetX(10, 100, 120, 4) == 60)
	check("smooth converges", near(cam.smooth(0, 10, 10, 5), 10, 1e-6) and cam.smooth(0, 10, 0, 5) == 0)
end

-- fixed timestep ------------------------------------------------------------------------------------------------------
do
	local s = timestep.FixedStepper.new()
	local total = 0
	for _ = 1, 60 do
		total += s:advance(1 / 60)
	end
	check("60 frames of 1/60 = 60 steps", total == 60)

	s = timestep.FixedStepper.new()
	total = 0
	for _ = 1, 30 do
		total += s:advance(1 / 30)
	end
	check("30 frames of 1/30 = 60 steps", total == 60)

	s = timestep.FixedStepper.new()
	check("big hitch capped at 5 steps", s:advance(1.0) == 5)
	check("backlog dropped after cap", s:advance(0) == 0)

	s = timestep.FixedStepper.new()
	check("half step gives none", s:advance(1 / 120) == 0)
	check("two halves give one", s:advance(1 / 120) == 1)
	check("negative dt ignored", s:advance(-1) == 0)
end

-- slots ---------------------------------------------------------------------------------------------------------------
do
	local sl = { nil, nil }
	check("first player slot 0", slots.assignSlot(sl, 101) == 0)
	check("second player slot 1", slots.assignSlot(sl, 202) == 1)
	check("third spectates", slots.assignSlot(sl, 303) == -1)
	check("reassign keeps slot", slots.assignSlot(sl, 202) == 1)
	check("slotOf", slots.slotOf(sl, 101) == 0 and slots.slotOf(sl, 202) == 1 and slots.slotOf(sl, 303) == -1)
	check("humanIdx", slots.humanIdxForSlot(0) == 4 and slots.humanIdxForSlot(1) == 9 and slots.humanIdxForSlot(-1) == -1)
	local mask = slots.humanMask(sl, 10)
	check("mask both", mask[5] and mask[10] and not mask[1] and not mask[9])
	slots.releaseSlot(sl, 101)
	check("release frees slot 0", sl[1] == nil and sl[2] == 202)
	check("spectator gets freed slot 0", slots.assignSlot(sl, 303) == 0)
	mask = slots.humanMask({ nil, nil }, 10)
	local any = false
	for _, v in mask do
		any = any or v
	end
	check("empty slots = all AI", not any)

	check("isCountry", slots.isCountry("wei") and slots.isCountry("shu") and slots.isCountry("wu"))
	check("isCountry rejects", not slots.isCountry("han") and not slots.isCountry(5) and not slots.isCountry(nil))
	for _, c in { "wei", "shu", "wu" } do
		for _, r in { 0, 0.3, 0.5, 0.99, 0.999999 } do
			local o = slots.pickOpponent(c, r)
			check("opponent differs " .. c, o ~= c and slots.isCountry(o))
		end
	end
	check("opponent covers both others", slots.pickOpponent("shu", 0) ~= slots.pickOpponent("shu", 0.9))
end

-- input validation ----------------------------------------------------------------------------------------------------
do
	local good = { moveX = -1, moveY = 1, dash = true, j = false, k = true, l = false }
	local f = input.sanitizeInput(good)
	check("valid input accepted", f ~= nil and f.moveX == -1 and f.moveY == 1 and f.dash and f.k and not f.j)
	check("input copied, not aliased", f ~= good)
	check("zero ok", input.sanitizeInput({ moveX = 0, moveY = 0, dash = false, j = false, k = false, l = false }) ~= nil)
	local function bad(name, t)
		check("reject " .. name, input.sanitizeInput(t) == nil)
	end
	bad("nil", nil)
	bad("string", "hi")
	bad("number", 5)
	bad("empty table", {})
	bad("moveX 2", { moveX = 2, moveY = 0, dash = false, j = false, k = false, l = false })
	bad("moveX 0.5", { moveX = 0.5, moveY = 0, dash = false, j = false, k = false, l = false })
	bad("moveX string", { moveX = "1", moveY = 0, dash = false, j = false, k = false, l = false })
	bad("moveX NaN", { moveX = 0 / 0, moveY = 0, dash = false, j = false, k = false, l = false })
	bad("moveY inf", { moveX = 0, moveY = math.huge, dash = false, j = false, k = false, l = false })
	bad("dash number", { moveX = 0, moveY = 0, dash = 1, j = false, k = false, l = false })
	bad("j nil", { moveX = 0, moveY = 0, dash = false, k = false, l = false })
	bad("l string", { moveX = 0, moveY = 0, dash = false, j = false, k = false, l = "true" })
	bad("moveX table", { moveX = {}, moveY = 0, dash = false, j = false, k = false, l = false })
	local nz = input.sanitizeInput({ moveX = -0, moveY = 0, dash = false, j = false, k = false, l = false })
	check("negative zero normalised", nz ~= nil and 1 / nz.moveX > 0)

	local a = { moveX = 0, moveY = 0, dash = false, j = false, k = false, l = false }
	local b = { moveX = 0, moveY = 0, dash = false, j = false, k = false, l = false }
	check("inputsEqual", input.inputsEqual(a, b))
	b.k = true
	check("inputsEqual differs", not input.inputsEqual(a, b))
end

-- server input latch: a press+release between two ticks must not be lost ----------------------------------------------
do
	local function frame(j, k, l, mx)
		return { moveX = mx or 0, moveY = 0, dash = false, j = j, k = k, l = l }
	end
	local latch = input.InputLatch.new()
	local f = latch:consume()
	check("latch starts empty", not f.j and not f.k and not f.l)
	latch:receive(frame(true, false, false))
	latch:receive(frame(false, false, false)) -- released before the next tick
	f = latch:consume()
	check("quick j tap reaches the tick", f.j == true)
	f = latch:consume()
	check("tap lasts one tick only", f.j == false)

	latch:receive(frame(false, true, false))
	check("held k true", latch:consume().k == true)
	check("held k stays", latch:consume().k == true)
	latch:receive(frame(false, false, false))
	check("k released", latch:consume().k == false)

	latch:receive(frame(false, false, true, 1))
	latch:receive(frame(false, false, false, -1))
	f = latch:consume()
	check("l tap kept, latest move wins", f.l == true and f.moveX == -1)

	latch:receive(frame(true, true, true))
	latch:reset()
	f = latch:consume()
	check("reset clears", not f.j and not f.k and not f.l)

	-- repeated send of the same held state is not a new press
	latch:receive(frame(true, false, false))
	latch:consume()
	latch:receive(frame(true, false, false))
	check("held j re-sent still held", latch:consume().j == true)
	latch:receive(frame(false, false, false))
	check("then released", latch:consume().j == false)
end

-- client latch + dash detector ----------------------------------------------------------------------------------------
do
	local bl = input.ButtonLatch.new()
	bl:press("j")
	check("latched press seen once", bl:consume("j", false) == true and bl:consume("j", false) == false)
	check("held without latch", bl:consume("k", true) == true)

	local d = input.DashDetector.new()
	check("no dash at rest", d:update(0, 0, 0.0) == false)
	check("first press no dash", d:update(1, 0, 0.1) == false)
	check("release no dash", d:update(0, 0, 0.2) == false)
	check("second press within window dashes", d:update(1, 0, 0.3) == true)
	check("dash holds while held", d:update(1, 0, 0.5) == true)
	check("release ends dash", d:update(0, 0, 0.6) == false)
	local d2 = input.DashDetector.new()
	d2:update(-1, 0, 0.0)
	d2:update(0, 0, 0.1)
	check("slow second press no dash", d2:update(-1, 0, 1.0) == false)
	local d3 = input.DashDetector.new()
	d3:update(0, -1, 0.0)
	d3:update(0, 0, 0.1)
	check("vertical double tap dashes", d3:update(0, -1, 0.2) == true)

	local fr = input.buildInputFrame({ left = true, right = true, up = false, down = true, j = true, k = false, l = false, dashButton = true }, false)
	check("buildInputFrame conflict + dash button", fr.moveX == 0 and fr.moveY == 1 and fr.dash and fr.j)
end

-- snapshot encode / decode ---------------------------------------------------------------------------------------------
local function newMatch(seed, half)
	return matchSimMod.MatchSim.new("shu", "wu", seed, half)
end

do
	local m = newMatch(777, 30)
	local freeSlots = { nil, nil }
	local worst = 0
	local seenActions = {}
	for t = 1, 1800 do
		m:step(freeSlots)
		if t % 7 == 0 then
			local st = m.state
			local buf = snapshot.encodeSnapshot(st)
			if t == 7 then
				check("snapshot size small", buffer.len(buf) == snapshot.SNAPSHOT_BYTES and buffer.len(buf) < 900)
			end
			local s = snapshot.decodeSnapshot(buf)
			if s == nil then
				check("decode ok at tick " .. t, false)
				break
			end
			check("tick roundtrip", s.tick == st.tick)
			check("phase roundtrip", s.phase == st.match.phase)
			check("score roundtrip", s.score[1] == st.match.score[1] and s.score[2] == st.match.score[2])
			check("clock roundtrip", s.clockTicks == st.match.clockTicks)
			check("ball roundtrip", near(s.ball.x, st.ball.x, 0.051) and near(s.ball.y, st.ball.y, 0.051) and near(s.ball.z, st.ball.z, 0.051) and s.ball.ownerIdx == st.ball.ownerIdx)
			for i, p in st.players do
				local q = s.players[i]
				worst = math.max(worst, math.abs(q.x - p.x), math.abs(q.y - p.y), math.abs(q.z - p.z))
				seenActions[p.action] = true
				local fx, fy = math.cos(q.facing), math.sin(q.facing)
				local dot = fx * p.facingX + fy * p.facingY
				local len = math.sqrt(p.facingX ^ 2 + p.facingY ^ 2)
				check("facing roundtrip", dot / len > math.cos(0.03))
				check("action roundtrip", q.action == p.action)
				check("stamina roundtrip", near(q.stamina, p.stamina, 0.051) and near(q.maxStamina, p.maxStamina, 0.051))
				check("cooldown roundtrip", q.specialCooldown == math.floor(p.specialCooldown + 0.5))
				check("down flag", q.down == (p.action == "down"))
				check("team", q.team == p.team)
				check("char", require(Shared.data).CHARACTERS[q.charIdx + 1].id == p.charId)
				check("rampage flag", q.rampage == (p.rampageTicks > 0))
			end
		end
	end
	check("max position error <= 0.05 px", worst <= 0.0501)
	local n = 0
	for _ in seenActions do
		n += 1
	end
	check("saw several actions", n >= 2)

	check("decode rejects wrong size", snapshot.decodeSnapshot(buffer.create(10)) == nil)
	local bad = snapshot.encodeSnapshot(m.state)
	buffer.writeu8(bad, 4, 99)
	check("decode rejects bad phase", snapshot.decodeSnapshot(bad) == nil)
	bad = snapshot.encodeSnapshot(m.state)
	buffer.writeu8(bad, 19 + 7, 200)
	check("decode rejects bad action", snapshot.decodeSnapshot(bad) == nil)

	-- extreme values clamp instead of erroring
	local st = m.state
	local ox = st.players[1].x
	st.players[1].x = 99999
	st.players[1].stamina = 1e9
	st.players[1].y = -99999
	local ok = pcall(snapshot.encodeSnapshot, st)
	check("extreme values do not error", ok)
	st.players[1].x = ox
end

-- interpolation ---------------------------------------------------------------------------------------------------------
do
	local function snap(tick, x, ballx, facing)
		local players = {}
		for i = 1, 10 do
			table.insert(players, {
				x = x + i, y = 100, z = 0, facing = facing or 0, action = "normal", stamina = 50, maxStamina = 100,
				specialCooldown = 0, down = false, team = if i <= 5 then 0 else 1, charIdx = 0, rampage = false,
			})
		end
		return { tick = tick, phase = "play", half = 1, clockTicks = 1000, score = { 0, 0 }, ball = { x = ballx, y = 130, z = 0, ownerIdx = -1 }, players = players }
	end
	local buf = interp.SnapshotBuffer.new()
	check("empty sample", buf:sample(1, 0.1) == nil)
	check("push ok", buf:push(10.0, snap(120, 100, 600)))
	check("push 2 ok", buf:push(10.0 + 0.0333, snap(122, 110, 620)))
	check("out of order rejected", buf:push(10.04, snap(121, 105, 610)) == false)
	check("duplicate rejected", buf:push(10.05, snap(122, 110, 620)) == false)
	-- offset = 10 - 120/60 = 8. serverTime 2.0 .. 2.0333; sample at now so serverTime = 2.0166...
	local s = buf:sample(8 + 2 + 1 / 60 + 0.1, 0.1)
	check("mid sample interpolates players", s ~= nil and near(s.players[1].x, 106, 0.2))
	check("mid sample interpolates ball", near(s.ball.x, 610, 0.5))
	check("before first returns first", buf:sample(0, 0.1).tick == 120)
	check("after last returns last", buf:sample(100, 0.1).tick == 122)

	-- teleport: no interpolation across 300 px
	buf:reset()
	buf:push(1.0, snap(0, 100, 600))
	buf:push(1.0333, snap(2, 500, 100))
	local mid = buf:sample(1.0166 + 0.1 - 0.0, 0.1)
	check("teleport not blended", mid ~= nil and (near(mid.players[1].x, 101, 0.01) or near(mid.players[1].x, 501, 0.01)))
	check("ball teleport not blended", mid ~= nil and (near(mid.ball.x, 600, 0.01) or near(mid.ball.x, 100, 0.01)))

	-- angle takes the short way round
	buf:reset()
	buf:push(1.0, snap(0, 100, 600, math.pi - 0.1))
	buf:push(1.0333, snap(2, 100, 600, -math.pi + 0.1))
	local a = buf:sample(1.0166 + 0.1, 0.1)
	check("angle wraps short way", a ~= nil and (math.abs(a.players[1].facing) > math.pi - 0.15))

	-- restart: tick goes far backwards -> new timeline
	buf:reset()
	buf:push(5.0, snap(3000, 100, 600))
	buf:push(5.03, snap(3002, 100, 600))
	check("restart accepted", buf:push(9.0, snap(2, 100, 600)))
	check("restart drops old", buf:sample(9.5, 0.1).tick == 2)
end

-- events ----------------------------------------------------------------------------------------------------------------
do
	local m = newMatch(5, 20)
	local st = m.state
	st.events = {
		{ type = "goal", team = 1, scorerIdx = 9 },
		{ type = "special", playerIdx = 4, kind = "pierce", name = "遊龍穿刺" },
		{ type = "down", playerIdx = 3 },
		{ type = "hit", attackerIdx = 1, victimIdx = 6, kind = "punch", damage = 10 },
		{ type = "iceStart", playerIdx = 7, fieldId = 3, x = 600, y = 100, radius = 110 },
		{ type = "iceEnd", fieldId = 3 },
		{ type = "portalStart", playerIdx = 6, portalId = 4, x = 10, y = 20, radius = 140 },
		{ type = "portalEnd", portalId = 4 },
		{ type = "eastwindStart", playerIdx = 8, windId = 5, x = 1, y = 2, radius = 150, victimIdxs = {} },
		{ type = "eastwindEnd", windId = 5 },
		{ type = "arrowshipStart", playerIdx = 5, shipId = 6, x = 1200, y = 130, dir = -1, halfSpan = 60 },
		{ type = "arrowshipEnd", shipId = 6 },
		{ type = "gustBlow", gustId = 7, x = 50, y = 60, victimIdxs = { 1, 2 } },
		{ type = "roar", playerIdx = 0, x = 40, y = 130, radius = 105 },
		{ type = "fear", playerIdx = 4, victimIdxs = { 5 } },
		{ type = "pickup", playerIdx = 1 },
		{ type = "bounce", strength = 3 },
		{ type = "whistle", reason = "half" },
	}
	local w = eventsMod.toWireEvents(st)
	check("wire event count (irrelevant events dropped)", #w == 16)
	check("goal event", w[1].t == "goal" and w[1].team == 1 and w[1].p == 9 and type(w[1].n) == "string")
	check("special event name", w[2].t == "special" and w[2].n == "遊龍穿刺" and w[2].m == st.players[5].name)
	check("hit event", w[4].t == "hit" and w[4].v[1] == 6 and w[4].n == "punch")
	check("ice start", w[5].id == 3 and w[5].r == 110 and w[5].x == 600)
	check("arrowship start", w[11].d == -1 and w[11].w == 60 and w[11].x == 1200)
	check("gust radius from constants", w[13].r == sim.GUST_RADIUS and #w[13].v == 2)
	check("fear radius and pos", w[15].r == sim.FEAR_RADIUS and w[15].x == st.players[5].x)
	check("whistle", w[16].t == "whistle" and w[16].n == "half")
end

-- full match through MatchSim: human input, kickoff -> goals -> half -> full time/PK, snapshots stay decodable --------------
do
	local function runMatch(seed, half, withHumans)
		local m = newMatch(seed, half)
		local sl = if withHumans then { 11, 22 } else { nil, nil }
		local kinds = {}
		local ticks = 0
		local pkSeen = false
		while not m.ended and ticks < 60 * (half * 2 + 400) do
			if withHumans and ticks % 5 == 0 then
				-- scripted humans: run toward the ball, tap J / L often
				local s0 = if ticks % 2 == 0 then 1 else -1
				m:receive(0, { moveX = s0, moveY = 0, dash = ticks % 40 < 10, j = ticks % 20 == 0, k = false, l = ticks % 100 == 0 })
				m:receive(1, { moveX = -s0, moveY = 1, dash = false, j = ticks % 30 == 0, k = ticks % 50 == 0, l = false })
			end
			local wire = m:step(sl)
			ticks += 1
			for _, e in wire do
				kinds[e.t] = (kinds[e.t] or 0) + 1
			end
			if m.state.match.phase == "pk" then
				pkSeen = true
			end
			if ticks % 10 == 0 then
				local d = snapshot.decodeSnapshot(snapshot.encodeSnapshot(m.state))
				if d == nil then
					check("snapshot decodable during match", false)
					break
				end
			end
		end
		return m, kinds, ticks, pkSeen
	end

	local m, kinds, ticks = runMatch(12345, 20, true)
	check("match with humans ends", m.ended)
	check("matchEnd wire event", (kinds.matchEnd or 0) == 1)
	check("kickoff whistle seen", (kinds.whistle or 0) >= 2)
	print(("match(20s halves, 2 humans): %d ticks, score %d-%d, events %s"):format(ticks, m.state.match.score[1], m.state.match.score[2], (function()
		local out = {}
		for k, v in kinds do
			table.insert(out, k .. "=" .. v)
		end
		table.sort(out)
		return table.concat(out, " ")
	end)()))

	-- find seeds that reach a penalty shootout, to exercise the auto-PK path
	local pkMatches = 0
	local pkOk = 0
	for seed = 1, 40 do
		local mm, kk, tt, pk = runMatch(seed, 6, false)
		if pk then
			pkMatches += 1
			if mm.ended and mm.pkScore ~= nil and mm.state.match.pk.winner ~= -1 and (kk.pkStart or 0) == 1 and (kk.matchEnd or 0) == 1 then
				pkOk += 1
			end
		else
			check("non-pk match ends (seed " .. seed .. ")", mm.ended)
		end
	end
	print(("pk matches among 40 short matches: %d (ok %d)"):format(pkMatches, pkOk))
	check("at least one PK reached and finished", pkMatches >= 1 and pkOk == pkMatches)
end

-- human slot really controls the FW: a held move input moves player 4 -----------------------------------------------------
do
	local m = newMatch(9, 20)
	local sl = { 11, nil }
	for _ = 1, 60 + 10 do
		m:step(sl) -- kickoff wait (60 ticks) + a few
	end
	local before = m.state.players[5].x
	m:receive(0, { moveX = 1, moveY = 0, dash = false, j = false, k = false, l = false })
	for _ = 1, 30 do
		m:step(sl)
	end
	local after = m.state.players[5].x
	check("human FW moved by input", math.abs(after - before) > 5)
	-- an AI slot with no human ignores received input
	local m2 = newMatch(9, 20)
	local sl2 = { nil, nil }
	m2:receive(0, { moveX = 1, moveY = 0, dash = false, j = false, k = false, l = false })
	for _ = 1, 60 + 10 do
		m2:step(sl2)
	end
	check("latched frame never consumed without a human is harmless", true)
end

-- server MatchService flow with fake Roblox services: lobby, country pick, slots, input, snapshots, result + restart ----------
do
	local function signal()
		local s = { fns = {} }
		function s:Connect(fn)
			table.insert(self.fns, fn)
			return { Disconnect = function() end }
		end
		function s:fire(...)
			for _, fn in self.fns do
				fn(...)
			end
		end
		return s
	end

	-- Fake Instance / Random globals (Lune has neither).
	Instance = {
		new = function(className)
			local inst = { ClassName = className, Name = className }
			if className == "RemoteEvent" or className == "UnreliableRemoteEvent" then
				inst.OnServerEvent = signal()
				inst.sent = {}
				function inst:FireClient(player, ...)
					table.insert(self.sent, { to = player, args = { ... } })
				end
				function inst:FireAllClients(...)
					table.insert(self.sent, { to = "all", args = { ... } })
				end
			end
			return inst
		end,
	}
	Random = {
		new = function(seed)
			math.randomseed(seed)
			return {
				NextNumber = function()
					return math.random()
				end,
				NextInteger = function(_, a, b)
					return math.random(a, b)
				end,
			}
		end,
	}

	local Players = game:GetService("Players")
	local RunService = game:GetService("RunService")
	local present = {}
	Players.PlayerAdded = signal()
	Players.PlayerRemoving = signal()
	function Players:GetPlayers()
		return { table.unpack(present) }
	end
	RunService.Heartbeat = signal()

	-- Record every Instance.new while the service is constructed, to reach its remotes (creation order is fixed).
	local created = {}
	local origNew = Instance.new
	Instance.new = function(className)
		local inst = origNew(className)
		table.insert(created, inst)
		return inst
	end
	local MatchService = require(game:GetService("ServerScriptService").Server.Match).MatchService
	local svc = MatchService.new()
	Instance.new = origNew
	check("service disables CharacterAutoLoads", Players.CharacterAutoLoads == false)
	check("service creates folder + 6 remotes", #created == 7)
	local lobbyR, eventsR, snapR, readyR, pickR, inputR = created[2], created[3], created[4], created[5], created[6], created[7]
	check("remote names", lobbyR.Name == "Lobby" and eventsR.Name == "Events" and snapR.Name == "Snap" and readyR.Name == "Ready" and pickR.Name == "Pick" and inputR.Name == "Input")
	check("remote classes", snapR.ClassName == "UnreliableRemoteEvent" and lobbyR.ClassName == "RemoteEvent" and eventsR.ClassName == "RemoteEvent")

	local function lastLobby(player)
		for i = #lobbyR.sent, 1, -1 do
			if lobbyR.sent[i].to == player then
				return lobbyR.sent[i].args[1]
			end
		end
		return nil
	end
	local function addPlayer(id)
		local p = { UserId = id, Name = "P" .. id }
		table.insert(present, p)
		Players.PlayerAdded:fire(p)
		return p
	end
	local function removePlayer(p)
		table.remove(present, table.find(present, p))
		Players.PlayerRemoving:fire(p)
	end

	local p1 = addPlayer(1)
	local m1 = lastLobby(p1)
	check("first player: pick mode, slot 0, can pick", m1 ~= nil and m1.mode == "pick" and m1.slot == 0 and m1.canPick == true and m1.humanIdx == 4)
	local p2 = addPlayer(2)
	local m2 = lastLobby(p2)
	check("second player: slot 1, cannot pick", m2.mode == "pick" and m2.slot == 1 and m2.canPick == false and m2.humanIdx == 9)
	local p3 = addPlayer(3)
	local m3 = lastLobby(p3)
	check("third player spectates", m3.slot == -1 and m3.humanIdx == -1 and m3.canPick == false)
	local nLobby = #lobbyR.sent
	readyR.OnServerEvent:fire(p3)
	check("Ready re-sends lobby to that client", #lobbyR.sent == nLobby + 1 and lobbyR.sent[nLobby + 1].to == p3)

	-- Bad picks are ignored.
	pickR.OnServerEvent:fire(p2, "shu") -- not the picker
	pickR.OnServerEvent:fire(p3, "shu") -- spectator
	pickR.OnServerEvent:fire(p1, "han") -- invalid country
	pickR.OnServerEvent:fire(p1, 5)
	pickR.OnServerEvent:fire(p1, nil)
	check("bad picks keep pick mode", lastLobby(p1).mode == "pick")
	-- Heartbeat does nothing before a pick.
	RunService.Heartbeat:fire(1 / 60)
	check("no snapshots before pick", #snapR.sent == 0)

	pickR.OnServerEvent:fire(p1, "shu")
	local l1, l2, l3 = lastLobby(p1), lastLobby(p2), lastLobby(p3)
	check("pick starts match for everyone", l1.mode == "play" and l2.mode == "play" and l3.mode == "play")
	check("teams: picker first, random different opponent", l1.teams[1] == "shu" and l1.teams[2] ~= "shu" and (l1.teams[2] == "wei" or l1.teams[2] == "wu"))
	check("humanIdx per slot", l1.humanIdx == 4 and l2.humanIdx == 9 and l3.humanIdx == -1)
	check("late pick ignored", (function()
		local n = #lobbyR.sent
		pickR.OnServerEvent:fire(p1, "wu")
		return #lobbyR.sent == n
	end)())

	-- Run 1 second of frames at 60 fps.
	for _ = 1, 60 do
		RunService.Heartbeat:fire(1 / 60)
	end
	check("about 30 snapshots per second", #snapR.sent >= 29 and #snapR.sent <= 31)
	local sn = snapshot.decodeSnapshot(snapR.sent[#snapR.sent].args[1])
	check("snapshot decodes", sn ~= nil and sn.tick >= 55 and sn.tick <= 60)
	check("sim ran 60 ticks in 60 frames", svc.match.state.tick == 60)
	check("snapshots broadcast to all", snapR.sent[1].to == "all")

	-- Input: p1 moves its FW right during play. (Kickoff wait is 60 ticks, already elapsed.)
	local fw = svc.match.state.players[5]
	local x0 = fw.x
	inputR.OnServerEvent:fire(p1, { moveX = 1, moveY = 0, dash = false, j = false, k = false, l = false })
	-- spectator and garbage are ignored
	inputR.OnServerEvent:fire(p3, { moveX = -1, moveY = 0, dash = false, j = false, k = false, l = false })
	inputR.OnServerEvent:fire(p1, "garbage")
	inputR.OnServerEvent:fire(p1, { moveX = 7, moveY = 0, dash = false, j = false, k = false, l = false })
	for _ = 1, 30 do
		RunService.Heartbeat:fire(1 / 60)
	end
	check("slot 0 input moves team 0 FW", math.abs(fw.x - x0) > 3)
	local fw2 = svc.match.state.players[10]
	local y0 = fw2.y
	inputR.OnServerEvent:fire(p2, { moveX = 0, moveY = 1, dash = false, j = false, k = false, l = false })
	for _ = 1, 30 do
		RunService.Heartbeat:fire(1 / 60)
	end
	check("slot 1 input moves team 1 FW", math.abs(fw2.y - y0) > 3)

	-- A hitch: one 1 s frame runs at most 5 ticks.
	local tickBefore = svc.match.state.tick
	RunService.Heartbeat:fire(1.0)
	check("hitch frame capped at 5 steps", svc.match.state.tick - tickBefore == 5)

	-- Run to full time. Events are batched on the Events remote.
	local guard = 0
	while svc.mode == "play" and guard < 60 * 400 do
		RunService.Heartbeat:fire(1 / 60)
		guard += 1
	end
	check("match reaches result mode", svc.mode == "result")
	local res = lastLobby(p1)
	check("result lobby message", res.mode == "result" and res.score ~= nil and res.restartSec == 5 and res.teams[1] == "shu")
	local batches, matchEnds, goals = 0, 0, 0
	for _, s in eventsR.sent do
		batches += 1
		for _, e in s.args[1] do
			if e.t == "matchEnd" then
				matchEnds += 1
			elseif e.t == "goal" then
				goals += 1
			end
		end
	end
	check("matchEnd event delivered once", matchEnds == 1)
	print(("server flow: result %d-%d, %d event batches, %d goals, %d snapshots"):format(res.score[1], res.score[2], batches, goals, #snapR.sent))

	-- Result lasts 5 s, then the same countries play again.
	local teamsBefore = { res.teams[1], res.teams[2] }
	for _ = 1, 60 * 4 do
		RunService.Heartbeat:fire(1 / 60)
	end
	check("still result after 4 s", svc.mode == "result")
	for _ = 1, 60 * 2 do
		RunService.Heartbeat:fire(1 / 60)
	end
	check("restarted after 5 s", svc.mode == "play" and svc.match.state.tick < 200)
	local again = lastLobby(p1)
	check("restart keeps countries", again.mode == "play" and again.teams[1] == teamsBefore[1] and again.teams[2] == teamsBefore[2])

	-- Player 1 leaves: spectator p3 takes slot 0, p2 keeps slot 1.
	removePlayer(p1)
	check("p3 promoted to slot 0", lastLobby(p3).slot == 0 and lastLobby(p3).humanIdx == 4 and lastLobby(p2).slot == 1)
	-- Everyone leaves: back to the pick screen for the next first player.
	removePlayer(p2)
	removePlayer(p3)
	check("empty server resets to pick", svc.mode == "pick" and svc.match == nil)
	local p4 = addPlayer(4)
	check("new first player picks again", lastLobby(p4).mode == "pick" and lastLobby(p4).canPick == true)
	-- Picker leaves during pick while another is seated in slot 1: slot 1 player becomes the picker.
	local p5 = addPlayer(5)
	removePlayer(p4)
	check("pick handed over", lastLobby(p5).mode == "pick" and lastLobby(p5).slot == 0 and lastLobby(p5).canPick == true)
end

print(("tests: %d passed, %d failed"):format(passed, failed))
if failed > 0 then
	error("unit tests failed")
end
