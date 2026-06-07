import { byId } from "./catalog.js";
import {
  singlePrompt, chainStagePrompt, chainSynthesisPrompt,
  orch, SPECIALISTS, baseBlock
} from "./promptBuilder.js";

/**
 * Engine. Inject EITHER a provider instance { name, complete(prompt, opts) } or a
 * resolver fn (model) => provider. The resolver is what lets a single run use
 * DIFFERENT models at different steps (multi-model handoff); a plain instance is
 * wrapped so the model argument is ignored (single-model runs, older callers).
 *
 * Model assignment within a run:
 *   - opts.model          default model for any call that isn't given one
 *   - opts.roleModels[i]  model for the i-th call of an orchestration (call order)
 *   - chain stages may be { id, model } to put each stage on its own model
 * Each returned call carries `.model`, so the trace shows who did what.
 *
 * All run fns return { framework, calls:[{label,model,prompt,output}], output }.
 * `onEvent` (optional) gets progress callbacks: ({type, ...}).
 */
export function createEngine(providerOrResolve, onEvent = () => {}) {
  const baseResolve = typeof providerOrResolve === "function" ? providerOrResolve : () => providerOrResolve;
  const cache = new Map();
  const resolve = model => {
    const key = model ?? "__default__";
    if (!cache.has(key)) cache.set(key, baseResolve(model));
    return cache.get(key);
  };
  const roleModel = (opts, i) => (opts?.roleModels && opts.roleModels[i]) ?? opts?.model;

  const call = async (label, prompt, opts = {}) => {
    const provider = resolve(opts.model);
    onEvent({ type: "call:start", label, model: opts.model });
    const output = await provider.complete(prompt, opts);
    onEvent({ type: "call:end", label, model: opts.model });
    return { label, model: opts.model ?? provider.name, prompt, output };
  };

  /* ---------- orchestrated implementations ----------
     roleModels index map (so multi-model handoff is predictable):
       self-consistency / usc : 0,1,2 samples · 3 vote
       self-refine            : 0 draft · 1 critique · 2 revise
       cove                   : 0 draft · 1 verify · 2 correct
       reflexion              : 0 attempt · 1 feedback · 2 reflect · 3 retry
       debate                 : 0 advocate · 1 opponent · 2 judge
       moa                    : 0..n-1 specialists · n aggregator
       forest                 : 0,1,2 trees · 3 ensemble
  */
  const orchestrations = {
    "self-consistency": async (fw, inputs, opts) => {
      const samples = [];
      for (let i = 1; i <= 3; i++) {
        samples.push(await call(`sample ${i}`, singlePrompt(fw, inputs, opts), { temperature: 0.9, model: roleModel(opts, i - 1) }));
      }
      const judge = await call("majority vote", orch.vote(inputs, samples.map(s => s.output)), { temperature: 0, model: roleModel(opts, 3) });
      return { calls: [...samples, judge], output: judge.output };
    },

    usc: async (fw, inputs, opts) => {
      const samples = [];
      for (let i = 1; i <= 3; i++) {
        samples.push(await call(`sample ${i}`, singlePrompt(fw, inputs, opts), { temperature: 0.9, model: roleModel(opts, i - 1) }));
      }
      const judge = await call("consistency pick", orch.vote(inputs, samples.map(s => s.output)), { temperature: 0, model: roleModel(opts, 3) });
      return { calls: [...samples, judge], output: judge.output };
    },

    "self-refine": async (fw, inputs, opts) => {
      const draft = await call("draft", singlePrompt(fw, inputs, opts), { model: roleModel(opts, 0) });
      const critique = await call("critique", orch.critic(inputs, draft.output), { temperature: 0.3, model: roleModel(opts, 1) });
      const revision = await call("revise", orch.revise(inputs, draft.output, critique.output), { model: roleModel(opts, 2) });
      return { calls: [draft, critique, revision], output: revision.output };
    },

    cove: async (fw, inputs, opts) => {
      const draft = await call("draft", singlePrompt(fw, inputs, opts), { model: roleModel(opts, 0) });
      const verification = await call("verify", orch.verifyQs(inputs, draft.output), { temperature: 0.2, model: roleModel(opts, 1) });
      const corrected = await call("correct", orch.correct(inputs, draft.output, verification.output), { temperature: 0.2, model: roleModel(opts, 2) });
      return { calls: [draft, verification, corrected], output: corrected.output };
    },

    reflexion: async (fw, inputs, opts) => {
      const attempt = await call("attempt", singlePrompt(fw, inputs, opts), { model: roleModel(opts, 0) });
      const feedback = await call("feedback", orch.critic(inputs, attempt.output), { temperature: 0.3, model: roleModel(opts, 1) });
      const reflection = await call("self-reflection", orch.reflect(inputs, attempt.output, feedback.output), { model: roleModel(opts, 2) });
      const retry = await call("retry", orch.retry(inputs, reflection.output), { model: roleModel(opts, 3) });
      return { calls: [attempt, feedback, reflection, retry], output: retry.output };
    },

    debate: async (fw, inputs, opts) => {
      const a = await call("advocate", singlePrompt(fw, inputs, opts), { temperature: 0.8, model: roleModel(opts, 0) });
      const b = await call("opponent", orch.opponent(inputs, a.output), { temperature: 0.8, model: roleModel(opts, 1) });
      const judge = await call("judge", orch.judge(inputs, a.output, b.output), { temperature: 0, model: roleModel(opts, 2) });
      return { calls: [a, b, judge], output: judge.output };
    },

    moa: async (fw, inputs, opts = {}) => {
      const experts = [];
      for (let i = 0; i < SPECIALISTS.length; i++) {
        const persona = SPECIALISTS[i];
        experts.push(await call(persona.split(" ")[1] || persona, orch.specialist(inputs, persona), { temperature: 0.8, model: roleModel(opts, i) }));
      }
      const agg = await call("aggregate", orch.aggregate(inputs, experts.map(e => e.output)), { temperature: 0.2, model: roleModel(opts, SPECIALISTS.length) });
      return { calls: [...experts, agg], output: agg.output };
    },

    forest: async (fw, inputs, opts) => {
      const tot = byId("tot");
      const trees = [];
      for (let i = 1; i <= 3; i++) {
        trees.push(await call(`tree ${i}`, singlePrompt(tot, inputs, opts), { temperature: 0.9, model: roleModel(opts, i - 1) }));
      }
      const agg = await call("ensemble", orch.vote(inputs, trees.map(t => t.output)), { temperature: 0, model: roleModel(opts, 3) });
      return { calls: [...trees, agg], output: agg.output };
    }
  };

  /* ---------- public API ---------- */

  async function runSingle(idOrFw, inputs, opts = {}) {
    const fw = typeof idOrFw === "string" ? byId(idOrFw) : idOrFw;
    if (!fw) throw new Error(`Unknown framework: ${idOrFw}`);
    onEvent({ type: "framework:start", id: fw.id });
    let result;
    if (fw.orchestrated && orchestrations[fw.id]) {
      result = await orchestrations[fw.id](fw, inputs, opts);
    } else {
      const c = await call(fw.name, singlePrompt(fw, inputs, opts), { model: opts.model });
      result = { calls: [c], output: c.output };
    }
    onEvent({ type: "framework:end", id: fw.id });
    return { framework: fw, ...result };
  }

  async function runAll(ids, inputs, opts = {}) {
    const results = [];
    for (const id of ids) {
      try {
        results.push(await runSingle(id, inputs, opts));
      } catch (e) {
        results.push({ framework: byId(id) ?? { id, name: id }, calls: [], output: null, error: e.message });
      }
      onEvent({ type: "progress", done: results.length, total: ids.length });
    }
    return results;
  }

  // stages: array of framework ids OR { id, model } — model puts that stage on its own model.
  async function runChain(stages, inputs, opts = {}) {
    const norm = stages.map(s => typeof s === "string" ? { id: s, model: opts.model } : { id: s.id, model: s.model ?? opts.model });
    const out = [];
    let prior = "";
    for (const st of norm) {
      const fw = byId(st.id);
      if (!fw) throw new Error(`Unknown framework in chain: ${st.id}`);
      const c = await call(`stage:${fw.id}`, chainStagePrompt(fw, inputs, prior), { ...opts, model: st.model });
      prior = c.output;
      out.push({ framework: fw, ...c });
      onEvent({ type: "progress", done: out.length, total: norm.length + 1 });
    }
    const synth = await call("synthesis", chainSynthesisPrompt(inputs, prior, opts), { ...opts, temperature: 0.4, model: opts.synthesisModel ?? opts.model });
    return { stages: out, synthesis: synth, output: synth.output };
  }

  return { runSingle, runAll, runChain, resolve, baseBlock };
}
