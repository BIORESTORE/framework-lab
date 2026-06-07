import { test } from "node:test";
import assert from "node:assert/strict";
import { getProvider } from "../src/providers/index.js";
import { openrouter } from "../src/providers/openrouter.js";

test("getProvider selects openrouter and binds the model", () => {
  const p = getProvider({ PROVIDER: "openrouter", OPENROUTER_API_KEY: "k" }, { model: "anthropic/claude-sonnet-4.5" });
  assert.equal(p.name, "openrouter:anthropic/claude-sonnet-4.5");
});

test("getProvider auto-detects openrouter from the key alone", () => {
  const p = getProvider({ OPENROUTER_API_KEY: "k" });
  assert.match(p.name, /^openrouter:/);
});

test("openrouter throws without a key", () => {
  assert.throws(() => openrouter({}), /OPENROUTER_API_KEY/);
});

test("model override flows into the provider name across providers", () => {
  assert.equal(getProvider({ PROVIDER: "mock" }, { model: "x" }).name, "mock:x");
  assert.equal(getProvider({ PROVIDER: "openai", OPENAI_API_KEY: "k" }, { model: "gpt-4o" }).name, "openai:gpt-4o");
  assert.equal(getProvider({ PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" }, { model: "claude-x" }).name, "anthropic:claude-x");
});

test("openrouter.complete posts an OpenAI-shaped body and parses choices", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, async json() { return { choices: [{ message: { content: "  hello  " } }] }; } };
  };
  try {
    const p = openrouter({ OPENROUTER_API_KEY: "k", OPENROUTER_APP_NAME: "fl-test" }, "openai/gpt-4o-mini");
    const out = await p.complete("hi", { temperature: 0.5, maxTokens: 50 });
    assert.equal(out, "hello");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /openrouter\.ai\/api\/v1\/chat\/completions/);
    const sent = JSON.parse(calls[0].init.body);
    assert.equal(sent.model, "openai/gpt-4o-mini");
    assert.equal(sent.temperature, 0.5);
    assert.equal(sent.max_tokens, 50);
    assert.deepEqual(sent.messages, [{ role: "user", content: "hi" }]);
    assert.equal(calls[0].init.headers.Authorization, "Bearer k");
    assert.equal(calls[0].init.headers["X-Title"], "fl-test");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("openrouter.complete surfaces HTTP errors", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 402, async text() { return "insufficient credits"; } });
  try {
    const p = openrouter({ OPENROUTER_API_KEY: "k" });
    await assert.rejects(() => p.complete("hi"), /OpenRouter 402/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
