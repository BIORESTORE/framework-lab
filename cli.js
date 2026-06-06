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
 * Models:
 *   --model  <slug>           run everything on one model        e.g. anthropic/claude-sonnet-4.5
 *   --models <slug,slug,...>  COMPARE: run the whole thing on each model, in parallel columns
 *   --roles  <slug,slug,...>  HANDOFF: assign models to an orchestration's steps in order
 *                             (e.g. debate = advocate,opponent,judge)
 *   chain step syntax id:slug HANDOFF: put each chain stage on its own model
 *                             e.g. chain plan:anthropic/claude-sonnet-4.5,pot:openai/gpt-4o-mini
 *
 * Results are echoed and saved to ./results/<timestamp>.json
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { FRAMEWORKS, CATEGORIES, PRESET_CHAINS, byId } from "./src/catalog.js";
import { getProvider } from "./src/providers/index.js";
import { createEngine } from "./src/engine.js";
import { runAcrossModels } from "./src/matrix.js";

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
const list = name => (flag(name) || "").split(",").map(s => s.trim()).filter(Boolean);

const inputs = { task: flag("task"), reference: flag("reference"), target: flag("target") };
const roleModels = list("roles");
const opts = { format: flag("format") || "answer", freestyle: flag("lock-style") === undefined };
if (roleModels.length) opts.roleModels = roleModels;
const model = flag("model");
const models = list("models");

const onEvent = ev => {
  if (ev.type === "model:start") process.stderr.write(`\n── model: ${ev.model} ──\n`);
  if (ev.type === "call:start") process.stderr.write(`  · ${ev.label}${ev.model ? ` [${ev.model}]` : ""}...\n`);
  if (ev.type === "progress") process.stderr.write(`[${ev.done}/${ev.total}]\n`);
};

// A model resolver so a single run can hand off across models; falls back to --model / env default.
const resolve = m => getProvider(process.env, { model: m ?? model });
const provider = resolve(undefined); // for display only
const engine = createEngine(resolve, onEvent);

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

// ---- render helpers (shared by normal + compare output) ----
function printSingle(r) {
  hr(); console.log(`■ ${r.framework.name}  (${r.calls.length} call${r.calls.length > 1 ? "s" : ""})${r.error ? "  [ERROR]" : ""}`); hr();
  if (r.calls && r.calls.length > 1) console.log("  steps: " + r.calls.map(c => `${c.label}[${c.model}]`).join(" → ") + "\n");
  console.log(r.error ?? r.output);
}
function printAll(results) {
  for (const r of results) { hr(); console.log(`■ ${r.framework.name}${r.error ? "  [ERROR]" : ""}`); hr(); console.log(r.error ?? r.output); }
}
function printChain(res) {
  for (const s of res.stages) { hr(); console.log(`▼ ${s.framework.name}  [${s.model}]`); hr(); console.log(s.output); }
  hr(); console.log(`■ SYNTHESIS  [${res.synthesis.model}]`); hr(); console.log(res.output);
}
function printMatrix(matrix) {
  for (const col of matrix.columns) {
    console.log("\n" + "═".repeat(72));
    console.log(`MODEL: ${col.model}   (${col.provider})`);
    console.log("═".repeat(72));
    if (col.error) { console.log(`[ERROR] ${col.error}`); continue; }
    if (col.mode === "single") printSingle(col.result);
    else if (col.mode === "chain") printChain(col.result);
    else printAll(col.result.results);
  }
}

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
  if (models.length) {
    const matrix = await runAcrossModels({ models, mode: "single", ids: [fw.id], inputs, opts, onEvent });
    printMatrix(matrix); save(`compare-${fw.id}`, matrix);
  } else {
    const res = await engine.runSingle(fw.id, inputs, opts);
    printSingle(res); save(fw.id, res);
  }
} else if (cmd === "run-all") {
  requireTask();
  const sel = args[1] && !args[1].startsWith("--") ? args[1] : "all";
  let ids;
  if (sel === "all") ids = FRAMEWORKS.map(f => f.id);
  else if (CATEGORIES[sel]) ids = FRAMEWORKS.filter(f => f.category === sel).map(f => f.id);
  else ids = sel.split(",").map(s => s.trim());
  if (models.length) {
    const matrix = await runAcrossModels({ models, mode: "all", ids, inputs, opts, onEvent });
    printMatrix(matrix); save(`compare-run-all-${sel}`, matrix);
  } else {
    const results = await engine.runAll(ids, inputs, opts);
    printAll(results); save(`run-all-${sel}`, results);
  }
} else if (cmd === "chain") {
  requireTask();
  const preset = PRESET_CHAINS.find(p => p.name.toLowerCase() === (args[1] || "").toLowerCase());
  const raw = preset ? preset.ids : (args[1] || "").split(",").map(s => s.trim()).filter(Boolean);
  // each stage may be "id" or "id:model-slug" (slugs can contain ":" so split on the FIRST colon only)
  const stages = raw.map(s => {
    if (typeof s !== "string") return s;
    const i = s.indexOf(":");
    return i === -1 ? { id: s } : { id: s.slice(0, i), model: s.slice(i + 1) };
  });
  const ids = stages.map(s => s.id);
  if (!ids.length) { console.error("chain needs ids: node cli.js chain cot,self-refine --task '...'"); process.exit(1); }
  if (models.length) {
    // compare wins over inline stage models: run the framework-only chain on each model in parallel
    const matrix = await runAcrossModels({ models, mode: "chain", ids, inputs, opts, onEvent });
    printMatrix(matrix); save(`compare-chain-${ids.join("_")}`, matrix);
  } else {
    const res = await engine.runChain(stages, inputs, opts);
    printChain(res); save(`chain-${ids.join("_")}`, res);
  }
} else {
  console.log(`framework-lab — test bench for reasoning & transfer frameworks
Usage:
  node cli.js list
  node cli.js presets
  node cli.js run <id>          --task "..." [--reference "..."] [--target "..."] [--format image-prompt]
  node cli.js run-all <all|category|id,id> --task "..."
  node cli.js chain <id,id,...> --task "..."

Models:
  --model  <slug>           run everything on one model (e.g. anthropic/claude-sonnet-4.5)
  --models <slug,slug,...>  compare: run the whole thing on each model, in parallel columns
  --roles  <slug,slug,...>  handoff: assign models to an orchestration's steps in order
  chain id:slug,id:slug     handoff: put each chain stage on its own model
Provider: set PROVIDER/keys in .env (defaults to offline mock).`);
}
