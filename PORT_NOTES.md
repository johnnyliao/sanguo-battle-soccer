# Port notes: sanguo-battle-soccer sim/ai/data to roblox-ts (feasibility spike)

Source: `/home/safe3admin/sanguo-battle-soccer` (read only). Copied (not symlinked) `src/sim`, `src/ai`,
`src/data` into `src/shared/` (test files excluded). Everything below was changed in this copy only.

## Toolchain (exact versions)

- Node v22.23.5 (`~/opt/node22/bin`)
- roblox-ts 3.0.0 (pins its own TypeScript 5.5.3 internally)
- @rbxts/types 1.0.963, @rbxts/compiler-types 3.0.0-types.0
- typescript 7.0.2 (top-level devDependency pulled in by the initial install; roblox-ts does not use it, candidate for removal)
- Rojo 7.7.1 (`~/.local/bin/rojo`, GitHub release linux-x86_64)
- Lune 0.11.1 (`~/.local/bin/lune`, GitHub release linux-x86_64)

## Compile-time incompatibilities fixed in the copy

roblox-ts 3 has no JS `Math`, `Infinity`, `Error`, `Array.from`, `flatMap`, `null`, `Array.length`
(arrays use `.size()`), `Object`/`JSON`/`structuredClone`/`charCodeAt`, and reserves some Lua global names.

1. `tsconfig.json`: added `"types": ["types"]` (roblox-ts 3 errors without it).
2. `src/shared/sim/hash.ts` deleted and its `export * from './hash'` removed from `sim/index.ts`.
   Reason: `hashState` uses `JSON.stringify`, `charCodeAt`, `padStart`; `cloneState` uses `structuredClone`.
   Neither is used by any non-test source in the web game, and the sim does not depend on them.
3. `Math.*` to `math.*` (Luau math library) in all copied files, about 200 call sites: `Math.max/min/abs/sqrt/cos/sin/atan/floor/sign`,
   `Math.PI` to `math.pi`, `Math.atan2` to `math.atan2`. Same IEEE double operations, so values are identical.
4. `Infinity` to `math.huge` (12 sites).
5. `Math.imul` to new `imul(a, b)` in `sim/rng.ts` (exported). It splits both operands into 16-bit halves so every
   intermediate is below 2^53, returns the low 32 bits as an unsigned number. `ai/random.ts` imports it.
   All consumers use bitwise ops, so unsigned vs signed representation does not change results.
   Verified that Luau `bit32` reduces values of 2^32 and above modulo 2^32 (the RNG sums rely on this).
6. `Math.round(x)` to `math.floor(x + 0.5)` (JS semantics: halves round toward +infinity, `math.round` rounds away from zero).
   Sites: `sim/state.ts` (halfTicks), `sim/actions.ts` (damage, 2 sites).
7. Array `.length` to `.size()` on array-typed expressions (about 27 sites in actions, pk, pkAi, ai, step, characters).
8. `throw new Error(msg)` to `error(msg)` (`sim/pk.ts` x4, `data/characters.ts` x1). Same throw semantics in Luau.
9. Numeric sort comparators to boolean "less than" predicates (roblox-ts `sort` requires a boolean):
   `sim/pk.ts` (`teamIdxs`: `(rating(b) - rating(a) || a - b) < 0`; `submitPkOrder`: `a < b`),
   `data/characters.ts` (`normalizeTeam`: `(rems[b] - rems[a] || a - b) < 0`). All comparators have a deterministic
   tiebreak, so the sorted order is the same as JS.
10. `Array.from({ length: N }, fn)` to an explicit loop in `ai/ai.ts` `createAIState` (same 10 entries).
11. `(['shu','wei','wu']).flatMap(getTeam)` to `[...getTeam('shu'), ...getTeam('wei'), ...getTeam('wu')]`
    in `data/characters.ts` (same order).
12. `null` to `undefined` in all code lines (about 120 sites in sim and ai; comments untouched). roblox-ts rejects `null`.
    Types `T | null` became `T | undefined`. The strict type checker never allowed mixing the two, so behaviour is unchanged.
13. Local `next` renamed `nextVal` in `data/characters.ts` `normalizeTeam` (`next` is a reserved identifier in roblox-ts).
14. `sim/actions.ts`: named import of 163 constants from `./constants` replaced by `import * as K from './constants'`,
    and each use written as `K.NAME` (337 replacements). Reason: roblox-ts emits one Luau `local` per named import, and the
    module had 289 top-level locals, above Luau's 200-register limit ("Out of local registers"). This would also fail
    on a real Roblox engine. Checked that no constant name is shadowed by a local declaration in that file.
    Other modules (step 85 locals, constants 194) are under the limit.

## Semantics checked, no change needed

- `%` is only applied to non-negative operands (`ticks % PK_METER_PERIOD`, `idx % 5`, `kicks.size() % TEAM_SIZE`, `(v * target) % total`), so Luau floored modulo matches JS.
- Truthiness: roblox-ts emits JS-style checks for `if (x)` / `||` on numbers (`0` and `NaN` falsy), so tiebreaks are safe.
- `>>>`, `^`, `|`, `&` compile to `bit32` ops; checked behaviour for out-of-range sums (mod 2^32).
- Only `Set` and array iteration are used (no `Map`/object iteration order dependence in the sim).

## Known remaining differences (not fixed, by design of the spike)

- Transcendental functions: Luau `math.sin/cos/atan/atan2` (glibc libm in Lune) differ from V8's `Math.*` in the last bit
  for a few percent of inputs (measured over 20 000 random inputs: sin 3.4%, cos 3.2%, atan 3.5%, atan2 17.6%).
  This is the only source of divergence found. See the determinism result in the spike report.
- Coverage gap: the determinism run does not reach the penalty shootout (`pk`) and `error()` branches. Those were only
  checked by reading the code.

## Build and run

```
cd /home/safe3admin/sanguo-roblox
npx rbxtsc                                                    # compile src -> out (+ include/RuntimeLib.lua)
~/.local/bin/rojo sourcemap default.project.json -o build/sourcemap.json
~/.local/bin/lune run lune/run.luau > build/luau_run.txt      # headless AI-vs-AI match, 14400 ticks
```

`src/client/main.client.ts` is a one-line scaffold so that `out/client` exists for the Rojo mapping.

`src/server/headless.ts` runs the match (seed 12345, shu vs wu, 2 x 120 s) and prints one exact-text line per tick
(`%.16e` per value) plus event counts. `lune/run.luau` is a minimal Roblox-environment shim: it builds an
Instance tree from the Rojo sourcemap, provides `game`/`script`, and loads each module with `loadstring` (cached).
