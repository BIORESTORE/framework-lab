import { anthropic } from "./anthropic.js";
import { openai } from "./openai.js";
import { openrouter } from "./openrouter.js";
import { mock } from "./mock.js";

/**
 * Returns { name, complete(prompt, {system, temperature, model}) -> string }.
 * Pass { model } to bind a specific model for this run — that's how compare
 * mode (src/matrix.js) runs the same pipeline across several models.
 */
export function getProvider(env = process.env, { model } = {}) {
  const want = (env.PROVIDER || "").toLowerCase();
  if (want === "mock") return mock(env, model);
  if (want === "openrouter" || (!want && env.OPENROUTER_API_KEY)) {
    if (env.OPENROUTER_API_KEY) return openrouter(env, model);
  }
  if (want === "anthropic" || (!want && env.ANTHROPIC_API_KEY)) {
    if (env.ANTHROPIC_API_KEY) return anthropic(env, model);
  }
  if (want === "openai" || (!want && env.OPENAI_API_KEY)) {
    if (env.OPENAI_API_KEY) return openai(env, model);
  }
  return mock(env, model); // offline default so tests/dev always work
}
