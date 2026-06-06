/** Pure functions that construct prompts. No I/O. */

const FORMAT_TAILS = {
  answer: `\n\nEnd with a line "FINAL ANSWER:" followed by your conclusion.`,
  "image-prompt": `\n\nRespond in TWO labeled parts:
APPROACH: 2-4 sentences on how this framework shaped the concept.
IMAGE PROMPT: one detailed text-to-image prompt (subject, composition, art style, palette, lighting, mood, and "--ar 16:9"). 60-110 words, concrete and visual.`
};

export function baseBlock({ task, reference, target }) {
  let s = "";
  if (reference) s += `REFERENCE / INSPIRATION:\n${reference}\n\n`;
  if (target)    s += `TARGET DELIVERABLE:\n${target}\n\n`;
  if (task)      s += `TASK:\n${task}\n\n`;
  return s.trim();
}

/** Single framework run (also used per-framework inside runAll). */
export function singlePrompt(fw, inputs, opts = {}) {
  const { format = "answer", freestyle = true } = opts;
  const style = format === "image-prompt"
    ? (freestyle
        ? `\nChoose a DISTINCT medium, tone, and composition that this framework's logic implies — do not default to a generic house style.`
        : `\nKeep the reference's visual style.`)
    : "";
  return `${baseBlock(inputs)}

Apply this framework:
${fw.name}: ${fw.instruction}${style}${FORMAT_TAILS[format] ?? ""}`;
}

/** Chain stage i>0: prior output threads in. Stage 0 uses prior="" */
export function chainStagePrompt(fw, inputs, prior) {
  return `${baseBlock(inputs)}

${prior ? `PRIOR STAGE OUTPUT:\n${prior}\n\n` : ""}Now apply ONLY this framework as the next pipeline stage:
${fw.name}: ${fw.instruction}

Respond in 2-5 sentences advancing the concept/answer. No final formatting yet.`;
}

/** Chain end: synthesize the final deliverable. */
export function chainSynthesisPrompt(inputs, prior, opts = {}) {
  const { format = "answer" } = opts;
  if (format === "image-prompt") {
    return `${baseBlock(inputs)}

PIPELINE RESULT (final stage):
${prior}

Synthesize ONE detailed text-to-image prompt capturing the whole pipeline.
Subject, composition, art style, palette, lighting, mood, "--ar 16:9". 70-120 words. Output ONLY the prompt.`;
  }
  return `${baseBlock(inputs)}

PIPELINE RESULT (final stage):
${prior}

Synthesize the pipeline into one final, complete answer to the task. End with "FINAL ANSWER:".`;
}

/* ---------- orchestration prompts ---------- */

export const orch = {
  critic: (inputs, draft) => `${baseBlock(inputs)}

DRAFT:
${draft}

Critique this draft harshly and concretely: list its 3 biggest weaknesses (accuracy, coherence, fit to the task).`,

  revise: (inputs, draft, critique) => `${baseBlock(inputs)}

DRAFT:
${draft}

CRITIQUE:
${critique}

Rewrite the draft fixing every critique point. Output only the improved version.`,

  verifyQs: (inputs, draft) => `${baseBlock(inputs)}

DRAFT ANSWER:
${draft}

Generate 3 fact-check questions that would expose errors in this draft, then answer each question carefully and independently.`,

  correct: (inputs, draft, verification) => `${baseBlock(inputs)}

DRAFT ANSWER:
${draft}

VERIFICATION Q&A:
${verification}

Produce the corrected final answer, fixing anything the verification exposed. End with "FINAL ANSWER:".`,

  reflect: (inputs, attempt, feedback) => `${baseBlock(inputs)}

YOUR ATTEMPT:
${attempt}

FEEDBACK:
${feedback}

Write a short SELF-REFLECTION: what specifically went wrong or could be stronger, and what you will do differently.`,

  retry: (inputs, reflection) => `${baseBlock(inputs)}

YOUR SELF-REFLECTION FROM THE LAST ATTEMPT:
${reflection}

Attempt the task again, applying the reflection. End with "FINAL ANSWER:".`,

  opponent: (inputs, argument) => `${baseBlock(inputs)}

AN ADVOCATE ARGUED:
${argument}

You are the OPPONENT. Rebut as strongly and specifically as possible: attack weak assumptions, offer the best alternative position.`,

  judge: (inputs, a, b) => `${baseBlock(inputs)}

POSITION A:
${a}

POSITION B:
${b}

You are the JUDGE. Weigh both, then deliver a verdict with the strongest synthesis. End with "FINAL ANSWER:".`,

  vote: (inputs, samples) => `${baseBlock(inputs)}

${samples.map((s, i) => `CANDIDATE ${i + 1}:\n${s}`).join("\n\n")}

These are independent attempts at the same task. Identify the answer the majority converges on (or the one most consistent with the ensemble), report agreement level, and output it. End with "FINAL ANSWER:".`,

  specialist: (inputs, persona) => `${baseBlock(inputs)}

You are a ${persona}. Answer the task strictly from that expertise.`,

  aggregate: (inputs, samples) => `${baseBlock(inputs)}

${samples.map((s, i) => `SPECIALIST ${i + 1}:\n${s}`).join("\n\n")}

Aggregate the specialists into one answer better than any individual one. End with "FINAL ANSWER:".`
};

export const SPECIALISTS = [
  "rigorous analyst (logic, numbers, edge cases)",
  "creative director (originality, emotional resonance)",
  "pragmatic operator (feasibility, cost, execution)"
];
