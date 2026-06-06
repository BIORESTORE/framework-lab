# framework-lab

A zero-dependency test bench for **LLM reasoning & transfer frameworks**. Run any framework on any task, run a whole category side by side, or **chain** frameworks into a pipeline — and compare what each one actually produces.

44 frameworks across 8 categories: linear (CoT, Zero/Few-shot CoT, Chain-of-Draft, Least-to-Most, Step-Back, Plan-and-Solve), branching (ToT, GoT, Forest, MCTS-style, Beam), hierarchical (Cascade, Recursive Decomposition, HTN, Skeleton-of-Thought), agentic (ReAct, ReWOO, Reflexion, Tool-chaining, Plan-Execute-Replan), self-improvement (Self-Consistency, Self-Refine, CoVe, Self-Ask, Constitutional, Debate), ensemble (Mixture-of-Agents, Maieutic, Universal Self-Consistency), prompting patterns (Analogical, Generated-Knowledge, PoT/PAL, Deep-breath), and transfer & adaptation (Structure Mapping, Conceptual Blending, Bisociation, Synectics, SCAMPER, TRIZ, Morphological, Lateral, Laddering, Persona).

## Quick start

```bash
node --version          # needs >= 18 (no npm install required — zero deps)
cp .env.example .env    # add an API key, or skip to use the offline mock
node cli.js list
```

### CLI

```bash
# one framework
node cli.js run tot --task "Plan a 15s skincare serum ad for IG Reels"

# whole category side by side (linear|branching|hierarchical|agentic|selfcheck|ensemble|patterns|transfer)
node cli.js run-all selfcheck --task "Is 1729 the smallest taxicab number?"

# everything
node cli.js run-all all --task "..."

# pipeline (each stage feeds the next, then a synthesis)
node cli.js chain genknow,step-back,structmap,blend,scamper,self-refine \
  --reference "Patek Philippe Generations ads" \
  --target "A Heinz Ketchup ad" \
  --format image-prompt

node cli.js presets   # named chains
```

Results print to stdout and save as JSON under `results/`.

### Web UI

```bash
node server.js        # → http://localhost:3030
```

Multi-select frameworks to compare, or switch to Chain mode and click them in pipeline order. Tooltips show each framework's use-case.

## Providers

Set in `.env`:

| PROVIDER | needs | notes |
|---|---|---|
| `openrouter` | `OPENROUTER_API_KEY` | one key, hundreds of models — OpenAI-compatible; default `openai/gpt-4o-mini`. Best for comparing models. |
| `anthropic` | `ANTHROPIC_API_KEY` | Messages API, default `claude-sonnet-4-5` |
| `openai` | `OPENAI_API_KEY` | Chat Completions, default `gpt-4o-mini` |
| `mock` (default fallback) | nothing | offline, deterministic — used by tests |

Add a provider by dropping a file in `src/providers/` exposing `{ name, complete(prompt, opts) }`.

## Compare across models

OpenRouter gives every framework the same task on different models, side by side — so you can see how an orchestration behaves on, say, Claude vs GPT-4o vs Llama. The `--models` flag (and the web **Models** box) works with `run`, `run-all`, and `chain`; each model runs in its own isolated column, so one model failing doesn't abort the rest.

```bash
# one framework, three models
node cli.js run debate --task "Is 1729 interesting?" \
  --models openai/gpt-4o-mini,anthropic/claude-sonnet-4.5,meta-llama/llama-3.3-70b-instruct

# a whole chain, compared across models
node cli.js chain genknow,step-back,self-refine --task "..." \
  --models openai/gpt-4o-mini,google/gemini-2.0-flash-001

# one model only (no comparison)
node cli.js run tot --task "..." --model anthropic/claude-sonnet-4.5
```

Each cell still shows every intermediate call, so multi-call orchestrations (Debate, Mixture-of-Agents, Self-Refine, Reflexion…) stay fully inspectable model-by-model.

## Multi-model handoff

Compare runs each model *alone*. Handoff is the opposite: one task, models *collaborate* — each step's output becomes the next step's input, on whatever model you assign. It works across the whole catalog, so you can route a problem through the frameworks and models that suit each stage.

```bash
# chain handoff — each stage on its own model (id:slug; the task hands off down the line)
node cli.js chain plan:anthropic/claude-sonnet-4.5,l2m:openai/gpt-4o-mini,cove:meta-llama/llama-3.3-70b-instruct \
  --task "Mitigate a 3-week port closure hitting our APAC supply chain"

# role handoff — assign models to one orchestration's steps in order
node cli.js run debate --task "Dual-source vs single-source our key component?" \
  --roles anthropic/claude-sonnet-4.5,openai/gpt-4o-mini,anthropic/claude-sonnet-4.5
```

`--roles` follows each orchestration's call order: debate = advocate, opponent, judge · mixture-of-agents = specialists…, aggregator · self-refine = draft, critique, revise · reflexion = attempt, feedback, reflect, retry. Any step you don't name falls back to `--model` (or the provider default). In the web UI the **Per-step models** box does the same — slugs map to chain stages, or to an orchestration's steps in order. Every step's model is recorded and shown in the trace.

## Single-prompt vs orchestrated

Some frameworks are *procedures encoded in one prompt* (CoT, ToT, Step-Back…). Others are **genuinely multi-call** and the engine orchestrates them:

| framework | calls |
|---|---|
| Self-Consistency / Universal SC | 3 samples → vote/judge |
| Self-Refine | draft → critique → revise |
| Chain-of-Verification | draft → verify Q&A → correct |
| Reflexion | attempt → feedback → reflection → retry |
| Debate | advocate → opponent → judge |
| Mixture-of-Agents | 3 specialists → aggregator |
| Forest of Thoughts | 3 independent ToT → ensemble |

**Honesty notes:** MCTS and Beam are single-prompt *simulations* of the search (true MCTS needs programmatic rollouts). ReAct/ReWOO/Tool-chaining simulate tool calls in-prompt in v1 — wire real tools where the engine's call sites make that obvious. These caveats are also in each framework's `note` field.

## Output formats

`--format answer` (default) ends with `FINAL ANSWER:`. `--format image-prompt` makes every run end in a copy-pasteable text-to-image prompt — useful for creative transfer testing (e.g. *Patek Philippe → Heinz ad*).

**The divergence rule:** in image-prompt mode the engine instructs each framework to choose a *distinct medium/tone* (freestyle, default). Pass `--lock-style` to hold the reference's style constant instead — with an obvious source→target bridge and a locked style, frameworks converge on near-identical outputs; that contrast is itself worth testing.

## Tests

```bash
npm test    # node --test, runs entirely offline against the mock provider
```

Covers prompt construction, chain threading (each stage's output verifiably enters the next stage's prompt), orchestration call-graphs, error isolation in run-all, and catalog integrity.

## Layout

```
src/catalog.js        all frameworks + categories + preset chains (single source of truth)
src/promptBuilder.js  pure prompt construction (unit-tested)
src/engine.js         runSingle / runAll / runChain + orchestrations
src/providers/        anthropic | openai | mock
cli.js                command line
server.js + web/      local comparison UI
docs/                 design brief this repo implements
```
