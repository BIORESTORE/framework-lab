import { test } from "node:test";
import assert from "node:assert/strict";
import { runAcrossModels } from "../src/matrix.js";

const env = { PROVIDER: "mock" };
const inputs = { task: "t" };

test("single across 2 models = 2 columns, each labeled by model", async () => {
  const m = await runAcrossModels({ models: ["m1", "m2"], mode: "single", ids: ["cot"], inputs, env });
  assert.equal(m.columns.length, 2);
  assert.deepEqual(m.columns.map(c => c.provider), ["mock:m1", "mock:m2"]);
  assert.ok(m.columns[0].result.output.length > 0);
  assert.equal(m.columns[0].error, null);
});

test("chain across models yields staged results per column", async () => {
  const m = await runAcrossModels({ models: ["m1"], mode: "chain", ids: ["genknow", "blend"], inputs, env });
  assert.equal(m.columns[0].result.stages.length, 2);
  assert.ok(m.columns[0].result.output);
});

test("all across models wraps engine.runAll results", async () => {
  const m = await runAcrossModels({ models: ["m1"], mode: "all", ids: ["cot", "tot"], inputs, env });
  assert.equal(m.columns[0].result.results.length, 2);
});

test("a model failure is isolated to its own column", async () => {
  const m = await runAcrossModels({ models: ["m1", "m2"], mode: "single", ids: ["nope-not-real"], inputs, env });
  assert.ok(m.columns[0].error);
  assert.equal(m.columns[0].result, null);
  // the second model still ran and also reported its own (isolated) error
  assert.equal(m.columns.length, 2);
  assert.ok(m.columns[1].error);
});
