// Luau allows at most 200 local variables per function, and the module's top-level chunk is one of them.
// roblox-ts turns named imports and top-level const/function declarations into top-level locals, so this
// counts them in every compiled roblox/out/**/*.luau file, prints the worst offenders, and fails above the limit.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outRoot = resolve(here, "..", "out");
const LIMIT = 180;
const TOP = 5;

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".luau") ? [p] : [];
  });

const files = statSync(outRoot, { throwIfNoEntry: false })?.isDirectory() ? walk(outRoot) : [];
if (files.length === 0) {
  console.error(`check-locals: no .luau files found under ${outRoot}`);
  process.exit(1);
}

const counts = files.map((file) => {
  const text = readFileSync(file, "utf8");
  // Column-0 `local ` covers both `local x = ...` and `local function f`.
  const n = text.split(/\r?\n/).filter((line) => /^local(\s|$)/.test(line)).length;
  return { file: relative(outRoot, file), count: n };
});

counts.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
console.log(`check-locals: ${files.length} files, limit ${LIMIT} top-level locals (Luau hard limit 200)`);
console.log(`top ${TOP}:`);
for (const { file, count } of counts.slice(0, TOP)) {
  console.log(`  ${String(count).padStart(4)}  ${file}`);
}

const over = counts.filter((c) => c.count > LIMIT);
if (over.length > 0) {
  console.error(`check-locals: FAILED, ${over.length} file(s) exceed ${LIMIT} top-level locals:`);
  for (const { file, count } of over) console.error(`  ${count}  ${file}`);
  process.exit(1);
}
console.log("check-locals: OK");
