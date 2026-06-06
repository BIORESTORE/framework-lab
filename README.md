# framework-lab

A zero-dependency test bench for **LLM reasoning & transfer frameworks**. Run any framework on any task, run a whole category side by side, or **chain** frameworks into a pipeline — and compare what each one actually produces.

38 frameworks across 8 categories: linear (CoT, Zero/Few-shot CoT, Chain-of-Draft, Least-to-Most, Step-Back, Plan-and-Solve), branching (ToT, GoT, Forest, MCTS-style, Beam), hierarchical (Cascade, Recursive Decomposition, HTN, Skeleton-of-Thought), agentic (ReAct, ReWOO, Reflexion, Tool-chaining, Plan-Execute-Replan), self-improvement (Self-Consistency, Self-Refine, CoVe, Self-Ask, Constitutional, Debate), ensemble (Mixture-of-Agents, Maieutic, Universal Self-Consistency), prompting patterns (Analogical, Generated-Knowledge, PoT/PAL, Deep-breath), and transfer & adaptation (Structure Mapping, Conceptual Blending, Bisociation, Synectics, SCAMPER, TRIZ, Morphological, Lateral, Laddering, Persona).

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
| `anthropic` | `ANTHROPIC_API_KEY` | Messages API, default `claude-sonnet-4-5` |
| `openai` | `OPENAI_API_KEY` | Chat Completions, default `gpt-4o-mini` |
| `mock` (default fallback) | nothing | offline, deterministic — used by tests |

Add a provider by dropping a file in `src/providers/` exposing `{ name, complete(prompt, opts) }`.

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
