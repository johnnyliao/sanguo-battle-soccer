# R0 Survey: roblox-ts compile errors for synced game code

Command: `npm run build` in `roblox/` (runs `sync` first, then `rbxtsc`). Full stripped output: `roblox/r0-errors.log`.
Sync result: 19 files copied into `roblox/src/shared/game/{sim,ai,data}` (0 test files).

**Total: 235 errors** (all in `src/shared/game/**`; no errors in `client/`, `server/`, or `shared/hello.ts`). Nothing was fixed in this pass.

## Root-cause summary

Most errors are not per-line code problems. They are symbols that the current type environment does not declare:
`tsconfig.json` sets `"noLib": true`, and `@rbxts/compiler-types` 3.0.0-types.0 only declares Array/Map/Set/Promise/String/Symbol. A grep of `node_modules/@rbxts` finds no declaration of `Math`, `Infinity`, `Error`, or `JSON`. The ES lib typings that would supply them are excluded. This is a hypothesis about the fix (a config or types change), not something tested here.

## Categories

| # | Category | Count | Code/Env | Error code |
|---|----------|------:|----------|-----------|
| 1 | `Math` not found | 182 | Env (type decl missing) | TS2304 |
| 2 | `.length` missing on arrays | 27 | Env (Array lib typing missing) | TS2339 |
| 3 | `Infinity` not found | 12 | Env | TS2304 |
| 4 | `Error` not found | 5 | Env | TS2304 |
| 5 | `JSON` / `structuredClone` not found | 2 | Env (and `structuredClone` has no roblox-ts equivalent; needs a code change) | TS2304 |
| 6 | `Number.toString` missing | 1 | Env | TS2339 |
| 7 | `Array.from` missing | 1 | Env (target lib) | TS2550 |
| 8 | `flatMap` missing (plus implicit-any follow-on) | 2 | Env (flatMap typing) | TS2339 + TS7006 |
| 9 | Sort comparator returns `number`, roblox-ts expects `boolean` | 3 | **Code** (API difference) | TS2345 |
| | **Total** | **235** | | |

Classification: 232 are environment/typing gaps (categories 1–8), and 3 are real roblox-ts API differences in code (category 9). Every error was classified; none is unclassified.

### Examples (file:line, message)

1. **Math not found**: `sim/field.ts:48:10` Cannot find name 'Math'. / `sim/actions.ts:328:20` Cannot find name 'Math'.
2. **.length missing**: `sim/actions.ts:987:18` Property 'length' does not exist on type 'Player[]'. / `sim/pk.ts:112:11` Property 'length' does not exist on type 'number[]'.
3. **Infinity not found**: `sim/actions.ts:1094:18` Cannot find name 'Infinity'. / `ai/ai.ts:457:47` Cannot find name 'Infinity'.
4. **Error not found**: `sim/pk.ts:59:30` Cannot find name 'Error'. / `data/characters.ts:86:27` Cannot find name 'Error'.
5. **JSON / structuredClone not found**: `sim/hash.ts:6:13` Cannot find name 'JSON'. / `sim/hash.ts:16:10` Cannot find name 'structuredClone'.
6. **Number.toString missing**: `sim/hash.ts:12:20` Property 'toString' does not exist on type 'number'.
7. **Array.from missing**: `ai/ai.ts:169:22` Property 'from' does not exist on type 'ArrayConstructor'. Do you need to change your target library?
8. **flatMap missing**: `data/characters.ts:102:75` Property 'flatMap' does not exist on type 'readonly ["shu", "wei", "wu"]'. / `data/characters.ts:102:84` Parameter 'c' implicitly has an 'any' type. (follow-on)
9. **Sort comparator type**: `sim/pk.ts:103:30` Argument of type '(a: number, b: number) => number' is not assignable to parameter of type '(a: number, b: number) => boolean'. / `data/characters.ts:60:46` (same message).

## Per-file counts

Columns: total, then Math / Infinity / length / Error / JSON-structuredClone-toString-from-flatMap-implicit-any / sort-comparator (TS2345).

| File | Total | Math | Infinity | length | Error | Lib-misc | Sort |
|------|------:|-----:|---------:|-------:|------:|---------:|-----:|
| sim/actions.ts | 135 | 119 | 5 | 11 | 0 | 0 | 0 |
| ai/ai.ts | 35 | 27 | 6 | 1 | 0 | 1 | 0 |
| sim/step.ts | 25 | 18 | 1 | 6 | 0 | 0 | 0 |
| sim/pk.ts | 14 | 3 | 0 | 5 | 4 | 0 | 2 |
| data/characters.ts | 9 | 3 | 0 | 2 | 1 | 2 | 1 |
| ai/pkAi.ts | 6 | 4 | 0 | 2 | 0 | 0 | 0 |
| sim/hash.ts | 4 | 1 | 0 | 0 | 0 | 3 | 0 |
| sim/rng.ts | 3 | 3 | 0 | 0 | 0 | 0 | 0 |
| ai/random.ts | 2 | 2 | 0 | 0 | 0 | 0 | 0 |
| sim/state.ts | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| sim/field.ts | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **235** | **182** | **12** | **27** | **5** | **6** | **3** |

Lib-misc = `JSON`/`structuredClone` (hash.ts 2), `toString` (hash.ts 1), `Array.from` (ai.ts 1), `flatMap` and its implicit-any follow-on (characters.ts 2). Totals: 2+1+1+2 = 6.
