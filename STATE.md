# STATE.md — handoff notes (living document; update each milestone)

Read PROMPT.md first (the spec — do not modify it). This file tracks progress
so a fresh session can resume without re-reading everything.

## Where we are

- M1 skeleton: DONE
- M2 plants: DONE
- M3 herbivores: DONE
- M4 predation & flee: DONE
- M5 controls & UX: DONE
- M6 polish: DONE (chart, best-lineage card, tuning pass, acceptance)
- All milestones complete; awaiting final human browser review.

Milestone rule: one milestone per turn, then STOP for human browser review.
Do not auto-advance. End every turn with a 1–2 sentence done summary plus
what the human should smoke-test. `node --test` from project root must be
green, then commit the milestone: one commit per milestone, message format
`M<n>: <kebab-case summary>` (e.g. `M6: polish sparkline best-lineage-card
plant-rate-tuning`). Only that milestone's changes in the commit.

## Tests

`node --test` → 41 pass / 0 fail (verified this session).
- rng.test.js (5), world.test.js (10: +spawn), dna.test.js (7: +standard
  genomes), entity.test.js (6), predation.test.js (7), stats.test.js
  (6: +fitness, records note/load/reset)
- DOM is not unit tested; instead /tmp/ui-smoke.mjs boots the real
  engine.js against a minimal DOM stub and exercises every control (16
  checks: M5's 13 — boot-paused, resume/space/step, spawn, inspect, kill,
  plant/feed brush, scatter, wheel clamp, records persist/reset, world
  reset — plus M6: sparkline draw calls, best-lineage card content,
  sparkline survives a post-reset empty window). Re-run:
  `node /tmp/ui-smoke.mjs` from the project root (tmp file, may vanish
  after reboot — it is disposable, the real gate is node --test).

## Key constants & decisions (already encoded, don't re-derive)

- world.js: W=1024 H=640 DT=1; `wrap()`; plant pool start 200 / max 1000 /
  regen +2/tick / sprout cost 5 / max 400 plants / growth +1/tick to 20;
  initial 20 creatures @ energy 60, lineages L1..L20.
- entity.js: MAX_ENERGY=120, REPRO_THRESHOLD=120, BIRTH_COST=40,
  OFFSPRING_ENERGY=40, MAX_TURN=0.35 rad, WIGGLE=0.25 rad.
  **Subtlety:** reproduce check runs BEFORE the metabolism drain (a
  post-drain >=120 check would be unreachable). Metabolism is subtracted
  after, so parent post-bud energy = 80 - metabolism.
- dna.js: sigma = 0.4 * traitRange * mutationRate, Box-Muller, clamped.
  `CARNIVORE_AGGRESSION = 0.55` is exported but unused — that's M4's job.
- spatial.js: 64px hash grid; `toroidDelta/Dist/Angle`; queryCircle is
  edge-safe (wrapped cell indices + true toroidal distance filter).
- render.js: thin, untested. Hue = 130 - aggression*130 (green→red).
  M6: `drawSparkline(ctx, samples, width, height)` — HUD population chart
  over stats.samples (last 200 ticks); total = veg + carn as filled area +
  grey line, veg/carn split as green/red lines, y auto-scales to window max
  (floor 10), empty window (boot/reset) just clears.
- engine.js: only file touching DOM. rAF loop, N substeps = speed slider
  (1–64 in index.html), sliders read every frame into world.settings.
- stats.js (M4, real): createStats() rolling window of { tick, veg, carn,
  energy } samples, WINDOW=200, record(world) evicts oldest; world owns
  world.stats, tick() records one sample AFTER the dead-filter (sample =
  end-of-tick populations).
- ui.js (M5, real): owns ALL DOM wiring; createUI(app) where app = { world,
  paused } (engine exports it). Sliders feed world.settings every frame in
  hud(). Decisions: starts paused under intro splash (space on body or
  Resume toggles); Step ticks once paused or not; speed slider 1..64, wheel
  over canvas nudges ±1 clamped; Spawn buttons = HERBIVORE_DNA/CARNIVORE_DNA
  (dna.js: herb spd2.0 vis80 met0.06 agg0.2 size2.5; carn spd2.5 vis100
  met0.08 agg0.8 size4.5 — carn passes size+1 on herb) at random toroidal
  spots via world.rng, energy 40, lineages U1, U2, ...; canvas click by tool:
  Plant(default) — creature under cursor (<= max(6, size+3)) is INSPECTED
  (DNA line at cursor), else drop plant (drag paints ~1 per 8px; user plants
  cost no pool energy, bypass MAX_PLANTS); Feed — tool wins over inspect,
  click/drag gives +10 energy to creatures within 12px; shift-click scatters
  (plant: 5 in 48px disc; feed: radius 24); Kill under cursor = one-shot arm
  mode, next click removes the creature immediately (works while paused).
- ui.js (M6): hud() also (a) calls drawSparkline on #popChart (240×48
  canvas in the HUD row) every frame, and (b) fills #bestCard from
  records.data.bestFitness — hidden until the first tick, then
  `BEST <lineage> · fit <value>` plus the DNA snapshot (spd/vis/met/
  agg/size). Survives world reset (card keeps the carried-over all-time
  record; sparkline redraws from an empty window).
- M6 tuning decision: DEFAULT_PLANT_RATE 0.05 → 0.3 (index.html slider now
  0..0.5, default 0.30). Grid probe (plantRate × mutation, 3000–5000 tick
  runs, 5 seeds) showed plant inflow is the dominant boom/crash lever
  (MAX_PLANTS had no effect — plants rarely pool near the cap). 0.3 keeps
  no-extinction/no-blowup with big swings; mutation stayed 0.1 (spec default
  range). Also fixed a stale hardcode: entity.js eating radius now
  plantRadius(PLANT_MAX_ENERGY) instead of plantRadius(20).
- engine.js (M5): slim bootstrap — app state { world, paused } (exported for
  the smoke harness), rAF loop: if !paused tick n=ui.speed() times, render,
  ui.hud(). No other DOM.
- stats.js: +fitness(c) = gain - spent + offspring (spec §4.5); createRecords()
  all-time bests { bestFitness: {value, dna snapshot, lineageId, tick},
  longestLineage: {gen = max generation observed, lineageId, tick},
  peakPopulation: {pop, tick} } — note(world) each tick after dead-filter,
  load(stored) merges better-per-field, reset(). world.records owned by
  createWorld.
- Records persistence (ui.js): localStorage key 'arena_records', merged on
  load, autosaved every 20s + on pagehide; Reset records clears both;
  Reset world keeps records (all-time, re-merged into the fresh world).
- M4 decisions (documented at top of entity.js): ATTACK_COST=10 (predator must
  hold >=10 to bite; cost subtracted, not counted in c.spent which stays
  metabolism-only per spec); PREY_LOSS=30 FIXED chunk (a fraction would
  asymptote to 0 and never kill); bite range = predator.size + prey.size;
  bite replaces movement that tick; c.state ∈ FLEE|HUNT|SEEK_FOOD|WANDER set
  each tick (observable in tests); world.creatureGrid mirrors plantGrid,
  rebuilt at tick start (sensing = tick-start positions; newborns join next
  tick); FLEE target = nearest STRICTLY higher aggression in vision; HUNT
  target = nearest creature passing size+1 rule in vision; carnivores with no
  edible prey fall through to SEEK_FOOD (they eat plants too).
- Git repo (branch `main`, inited at M6 closeout). Commit at each milestone
  completion, message `M<n>: <kebab-case summary>` (see milestone rule).
  No dependencies, no build step; nothing to ignore.

## Ecosystem baseline (measured, default settings, plantRate 0.3)

- 20k-tick probe × 5 seeds (1, 2, 3, 7, 42): no extinction, no blowup.
  - min pop 15–20 (crash floor near the 20-creature seed size),
    max pop 146–212 (boom), visible cycles.
  - end state 135–205 creatures, veg/carn mix 3:132 → 100:92 across seeds,
    plant standing 14–22 (inflow-bound, not pool-cap-bound).
  - records: peak pop 146–212, best fitness 760–1527, longest lineage 11–19g.
- 3000-tick e2e guard (predation.test.js, maxPop <= 500) stays comfortably
  green (peaks ~150–210).

## Conventions

- All randomness through world.rng (xorshift32). No Math.random anywhere.
- 2-space indent, const, ES modules, no globals except engine bootstrap.
- Files under ~250 lines; surgical edits, never rewrite the project.
- Ambiguities: decide, then write the decision as a comment at the top of
  the file you change.
- Human serves the folder (python3 -m http.server) and reviews in browser;
  we verify via tests only.
