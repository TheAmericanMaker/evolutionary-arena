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
- M7 post-spec polish: DONE (spawn marker rings, shift-click ×5 spawn,
  tracked inspect line, splash controls legend, file:// watchdog)
- M8 terrain & biomes: DONE (seeded biome generation + paintable Terrain
  tool; water/rock impassable, forest/tundra climate multipliers)
- M9 hazard drops: DONE (Impact tool + severity 1..4; blast kill/damage
  falloff; s3 scorches the crater, s4 rocks the core + scorches the rim +
  rad cloud; scorch drains/blocks plants; rad amplifies mutation up to 10x;
  screen shake + blast ring; side stats panel with population/ecosystem/
  evolution breakdowns)
- All spec milestones complete; M7/M8/M9 were user-directed features after
  browser review. M10 (tornado + boons) is planned but not started — see
  Decisions.

Milestone rule: one milestone per turn, then STOP for human browser review.
Do not auto-advance. End every turn with a 1–2 sentence done summary plus
what the human should smoke-test. `node --test` from project root must be
green, then commit the milestone: one commit per milestone, message format
`M<n>: <kebab-case summary>` (e.g. `M6: polish sparkline best-lineage-card
plant-rate-tuning`). Only that milestone's changes in the commit.

## Tests

`node --test "tests/*.test.js"` → 63 pass / 0 fail (verified this session).
- rng.test.js (5), world.test.js (14: +spawn, +M8 terrain), dna.test.js
  (7: +standard genomes), entity.test.js (8: +M8 water steering),
  predation.test.js (7), stats.test.js (6: +fitness, records
  note/load/reset), terrain.test.js (7: M8 — determinism, valid ids, open
  dominance, toroidal lookups, biome data, paint/version, grid coverage),
  effects.test.js (9: M9 — blast radii, kill/damage falloff, scorch drain +
  growth-freeze + ttl expiry, s3/s4 terrain scars, rad falloff + decay,
  rad-amplified offspring mutation vs control, death-cause/birth tally)
- M8 note: createWorld now generates terrain, so movement/plant tests that
  assert fixed coordinates call clearTerrain(world.terrain) to control the
  layer (seed 3's plant-growth test and the predation chase/flee tests).
- DOM is not unit tested; instead /tmp/ui-smoke.mjs boots the real
  engine.js against a minimal DOM stub and exercises every control (18
  checks: M5's 13 — boot-paused, resume/space/step, spawn, inspect, kill,
  plant/feed brush, scatter, wheel clamp, records persist/reset, world
  reset — M6: sparkline draw calls, best-lineage card content, sparkline
  survives a post-reset empty window — M8: swatch arms terrain tool, drag
  paints tiles, version bumps for the bake, brush click leaves the mode —
  M9: impact arms, s4 drop scars rock core + scorched rim, rad/scorch
  zones added, shake + 180px blast ring pushed, side panel populates).
  Re-run:
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
- M7 decisions (user feedback): spawn buttons put creatures at RANDOM spots,
  which looked dead → every spawn pushes a marker {x, y, t, hue} to
  app.fx; engine prunes after render.js SPAWN_FX_TICKS=90, render draws an
  expanding fading ring (4→30px, hue = 130 - aggression*130, same formula
  as drawCreature). Shift-click on +buttons spawns 5 (same convention as
  canvas scatter); tooltips on the buttons, legend line on the splash.
  Inspect line now FOLLOWS the creature (ui.js keeps an `inspected` ref,
  hud() calls refreshInspect() each frame: live E/fit, repositioned over the
  creature, auto-hides on death, cleared by any other canvas action or
  reset). window.__arena = app is a console/debug handle (browser smoke
  tests use it). Verified in headless Chromium: ring pixels confirmed by
  radial getImageData scan (pause freezes the ring at its radius).
- M8 decisions (user-directed feature arc; user answered design questions:
  generated+paintable terrain, single Impact+severity slider for hazards,
  radiation = mutation multiplier + drain):
  - New terrain.js: TILE=32 (32×20 tiles), biome ids 0..4 in a Uint8Array,
    BIOMES table (open/water/rock/forest/tundra) with passable, plantable,
    plantMult, metaMult, color. Generation = seeded blob fields (3 water, 3
    rock, 2 tundra, 4 forest blobs; toroidal distance; edge jitter 0.8..1.2r;
    forest drawn last to trim shores; open stays dominant ~55-70%).
    paint(x,y,id) bumps version on real change; clearTerrain() for tests.
  - world.js: world.terrain = createTerrain(rng) (consumes rng before spawn
    placement — deterministic per seed). freeSpot() = 32 random passable
    tries → coarse grid scan → world center; used by initial creatures and
    spawn(). Sprouting retries up to 16× on plantable tiles (regen deferred
    to the pool if none found). Plant growth × plantMultAt (forest 2×,
    tundra 0.5×).
  - entity.js: movement — if the step along the heading is blocked (water/
    rock), align in one tick to the first open shore direction (±45° then
    ±90°, right-first) and step along it; if all blocked, hold ground and
    re-steer next tick. Deliberate choice: direct alignment (not gradual
    MAX_TURN steering) — gradual turns overshot 90° and carried creatures
    AWAY from wide walls. Metabolism × metaMultAt (tundra +25%). Newborn
    offset falls back to the parent's spot if impassable.
  - render.js: biome layer baked to an offscreen canvas, cached on
    terrain.version, blitted after the background fill (before grid);
    deterministic per-tile speckles (forest dots, tundra flecks, rock inset)
    so biomes don't read flat.
  - UI: Terrain button + 5 biome swatches (water preselected). Swatch click
    = pick biome + arm tool; Terrain button toggles; brush click leaves
    terrain mode. Drag paints the tile under the cursor; shift-click splats
    5 tiles in a 96px disc; painting clears inspect.
  - ui.js display fix: fit values render via Math.round, not toFixed(0) —
    toFixed prints "-0" for (−0.5, 0) fitness, which is legal early on
    (gain 0, spent > 0).
  - Verified in headless Chromium (test5.mjs): all four biome colors on
    canvas (open still dominant), swatch→drag paints tiles (typeAt 0→1),
    version bumps, water pixels render after re-bake, no creature sits in
    water, zero console errors.
- M9 decisions (user-directed: bigger impacts must change terrain; add a
  side stats readout with evolution detail):
  - New effects.js: zone layer owned by the world (world.effects), ticked
    in world.tick(). Zones {kind, x, y, r, power, ttl, maxTtl}:
    - scorch (every impact): drain SCORCH_DRAIN=1.5 × power × (1 - d/r)
      energy/tick, blocks sprouting AND freezes plant growth (ash);
      ttl = 150·s.
    - rad (s4 only): slow constant drain RAD_DRAIN=0.03 × (1 - d/r) plus
      the mutation hook — offspring bred inside inherit the parent's spot,
      so updateCreature's bud uses mutationRate × radMultAt, where
      radMultAt = max over rad zones of 1 + 9·power·(1 - d/r)·(ttl/maxTtl)
      → 10× at a fresh core, decaying linearly to 1 at expiry (ttl 900).
      mutateDna itself is unchanged (always mutates at rate>0; sigma scales
      with rate), so radiation widens the spread, not the odds.
  - Impact(x, y, s): R = 40s+20 (60/100/140/180). d < 0.5R → dead
    (deathCause 'hazard'); 0.5R..R → 25s×(1-d/R) energy damage to
    creatures and plants. Terrain scars: s1-2 none; s3 → crater (d < 0.6R)
    painted scorched id 5; s4 → core (d < 0.45R) rock id 2 (impassable),
    rim (0.45R..0.75R) scorched, + rad cloud r=1.25R.
  - terrain.js: biome id 5 scorched — passable, unplantable (plantMult 0),
    metaMult 1.1 (mild climate cost), color #171210; paintable swatch.
  - world.js: world.deaths {starve, predation, hazard, user} + world.births
    (buds only; user spawns are not offspring). Tick: births++ per bud,
    zone drain applied after each creature's update (a 0-energy death here
    is 'hazard'), effects.tick(), then death-cause tally before the
    dead-filter. User Kill bypasses the dead-filter, so ui.js increments
    deaths.user directly.
  - entity.js: deathCause set at each death site ('starve' at the met
    drain, 'predation' on a killing bite); bud mutation rate =
    settings.mutationRate × effects.radMultAt(parent spot).
  - ui.js: Impact button = one-shot arm mode like Kill (severity slider
    1..4, default 3); on drop: impact(), blast fx {ring: R} (render expands
    out to the blast radius instead of the 30px spawn ring), app.shake =
    3 + 2.5s, inspect cleared. hud() now also calls updatePanel().
  - New panel.js: updatePanel(els, world) — pure DOM writes from world
    state, ids collected once via panelIds(). Sections: Population (live
    count, herbivore/carnivore split via isCarnivore, all-time peak,
    births, deaths by cause), Ecosystem (plants, biomass = total plant
    energy, regen pool, avg energy), Evolution (distinct live lineages,
    max generation + lineage, all-time best fitness, and the LIVE mean of
    all 5 DNA traits — "what the population is becoming").
  - render.js: render(ctx, world, fx, shake) — shake ≥0.5 translates the
    frame by ±shake/2 random (engine decays shake ×0.85/frame to 0);
    drawZones paints scorch (red, alpha 0.05 + 0.04·power·(0.5+0.5fade))
    and rad (green, 0.06 + 0.05·fade) glows after terrain, before plants;
    scorched tiles get deterministic ash speckles in the bake.
  - index.html: HUD row gains Impact + severity slider; 6th swatch
    (scorched); canvas wrapped in #stage and #statsPanel sits beside it
    (224px, HUD+canvas+panel share one left-aligned #frame column); splash
    legend gains the Impact line.
  - Verified in headless Chromium (test6.mjs): panel visible + populating
    (counts, lineages, trait means), s4 drop → rock core (impassable) +
    scorched rim + rad/scorch zones + hazard deaths, far tile untouched,
    crater pixels distinct from water/open (the fresh glow tints them, so
    pixel asserts are "distinctly not water/background", exact colors are
    the tile ids), no creature sits in the new rock, zero console errors.
  - M10 plan (next milestone): Tornado = mousedown→drag→release polyline,
    head travels ~6px/tick, ~20px corridor clears plants/damages; boons
    Feast (energy plant cluster + feast zone) and Perk (shield or fertility
    zone) — both ride the same effects.js zone layer (add kinds
    'feast'/'shield'/'fert').
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
  we verify via tests only. **Must be served over http — do NOT open
  index.html via file://**: browsers block ES module scripts there, the
  engine never boots, and the page shows a dead splash. index.html carries
  a classic-script boot watchdog (engine.js sets window.__arenaBooted)
  that replaces the splash with serve instructions if boot fails within
  1s. Verified in headless Chromium (http: boots, resume/space work, zero
  console errors incl. favicon; file://: watchdog instructions shown).
