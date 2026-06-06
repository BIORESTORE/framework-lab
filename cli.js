#!/usr/bin/env node
/**
 * framework-lab CLI
 *
 *   node cli.js list
 *   node cli.js run <id>            --task "..." [--reference "..."] [--target "..."] [--format image-prompt]
 *   node cli.js run-all [cat|ids]   --task "..."   e.g. run-all linear | run-all cot,tot,debate | run-all all
 *   node cli.js chain <id,id,...>   --task "..."
 *   node cli.js presets
 *
 * Results are echoed and saved to ./results/<timestamp>.json
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { FRAMEWORKS, CATEGORIES, PRESET_CHAINS, byId } from "./src/catalog.js";
import { getProvider } from "./src/providers/index.js";
import { createEngine } from "./src/engine.js";

// minimal .env loader (zero deps)
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const args = process.argv.slice(2);
const cmd = args[0];
const flag = name => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};

const inputs = { task: flag("task"), reference: flag("reference"), target: flag("target") };
const opts = { format: flag("format") || "answer", freestyle: flag("lock-style") === undefined };

const provider = getProvider();
const engine = createEngine(provider, ev => {
  if (ev.type === "call:start") process.stderr.write(`  · ${ev.label}...\n`);
  if (ev.type === "progress") process.stderr.write(`[${ev.done}/${ev.total}]\n`);
});

function save(name, data) {
  mkdirSync("results", { recursive: true });
  const file = `results/${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(data, null, 2));
  console.error(`\nsaved → ${file}`);
}

function requireTask() {
  if (!inputs.task && !inputs.reference) {
    console.error(`--task "..." is required (and/or --reference/--target)`); process.exit(1);
  }
}

const hr = () => console.log("\n" + "─".repeat(72) + "\n");

if (cmd === "list") {
  for (const [key, label] of Object.entries(CATEGORIES)) {
    console.log(`\n${label}`);
    for (const f of FRAMEWORKS.filter(f => f.category === key)) {
      console.log(`  ${f.id.padEnd(18)} ${f.name.padEnd(38)} ${f.orchestrated ? "[orchestrated]" : ""}`);
    }
  }
  console.log(`\n${FRAMEWORKS.length} frameworks. Provider: ${provider.name}`);
} else if (cmd === "presets") {
  for (const p of PRESET_CHAINS) console.log(`${p.name.padEnd(24)} ${p.ids.join(" → ")}`);
} else if (cmd === "run") {
  requireTask();
  const fw = byId(args[1]);
  if (!fw) { console.error(`Unknown framework "${args[1]}" — try: node cli.js list`); process.exit(1); }
  const res = await engine.runSingle(fw.id, inputs, opts);
  hr(); console.log(`■ ${fw.name}  (${res.calls.length} call${res.calls.length > 1 ? "s" : ""}, provider ${provider.name})`); hr();
  console.log(res.output);
  save(fw.id, res);
} else if (cmd === "run-all") {
  requireTask();
  const sel = args[1] && !args[1].startsWith("--") ? args[1] : "all";
  let ids;
  if (sel === "all") ids = FRAMEWORKS.map(f => f.id);
  else if (CATEGORIES[sel]) ids = FRAMEWORKS.filter(f => f.category === sel).map(f => f.id);
  else ids = sel.split(",").map(s => s.trim());
  const results = await engine.runAll(ids, inputs, opts);
  for (const r of results) {
    hr(); console.log(`■ ${r.framework.name}${r.error ? "  [ERROR]" : ""}`); hr();
    console.log(r.error ?? r.output);
  }
  save(`run-all-${sel}`, results);
} else if (cmd === "chain") {
  requireTask();
  const preset = PRESET_CHAINS.find(p => p.name.toLowerCase() === (args[1] || "").toLowerCase());
  const ids = preset ? preset.ids : (args[1] || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!ids.length) { console.error("chain needs ids: node cli.js chain cot,self-refine --task '...'"); process.exit(1); }
  const res = await engine.runChain(ids, inputs, opts);
  for (const s of res.stages) { hr(); console.log(`▼ ${s.framework.name}`); hr(); console.log(s.output); }
  hr(); console.log("■ SYNTHESIS"); hr(); console.log(res.output);
  save(`chain-${ids.join("_")}`, res);
} else {
  console.log(`framework-lab — test bench for reasoning & transfer frameworks
Usage:
  node cli.js list
  node cli.js presets
  node cli.js run <id>          --task "..." [--reference "..."] [--target "..."] [--format image-prompt]
  node cli.js run-all <all|category|id,id> --task "..."
  node cli.js chain <id,id,...> --task "..."
Provider: set PROVIDER/keys in .env (defaults to offline mock).`);
}
