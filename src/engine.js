import { byId } from "./catalog.js";
import {
  singlePrompt, chainStagePrompt, chainSynthesisPrompt,
  orch, SPECIALISTS, baseBlock
} from "./promptBuilder.js";

/**
 * Engine. Inject a provider: { name, complete(prompt, opts) -> string }.
 * All run fns return { framework, calls:[{label,prompt,output}], output }.
 * `onEvent` (optional) gets progress callbacks: ({type, ...}).
 */
export function createEngine(provider, onEvent = () => {}) {
  const call = async (label, prompt, opts = {}) => {
    onEvent({ type: "call:start", label });
    const output = await provider.complete(prompt, opts);
    onEvent({ type: "call:end", label });
    return { label, prompt, output };
  };

  /* ---------- orchestrated implementations ---------- */
  const orchestrations = {
    "self-consistency": async (fw, inputs, opts) => {
      const samples = [];
      for (let i = 1; i <= 3; i++) {
        samples.push(await call(`sample ${i}`, singlePrompt(fw, inputs, opts), { temperature: 0.9 }));
      }
      const judge = await call("majority vote", orch.vote(inputs, samples.map(s => s.output)), { temperature: 0 });
      return { calls: [...samples, judge], output: judge.output };
    },

    usc: async (fw, inputs, opts) => {
      const samples = [];
      for (let i = 1; i <= 3; i++) {
        samples.push(await call(`sample ${i}`, singlePrompt(fw, inputs, opts), { temperature: 0.9 }));
      }
      const judge = await call("consistency pick", orch.vote(inputs, samples.map(s => s.output)), { temperature: 0 });
      return { calls: [...samples, judge], output: judge.output };
    },

    "self-refine": async (fw, inputs, opts) => {
      const draft = await call("draft", singlePrompt(fw, inputs, opts));
      const critique = await call("critique", orch.critic(inputs, draft.output), { temperature: 0.3 });
      const revision = await call("revise", orch.revise(inputs, draft.output, critique.output));
      return { calls: [draft, critique, revision], output: revision.output };
    },

    cove: async (fw, inputs, opts) => {
      const draft = await call("draft", singlePrompt(fw, inputs, opts));
      const verification = await call("verify", orch.verifyQs(inputs, draft.output), { temperature: 0.2 });
      const corrected = await call("correct", orch.correct(inputs, draft.output, verification.output), { temperature: 0.2 });
      return { calls: [draft, verification, corrected], output: corrected.output };
    },

    reflexion: async (fw, inputs, opts) => {
      const attempt = await call("attempt", singlePrompt(fw, inputs, opts));
      const feedback = await call("feedback", orch.critic(inputs, attempt.output), { temperature: 0.3 });
      const reflection = await call("self-reflection", orch.reflect(inputs, attempt.output, feedback.output));
      const retry = await call("retry", orch.retry(inputs, reflection.output));
      return { calls: [attempt, feedback, reflection, retry], output: retry.output };
    },

    debate: async (fw, inputs, opts) => {
      const a = await call("advocate", singlePrompt(fw, inputs, opts), { temperature: 0.8 });
      const b = await call("opponent", orch.opponent(inputs, a.output), { temperature: 0.8 });
      const judge = await call("judge", orch.judge(inputs, a.output, b.output), { temperature: 0 });
      return { calls: [a, b, judge], output: judge.output };
    },

    moa: async (fw, inputs) => {
      const experts = [];
      for (const persona of SPECIALISTS) {
        experts.push(await call(persona.split(" ")[1] || persona, orch.specialist(inputs, persona), { temperature: 0.8 }));
      }
      const agg = await call("aggregate", orch.aggregate(inputs, experts.map(e => e.output)), { temperature: 0.2 });
      return { calls: [...experts, agg], output: agg.output };
    },

    forest: async (fw, inputs, opts) => {
      const tot = byId("tot");
      const trees = [];
      for (let i = 1; i <= 3; i++) {
        trees.push(await call(`tree ${i}`, singlePrompt(tot, inputs, opts), { temperature: 0.9 }));
      }
      const agg = await call("ensemble", orch.vote(inputs, trees.map(t => t.output)), { temperature: 0 });
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
      const c = await call(fw.name, singlePrompt(fw, inputs, opts));
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

  async function runChain(ids, inputs, opts = {}) {
    const stages = [];
    let prior = "";
    for (const id of ids) {
      const fw = byId(id);
      if (!fw) throw new Error(`Unknown framework in chain: ${id}`);
      const c = await call(`stage:${fw.id}`, chainStagePrompt(fw, inputs, prior));
      prior = c.output;
      stages.push({ framework: fw, ...c });
      onEvent({ type: "progress", done: stages.length, total: ids.length + 1 });
    }
    const synth = await call("synthesis", chainSynthesisPrompt(inputs, prior, opts), { temperature: 0.4 });
    return { stages, synthesis: synth, output: synth.output };
  }

  return { runSingle, runAll, runChain, provider, baseBlock };
}
