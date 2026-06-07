import { getProvider } from "./providers/index.js";
import { createEngine } from "./engine.js";

/**
 * Run one mode ("single" | "all" | "chain") across several models, sequentially.
 * Each model gets its OWN provider + engine, so calls never cross-contaminate and
 * one model's failure is isolated to its own column (it doesn't abort the rest).
 *
 * Returns { mode, models, columns: [{ model, provider, mode, result, error }] }.
 *   - result: the engine's per-mode return — a single/chain object, or
 *     { results: [...] } for "all". null when that whole model errored.
 *   - error: the message when that model failed outright (e.g. bad slug / no key).
 */
export async function runAcrossModels({ models, mode, ids, inputs, opts = {}, env = process.env, onEvent = () => {} }) {
  const columns = [];
  for (const model of models) {
    onEvent({ type: "model:start", model });
    const provider = getProvider(env, { model });
    const engine = createEngine(provider, onEvent);
    let result = null, error = null;
    try {
      if (mode === "single")     result = await engine.runSingle(ids[0], inputs, opts);
      else if (mode === "chain") result = await engine.runChain(ids, inputs, opts);
      else                       result = { results: await engine.runAll(ids, inputs, opts) };
    } catch (e) {
      error = e.message;
    }
    columns.push({ model, provider: provider.name, mode, result, error });
    onEvent({ type: "model:end", model });
  }
  return { mode, models, columns };
}
