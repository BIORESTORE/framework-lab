import { test } from "node:test";
import assert from "node:assert/strict";
import { singlePrompt, chainStagePrompt, chainSynthesisPrompt, baseBlock } from "../src/promptBuilder.js";
import { byId } from "../src/catalog.js";

const inputs = { task: "Make an ad", reference: "Patek ads", target: "Heinz ad" };

test("baseBlock includes all provided inputs", () => {
  const b = baseBlock(inputs);
  assert.match(b, /REFERENCE \/ INSPIRATION:\nPatek ads/);
  assert.match(b, /TARGET DELIVERABLE:\nHeinz ad/);
  assert.match(b, /TASK:\nMake an ad/);
});

test("singlePrompt embeds framework instruction", () => {
  const p = singlePrompt(byId("cot"), inputs);
  assert.match(p, /Chain of Thought/);
  assert.match(p, /step by step in ONE linear path/);
  assert.match(p, /FINAL ANSWER:/);
});

test("image-prompt format adds the two-part response contract", () => {
  const p = singlePrompt(byId("structmap"), inputs, { format: "image-prompt" });
  assert.match(p, /APPROACH:/);
  assert.match(p, /IMAGE PROMPT:/);
  assert.match(p, /--ar 16:9/);
});

test("freestyle toggles divergence directive", () => {
  const free = singlePrompt(byId("blend"), inputs, { format: "image-prompt", freestyle: true });
  const locked = singlePrompt(byId("blend"), inputs, { format: "image-prompt", freestyle: false });
  assert.match(free, /DISTINCT medium, tone, and composition/);
  assert.match(locked, /Keep the reference's visual style/);
});

test("chainStagePrompt threads prior output", () => {
  const p = chainStagePrompt(byId("blend"), inputs, "PRIOR-XYZ");
  assert.match(p, /PRIOR STAGE OUTPUT:\nPRIOR-XYZ/);
  const first = chainStagePrompt(byId("genknow"), inputs, "");
  assert.doesNotMatch(first, /PRIOR STAGE OUTPUT/);
});

test("chainSynthesisPrompt respects format", () => {
  assert.match(chainSynthesisPrompt(inputs, "X", { format: "image-prompt" }), /Output ONLY the prompt/);
  assert.match(chainSynthesisPrompt(inputs, "X", { format: "answer" }), /FINAL ANSWER:/);
});
