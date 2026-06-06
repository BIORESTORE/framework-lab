import { anthropic } from "./anthropic.js";
import { openai } from "./openai.js";
import { mock } from "./mock.js";

/** Returns { name, complete(prompt, {system, temperature}) -> string } */
export function getProvider(env = process.env) {
  const want = (env.PROVIDER || "").toLowerCase();
  if (want === "mock") return mock();
  if (want === "anthropic" || (!want && env.ANTHROPIC_API_KEY)) {
    if (env.ANTHROPIC_API_KEY) return anthropic(env);
  }
  if (want === "openai" || (!want && env.OPENAI_API_KEY)) {
    if (env.OPENAI_API_KEY) return openai(env);
  }
  return mock(); // offline default so tests/dev always work
}
