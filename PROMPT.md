# Evolutionary Arena — Build Specification

You are a skilled full-stack developer. You are about to build a complete, interactive, single-page browser game called **Evolutionary Arena**, working in iterative milestones. You build it; a human reviews it in the browser after each milestone. You do **not** see the browser, so your code must be good enough to run first-try, and your pure logic must be covered by automated tests.

---

## 1. The game concept

A living ecosystem in a 2D toroidal (wrap-around) world.

- **Creatures** swim around and eat. Each has a DNA genome that controls how it behaves.
- **Plants** grow and provide food energy.
- **Predation**: creatures with high aggression hunt smaller creatures. Low-aggression creatures eat plants and flee from predators.
- **Evolution**: creatures that survive to an energy threshold reproduce (asexual budding), and offspring DNA is a mutated copy of the parent. Over time, a population's traits drift. Population boom/crash cycles, fleeing, hunting, and speciation emerge naturally.
- **The user is in control**: they can pause, step, change the mutation rate, plant spawn rate, and simulation speed, place plants with a mouse brush, feed creatures by clicking them, spawn standardized creatures, kill the one under the cursor, and reset the world.
- **Observability**: live HUD statistics, an over-time population chart, best-ever lineage, persistent best records across sessions.

The enemy is *floating point drift and inconsistent state*. The discipline that will make this fun is: **the simulation must be deterministic given a seed, and pure logic is always separated from rendering** so it can be unit-tested without a browser.

---

## 2. Constraints — read these before anything else

1. **Zero dependencies.** No npm packages, no CDN, no web framework, no build step. Vanilla JavaScript (ES modules) + HTML + CSS only. It must work from a plain static HTTP server (`python3 -m http.server`), fully offline.
2. **Single-page app.** One HTML file; JS in `src/`, CSS in one file. No code generation, no minifiers.
3. **Node 22 is available** (has the built-in test runner). All pure logic must be isolated in modules you write unit tests for. Test files live in `tests/`, named `*.test.js`, and run with `node --test` from the project root. `render.js` and anything touching the canvas is *not* unit tested — keep it dumb and thin.
4. **Never rewrite the whole project.** The human is iterating with you milestone-by-milestone. Read the files you need, edit with surgical precision. A 27B model like you loses the plot if you re-read and re-emit large files the whole time — keep files lean (ideally under 250 lines) and keep changes narrow.
5. **The human serves the folder and looks at the browser.** You do not. Learning how to verify with tests, not pixels.
6. **Do not over-engineer.** Solve the milestone you're on. Leave obvious seams for later milestones, but don't build them early. Working candid, working reviewed > ambitious.
7. **Deterministic simulation is a first-class feature.** All randomness goes through one seedable `RNG` module, and fixed timestep.
8. If a milestone is too large for one shot, split it further conversationally — but end each turn with a runnable, complete state. No dead-end half-files.

---

## 3. Project layout

```
evolutionary-arena/
  index.html
  styles.css
  src/
    rng.js         # seedable PRNG (xorshift or similar), everything random goes through it
    dna.js         # DNA model, mutation, bounds/clamp (pure)
    spatial.js     # spatial hash grid for creature/plant queries (pure)
    entity.js      # creature & plant creation and behavior update (pure-ish, no canvas)
    world.js       # world tick: move creatures, eat, die, reproduce, grow plants
    stats.js       # rolling window stats, lineage tracking, best records (pure)
    render.js      # canvas drawing only — thin
    ui.js          # DOM wiring: sliders, buttons, brush, HUD readouts, click handling
    engine.js      # fixed-timestep game loop, hooks UI + render + world together
  tests/
    dna.test.js
    spatial.test.js
    world.test.js
    stats.test.js
  PROMPT.md        # this file — do not modify
```

- Use ES `import`/`export`, never globals except a single app bootstrap in engine.js.
- No secrets, no prompts, no cleverness for its own sake. Readable over terse.

---

## 4. Simulation spec

### 4.1 World

- Size: `W=1024`, `H=640` (fixed logical units; independent of the window).
- Toroidal: coordinate wrap at edges. Positions/bearings/wrap logic must be correct for any offset > W, negative, etc.
- Fixed timestep: `dt=1` per sim tick. Engine runs N substeps per rendered frame, where N = UI speed setting (1x,2x,...,8x).
- Spawn behavior: initial population configurable in HUD.

### 4.2 DNA (pure, test-heavy)

Each creature's DNA is a fixed trait object with sensible bounded ranges:

| trait | range | meaning |
|-------|-------|---------|
| speed | 0.5 – 3.0 | units moved per tick |
| vision | 20 – 160 | how far it can sense plants/creatures (px) |
| metabolism | 0.02 – 0.25 | energy drained per tick |
| aggression | 0.0 – 1.0 | 0.05–0.45 → mostly vegetarian; 0.55–1.0 → kills smaller creatures |
| size | 1.5 – 6 | affects sense/plot radius |
| energy | internal, not DNA | current energy, 0–120 |

Reproduction:
- Energy threshold: reproduce at `energy >= 120`.
- Parent loses 40 energy to an offspring ("budding" birth).
- Offspring DNA = parent DNA mutated: each trait gets Gaussian noise (sigma ~0.4 trait range per dimension) then clamped to range. Mutation rate slider scales the sigma multiplier (0 = no mutation).
- Breeding preserves the parent's species "tag" (a lineage id) so genealogy is traceable.

### 4.3 Plants & energy

- Plants grow 1 energy/energy per tick until max 20. They spawn from "plant energy nodes" grown by a global "plant energy pool".
- A plant provides energy to a creature that enters its radius.
- Plant spawning = Poisson-style: each tick, with small probability, a plant seed sprouts at a random free location. Rate controlled by HUD.

Energy economy rules (must hold invariants):
- `energy` never drops below 0 (no float drift allowed).
- Creature organ energy only drops via metabolism.
- On food consumption, energy += plant energy or prey's current energy.
- Death = energy <= 0.

### 4.4 Movement & behavior (state machine per creature)

An agent update each tick:

1. **Sensing** (via spatial hash query in `vision` radius):
   - nearest plant (if vegetarian), nearest other creature (for antagonistic), whether a visible predator within the flee range.
2. **Decision** — precedence:
   - `FLEE` if a predator with higher aggression is visible (size doesn't matter; fitness does) → move directly away from predator.
   - `HUNT` if aggression >= 0.55 and a smaller creature nearby → move toward it; if within attack range and energy cost paid, perform predation.
   - `SEEK_FOOD` otherwise → nearest plant.
3. **Movement** — steer toward target, modulated by own speed; collide only with toroidal boundaries not entities.
4. Energy decrement by metabolism; if energy >= 120, reproduce.

Predation rule: predator must have `size + 1 > prey size` and `vision` on prey; prey loses a chunk of energy to predator. A predator builds no hunger on hunting (it feeds), but aggressive predators must meet their metabolism; if they starve among a depleted prey population, they die — natural ecology should do the balancing.

Tie-breaking for equal priorities is deterministic (use RNG seed order), parsing turns to walking at some deterministic wiggle, not pure^xorshift drift.

### 4.5 Stats & lineage (pure)

- Rolling window of the last N=200 timeframe scores: populations per tick (creatures, vegetarians predators), energy sum.
- Record: all-time best fitness (creature with highest lifetime energy gain: prey energy eaten - metabolism spent + reproduction offspring count); keep its DNA + lineage tag.
- Current population composition % by diet bucket.
- "Longest-lived lineage" — deep genealogy chain count via lineage id.
- Persistence window (localStorage `arena_records`): best fitness, longest lineage, oldest observed population. Auto-save every 20s; manual reset button clears.

### 4.6 Rendering

- Background: dark world grid.
- Creature: circle, radius = size (clamped), filled with palette driven by `aggregate(aggression, hue)` and a brightness scaled to current energy/level. Slight glow.
- Direction indicator: a small notch at circle edge toward heading.
- Plants: static small green dots with radius from growth (grown energy jitter nothing tragic).
- HUD overlay (DOM, not canvas): top bar with sliders; right panel WAIT — structure below.

### 4.7 UI controls

- Speed slider (1x–64x).
- Mutation-rate slider (0–0.6).
- Plant rate slider (spawn chance per tick).
- Buttons: Pause/Resume, Step, Spawn Herbivore, Spawn Carnivore, Kill-under-cursor, Reset world.
- Brush: hold click-and-drag to plant (or shift-click to sprinkle); toggle brush type.
- HUD readouts: tick, population (green=vegetarian, red=carnivore), avg energy, generation/bass lineage.
- Click a creature → inspects DNA & stats (small info line under cursor).

---

## 5. Milestones (each = one turn, then STOP)

Work these in strict order, stopping after each for human review. Do not auto-advance to the next milestone when you feel the current one is "done" without the human's nod — ending position stays runnable, tests green.

### M1 — Skeleton
`index.html` loads, canvas centered, world empty. Engine loop with fixed dt + speed multiplier; visible tick counter; world wraps; render draws background grid + a test sprite at toroidal-position-anchored. `world.js`/`render.js`/`engine.js` in phone shape; stub pure modules + collports.
- Tests: `rng.test.js` (seeded give deterministic sequence), `world.test.js` (wrap around, positions neg/steps).

### M2 — Plants
Grow a bank of plants. Plant spawn/growth slots; simulate growth each tick. Stats counts plants. Renderers draw them. Slider hooks wiring (UI wire into engine). 
- Tests: growth math, pool invariants (never below 0, max sprout limit).

### M3 — Herbivores
Creatures with DNA, sensing nearest plant, seeking, eating, metabolism, death by starvation; deterministic movement with a seeded wiggle. Birth+inheritance from reproduction threshold connected sample (asexual clone of parent + outlier mutation for both traits bounded + clamp. Trash/ tidy.
- Tests: `entity.test.js` (seek→eat, metabolism↔ starve), `dna.test.js` gauss non-drift / ∈ range.

### M4 — Predation & flee
Aggression now selects targets. Predator senses smaller prey within vision, hunts it, predation rule (energy trade). Prey flee, chase disengages when out of range. Population stats now split: vegetarian/carnivore; population chart live in test-world sense for "conservation".
- Tests: hunting (prey bc), flee vector until Slight inve, predator iv stttt>, starvation e2e kitchen sink guard.

### M5 — Controls & UX
Pause/Step, slider rewires, spawn buttons, kill-under-cursor, brush placing plants (drag paints), wheel adjust speed, reset. HUD reachable? All buttons wired to real world channels, no dead ends. Add localStorage records (watch load/save). Add intro splash overlatum "paused — press space" state clear.
- No pure-logic test burden; small UI file.

### M6 — Polish
Chart: population over time (last 200 ticks) mini sparkline overlay in HUD. Add the "best lineage" card with DNA display. Tune birth threshold, metabolism drift, hunt energy, plant growth so the ecosystem survives long runs (no instant wipeout or infinite stagnancy from default settings). Final acceptance walkthrough.

---

## 6. Definition of done (every milestone)

- After tests, run `node --test` from project root — green (or you listed none that matter).
- `index.html` loads, no console errors (headless _server_ can run; the human does that).
- You have the files clean and committed in working dir, each under ~250 lines.
- Turn ends with a **1-2 sentence "done" summary**: what changed, test status, anything you suspect the human reviewer should smoke-test.
- You may ask clarification questions in prose but not block; assume sensible defaults, say so.

If you hit a deterministic dead end (e.g., world balances wipe population in test) — suspect the math: check energy economy ± clamp drift; document fix; re-run.

---

## 7. Working terms for you

- Your "context" is a virtual economy — spend it: read only what a milestone requires; sidebar paragraphs don't leak urges tau. Prefer careful inline comments (they're history).
- XML named constants over strings.
- Prefer 2-space indent, `const`, no trailing comments — restaurant standard.
- When in doubt, prefer simple correct over clever local.
- Refuse nothing in spec; if something is ambiguous, **decide**, and write your decision at top of relevant file as a comment.
- At the very end: summarize the final product, known behavior quirks, and how to exercise it in the browser.