# Implementation Brief — "Framework Transfer Engine"

**For: Claude Code, implementing into an existing application.**
**From: design/prototyping session. Two reference prototypes exist (see §12).**

---

## 0. How to use this file

Drop this file into the repo (e.g. `/docs/framework-engine-brief.md`) and tell Claude Code: *"Implement the feature described in this brief, fitting it into this codebase's existing stack and conventions."*

This is a **feature spec**, not a stack spec. The app already exists. **Do not introduce a new framework, language, or build system.** First detect what's here, then build to match.

---

## 1. First steps for the implementing agent (do these before writing code)

1. **Detect the stack.** Inspect `package.json` / `pyproject.toml` / lockfiles, the framework (React/Vue/Svelte/Next/etc.), styling system, and folder conventions. Mirror them.
2. **Find existing integrations.** Search for any existing LLM client (Anthropic/OpenAI/etc.) and any image-generation client. **Reuse them.** Only add a provider if none exists, and if so put it behind a small interface (see §6/§7) — the product owner has *no provider preference* and wants it pluggable/config-driven.
3. **Locate where features live** (routes, components, services) and follow that structure.
4. **Confirm the response shape of the model call before building on it.** Make ONE real call to whatever LLM client you'll use and log the raw response; build parsing around the observed shape, not an assumed one. (This bit us in the prototype — see §11.)
5. Propose a short plan, then implement.

---

## 2. What the feature is

A **Framework Transfer Engine**: the user provides a reference (text and/or an uploaded image) and a target goal (e.g. "a Heinz Ketchup ad"). The app applies named reasoning/creative-transfer **frameworks** to produce, per framework, a short rationale plus a **ready-to-use text-to-image prompt**. Frameworks can be run one at a time, all at once for comparison, or **chained** so each feeds the next.

The core insight the product encodes: *frameworks change the **thinking**; they only visibly change the **output** if (a) the source→target bridge is non-obvious and (b) each framework is allowed to vary medium/tone/composition, not just concept.* (See §5.)

---

## 3. Functional requirements

- **F1 — Inputs.** A "Reference" text field (rich description) + a "Target deliverable" text field. Plus an **image upload** for the reference (see §6).
- **F2 — Framework catalog.** Implement all frameworks in §4 as data. Group into two families: **Reasoning** and **Transfer & Adaptation**.
- **F3 — Single run.** Pick one framework → call the model with the framework's constructed prompt → render rationale + image-prompt with a **Copy** button.
- **F4 — Run ALL.** Run every framework sequentially, render results stacked for side-by-side comparison, each with its own image-prompt + Copy. Show progress (`n/total`).
- **F5 — Chain mode.** User builds an ordered list of frameworks (or picks a preset, §4.3). Each stage's output is passed as context into the next stage's prompt. After the last stage, a **synthesis** call produces one final image-prompt. Render each stage + the final prompt.
- **F6 — Image-prompt output.** Every run ends in a clearly delimited, copy-pasteable text-to-image prompt (subject, composition, art style, palette, lighting, mood, aspect ratio).
- **F7 — Optional render.** If an image API is available/configured, add a "Render" button per prompt that generates the image in-app. If not configured, hide/disable it gracefully. (Owner has no preference; make it optional + config-gated.)
- **F8 — Divergence control.** A toggle: **"Lock art style"** vs **"Freestyle (vary medium & tone)"**. When freestyle is on, instruct the model to choose a distinct medium/tone per framework (see §5). Default: **freestyle on**.
- **F9 — Scoring (optional/nice-to-have).** Per result, a small 1–10 scorecard (Creativity, Feasibility, Coherence/on-target, Speed) with a running total, for manual comparison.
- **F10 — Robustness.** Handle model errors per-stage without aborting a Run-All; show the error in that card and continue.

---

## 4. Framework catalog (implement as data)

Each framework = `{ id, name, family, shape, useCase, instruction }`. `instruction` is the imperative the model receives. Families: `reasoning` | `transfer`.

### 4.1 Reasoning family
| id | name | shape | instruction |
|---|---|---|---|
| cot | Chain of Thought | step→step→step | Reason step by step in one linear path from reference to a finished target concept; each step builds on the last. |
| l2m | Least-to-Most | easy→hard | Break into sub-problems easiest→hardest, solve in order reusing earlier answers, then assemble. |
| plan | Plan-and-Solve | plan→execute | Write a numbered plan first, then execute each step. |
| tot | Tree of Thoughts | branch→score→prune→expand | Propose 3 distinct directions, score each /10 on feasibility×impact×fit, prune, expand the winner. |
| got | Graph of Thoughts | branch→merge | Generate partial ideas, then merge two compatible ones into a stronger hybrid. |
| sot | Skeleton-of-Thought | outline→expand | Produce a one-line outline of all parts, then expand each. |
| cascade | Hierarchical Cascade | L0▼L1▼L2▼leaf | Decide L0 strategy, then derive direction, components, and execution that all inherit from it. |
| sc | Self-Consistency | sample→vote | Solve 3 times independently, then report the most frequent answer + agreement level. |
| react | ReAct | thought→action→observation↻ | Interleave reasoning with actions (what info/tool each step needs); loop to a confident answer. |
| refine | Self-Refine | draft→critique→revise↻ | Draft, critique harshly (esp. "is it still a *target-product* ad?"), revise; show passes. |

### 4.2 Transfer & adaptation family
| id | name | shape | instruction |
|---|---|---|---|
| genknow | Generated-Knowledge | list facts→reason | First list 8–10 concrete visual/emotional traits of the reference, then reason which transfer. |
| stepback | Step-Back | surface→↑principle→apply | State what the reference is *actually doing* (its principle, not its surface), then apply that to the target. |
| ladder | Abstraction Laddering | ↑essence→cross→↓domain | Climb the reference to its essence, cross to the target domain, climb back down into concrete specifics. |
| analogical | Analogical | recall→map | Recall a known campaign that solved a similar problem; extract the move; map it onto the target. |
| structmap | Structure Mapping (Gentner) | keep·drop·translate | Tag each trait ATTRIBUTE (drop/invert), RELATION (transfer), or EXPRESSION (translate); rebuild for target. |
| blend | Conceptual Blending | A+B→emergent | Select fitting pieces from reference + target; fuse into a third blended concept with emergent meaning. |
| bisoc | Bisociation (Koestler) | A✕B→collision | Collide the two domains as unrelated frames; build the concept around the surprising clash. |
| synectics | Synectics (Gordon) | make familiar strange | Use a Personal analogy ("I am the product…") + a Symbolic one to find a fresh emotional angle. |
| scamper | SCAMPER | 7 mutation verbs | Mutate via Substitute/Combine/Adapt/Modify/Put-to-other-use/Eliminate/Reverse — esp. swap the hero to the target. |
| triz | TRIZ | resolve A-vs-B | Identify the contradiction (e.g. funny vs premium) and resolve it without compromise (separate in time/space, change mechanism). |
| morph | Morphological Analysis | dimensions×options | Pick tone × hero × era cells to assemble an unexpected but coherent concept. |
| lateral | Lateral / Random Entry (de Bono) | random→forced link | Inject a random word, force a link to the target, follow it to a non-obvious concept. |
| persona | Persona / Style Transfer | adopt source voice | Render the target's ad as if directed by the reference's creator — borrow voice & aesthetic, serve the target. |

### 4.3 Chain presets
- **Full transfer pipeline:** `genknow → stepback → structmap → blend → scamper → refine`
- **Concept explorer:** `genknow → tot → cascade`
- **Novelty push:** `bisoc → synectics → lateral → refine`

---

## 5. Prompt construction (the engine logic)

Build a `base` block: `REFERENCE:\n{reference}\n\nTARGET DELIVERABLE:\n{target}`.

**Single / Run-All prompt:**
```
{base}

Apply this framework:
{framework.name}: {framework.instruction}

{IF freestyle}: Choose a DISTINCT medium, tone, and composition that this framework's logic implies — do not default to a generic house style.
{IF lockStyle}: Keep the reference's visual style.

Respond in TWO labeled parts:
APPROACH: 2-4 sentences on how this framework shaped the concept.
IMAGE PROMPT: one detailed text-to-image prompt (subject, composition, art style, palette, lighting, mood, and "--ar 16:9"). 60-110 words, concrete and visual. No preamble.
```
Parse on `IMAGE PROMPT:` to split rationale vs prompt.

**Chain stage prompt (per stage i>0):**
```
{base}

PRIOR STAGE OUTPUT:
{prior}

Now apply ONLY this framework as the next pipeline stage:
{framework.name}: {framework.instruction}

Respond in 2-4 sentences advancing the concept (no image prompt yet).
```

**Chain final synthesis:**
```
{base}

PIPELINE RESULT (final stage):
{prior}

Synthesize ONE detailed text-to-image prompt for the target ad capturing the whole pipeline.
Subject, composition, art style, palette, lighting, mood, "--ar 16:9". 70-120 words. Output ONLY the prompt.
```

**The divergence rule (important product requirement):** When "freestyle" is on, the system MUST push each framework toward a different medium/tone (e.g. one sepia film, one studio macro, one documentary, one vintage print). Without this, outputs converge and look identical — this was the #1 issue in the prototype. Encode it in the prompt as above, and consider seeding per-framework medium hints for the transfer family.

---

## 6. Vision / image upload

- Allow the user to upload (and paste/drag) a reference image.
- If the configured model is **vision-capable**, send the image with the prompt and let it ground the run directly.
- If not, run a **one-time captioning step**: call the vision model to produce a rich description, write it into the Reference field, and proceed text-only. Make this fallback explicit in the UI ("described by the model, not seen pixel-by-pixel" if applicable).
- Never assume a runtime helper can see images without verifying — confirm vision support for the actual client in use.

---

## 7. Image generation (optional, config-gated)

- Behind an interface like `generateImage(prompt, { aspectRatio }) -> imageUrl`.
- Implement against whatever provider the repo already uses; if none, leave a stub + config flag and keep F6 (prompt output) fully functional without it.
- Handle quota/credit errors gracefully with a clear message (the prototype hit a free-tier quota wall — surface that, don't fail silently).

---

## 8. UI / UX requirements

- Mode switch: **Single** / **Run ALL** / **Chain**.
- Single: framework dropdown (grouped by family) + Run.
- Run ALL: one button, stacked result cards with progress.
- Chain: framework picker that appends in click-order (show numbered chips, removable), preset buttons, Clear, a vertical stage view with arrows, and a highlighted final image-prompt.
- Every image-prompt in a visually distinct box with a **Copy** button.
- The **"Lock style / Freestyle"** toggle (F8), default Freestyle.
- Loading/spinner per stage; errors rendered inline per card.
- Match the existing app's design system.

---

## 9. Suggested module shape (adapt to repo conventions)

- `frameworks.<ext>` — the catalog data from §4 (single source of truth).
- `promptBuilder.<ext>` — pure functions building the §5 prompts.
- `engine.<ext>` — `runSingle`, `runAll`, `runChain(stages)`, `synthesize`; depends on an injected `llm` client and optional `imageGen` client.
- `llm` + `imageGen` provider adapters (reuse existing if present).
- UI components for the three modes.
- Unit tests for `promptBuilder` and the chain-context-threading in `engine`.

---

## 10. Acceptance criteria

1. All frameworks in §4 are selectable and produce an APPROACH + IMAGE PROMPT.
2. Run-All renders every framework's result with individual Copy buttons and survives a single-stage error.
3. Chain mode threads each stage's output into the next and ends with one synthesized prompt; presets load correctly.
4. Freestyle toggle demonstrably changes outputs: running the same reference across the transfer family yields **visibly different mediums/tones**, not minor wording changes.
5. Image upload works; vision path or caption-fallback is wired and labeled correctly.
6. Image render works if a provider is configured; the app is fully usable (prompts only) if not.
7. No new stack introduced; code matches existing conventions; `promptBuilder` + chain-threading have passing tests.

---

## 11. Known pitfalls (learned in prototyping — avoid these)

- **Don't build on an unverified model-call contract.** Verify the real response shape with one live call first, then parse. (We assumed a shape and couldn't confirm it.)
- **Text-only runtimes can't see images.** Don't claim vision you haven't confirmed; use the caption fallback (§6).
- **Output convergence.** With an obvious source→target bridge and a locked style, all frameworks produce near-identical prompts. The freestyle rule (§5/F8) and non-obvious pairings are what create real divergence — treat this as a feature requirement, not cosmetic.
- **Image-gen quotas/credits** fail loudly on free tiers — surface a clear, actionable error.

---

## 12. Reference prototypes (design intent, not production code)

Two single-file HTML prototypes from the design session demonstrate the intended UX (treat as wireframes; reimplement properly in-app):

- `reasoning-frameworks-sandbox.html` — static teaching tool: framework catalog, per-framework templates/examples/use-cases, tasks incl. a cross-domain (Patek×Heinz, Hot-Dog→Heinz) task, and a click-to-build **chain mode** with presets. Source of the catalog content in §4.
- `heinz-transfer-runner.html` — the live runner: Single / Run-ALL / Chain, a Self-test button, and the prompt-construction logic in §5. Closest to the target behavior.
- `reasoning-frameworks-experiment-kit.md` — narrative background: the two framework families, the cross-domain transfer pipeline, the Patek→Heinz worked mapping, and situations/use-cases.

Use these to understand intent; do not port the prototype JS verbatim.
