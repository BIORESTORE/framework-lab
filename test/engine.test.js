import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../src/engine.js";
import { mock } from "../src/providers/mock.js";
import { FRAMEWORKS } from "../src/catalog.js";

const inputs = { task: "Test task" };

test("runSingle: plain framework = 1 call", async () => {
  const engine = createEngine(mock());
  const res = await engine.runSingle("cot", inputs);
  assert.equal(res.calls.length, 1);
  assert.ok(res.output.includes("[mock 1]"));
});

test("runSingle: self-refine orchestrates 3 calls (draft→critique→revise)", async () => {
  const engine = createEngine(mock());
  const res = await engine.runSingle("self-refine", inputs);
  assert.equal(res.calls.length, 3);
  assert.deepEqual(res.calls.map(c => c.label), ["draft", "critique", "revise"]);
  // revision prompt must contain the draft and the critique
  assert.ok(res.calls[2].prompt.includes(res.calls[0].output));
  assert.ok(res.calls[2].prompt.includes(res.calls[1].output));
});

test("runSingle: self-consistency = 3 samples + vote", async () => {
  const engine = createEngine(mock());
  const res = await engine.runSingle("self-consistency", inputs);
  assert.equal(res.calls.length, 4);
  assert.ok(res.calls[3].prompt.includes("CANDIDATE 1:"));
  assert.ok(res.calls[3].prompt.includes("CANDIDATE 3:"));
});

test("runSingle: debate = advocate, opponent, judge; judge sees both", async () => {
  const engine = createEngine(mock());
  const res = await engine.runSingle("debate", inputs);
  assert.deepEqual(res.calls.map(c => c.label), ["advocate", "opponent", "judge"]);
  assert.ok(res.calls[2].prompt.includes(res.calls[0].output));
  assert.ok(res.calls[2].prompt.includes(res.calls[1].output));
});

test("runChain threads each stage's output into the next", async () => {
  const engine = createEngine(mock());
  const res = await engine.runChain(["genknow", "step-back", "blend"], inputs);
  assert.equal(res.stages.length, 3);
  assert.ok(res.stages[1].prompt.includes(res.stages[0].output));
  assert.ok(res.stages[2].prompt.includes(res.stages[1].output));
  assert.ok(res.synthesis.prompt.includes(res.stages[2].output));
});

test("runAll continues past an unknown framework", async () => {
  const engine = createEngine(mock());
  const res = await engine.runAll(["cot", "nope-not-real", "tot"], inputs);
  assert.equal(res.length, 3);
  assert.ok(res[1].error);
  assert.ok(!res[0].error && !res[2].error);
});

test("every catalog framework runs without throwing (mock)", async () => {
  const engine = createEngine(mock());
  for (const f of FRAMEWORKS) {
    const res = await engine.runSingle(f.id, inputs);
    assert.ok(res.output && res.output.length > 0, `${f.id} produced no output`);
  }
});

test("catalog integrity: unique ids, required fields", () => {
  const ids = new Set();
  for (const f of FRAMEWORKS) {
    assert.ok(!ids.has(f.id), `duplicate id ${f.id}`);
    ids.add(f.id);
    for (const field of ["name", "category", "kind", "shape", "useCase", "instruction"]) {
      assert.ok(f[field], `${f.id} missing ${field}`);
    }
  }
});

// ---- multi-model handoff ----

test("runChain puts each stage on its own model and still threads output", async () => {
  const engine = createEngine(m => mock({}, m));
  const res = await engine.runChain([{ id: "genknow", model: "A" }, { id: "blend", model: "B" }], inputs);
  assert.equal(res.stages[0].model, "A");
  assert.equal(res.stages[1].model, "B");
  assert.ok(res.stages[1].prompt.includes(res.stages[0].output)); // handoff intact across models
});

test("roleModels assign models to an orchestration's steps in order", async () => {
  const engine = createEngine(m => mock({}, m));
  const res = await engine.runSingle("debate", inputs, { roleModels: ["A", "B", "C"] });
  assert.deepEqual(res.calls.map(c => c.model), ["A", "B", "C"]);
});

test("opts.model is the fallback for any step without an explicit model", async () => {
  const engine = createEngine(m => mock({}, m));
  const res = await engine.runSingle("self-refine", inputs, { model: "D", roleModels: ["A"] });
  assert.deepEqual(res.calls.map(c => c.model), ["A", "D", "D"]); // draft=A, critique/revise fall back to D
});

test("the resolver is asked for each step's model (real per-model routing)", async () => {
  const asked = [];
  const engine = createEngine(m => { asked.push(m); return mock({}, m); });
  await engine.runSingle("debate", inputs, { roleModels: ["A", "B", "C"] });
  assert.deepEqual(asked, ["A", "B", "C"]);
});
