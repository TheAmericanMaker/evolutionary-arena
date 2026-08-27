// DOM wiring (M5): controls, brush, inspect, splash, records persistence.
// Decisions (spec §4.7/§5):
// - Starts paused under the intro splash; space (on body) or the
//   Pause/Resume button toggles. Step ticks once, paused or not.
// - Speed slider 1..64x (spec §4.7); wheel over the canvas nudges it ±1.
// - Sliders feed world.settings every frame via hud() (was engine's job).
// - Spawn buttons: standardized genomes (dna.js) at random toroidal spots
//   via world.rng, energy OFFSPRING_ENERGY, fresh lineages U1, U2, ...
//   Shift-click spawns 5 (same convention as canvas scatter). Every spawn
//   drops a marker ring (app.fx) because the spot is random.
// - Canvas click, by tool: Plant (default) — a creature under the cursor
//   (<= max(6, size+3) px) is INSPECTED; the DNA line FOLLOWS that creature
//   each frame (live E/fit), auto-hides when it dies, and any other canvas
//   action clears it. Otherwise a plant is dropped (drag paints, one per
//   ~8px travel; user plants cost no pool energy and bypass MAX_PLANTS:
//   user input overrides the economy).
//   Feed — the tool wins over inspect: every click/drag gives +FEED_ENERGY
//   to creatures within FEED_RADIUS (spec §1: "feed creatures by clicking
//   them"). Shift-click always scatters (plant: 5 in a 48px disc; feed:
//   radius 24).
// - Kill under cursor arms a one-shot mode; the next canvas click removes
//   the creature under the cursor immediately (even while paused).
// - M8 Terrain tool: the Terrain button (or a biome swatch) arms paint mode;
//   drag on the canvas paints the selected biome tile under the cursor.
//   Shift-click splats 5 tiles. Painting bumps terrain.version, which makes
//   render.js re-bake its offscreen layer.
// - M10 Tornado/Feast/Perk: Tornado arms a drag — mousedown starts the path,
//   drag extends it, release launches a tornado along it (a plain click
//   releases nothing and disarms). Feast/Perk arm one-shot drops like Impact:
//   the next canvas click drops the boon zone (effects.js).
// - M13 Seed row: the run's seed — type + Enter loads it, Copy puts it on
//   the clipboard (execCommand fallback), New rolls a random 32-bit seed.
//   Reset world now restarts with the CURRENT seed (was always 1). All
//   resets keep all-time records. Same seed replays an identical run
//   (tests/determinism.test.js).
// - Records (pure, stats.js) persist to localStorage 'arena_records':
//   merged on load, autosaved every 20s + on pagehide; Reset records clears
//   storage and the in-memory records. Reset world keeps records (all-time).

import { HERBIVORE_DNA, CARNIVORE_DNA } from './dna.js';
import { drawSparkline } from './render.js';
import { fitness } from './stats.js';
import { createWorld, tick, spawn, W, H, wrap } from './world.js';
import { impact, impactRadius, feast, perk, startTornado, FEAST_R, FERT_R, TORNADO_RADIUS } from './effects.js';
import { panelIds, updatePanel } from './panel.js';
import { toroidDist } from './spatial.js';
import { OFFSPRING_ENERGY, MAX_ENERGY } from './entity.js';

const RECORDS_KEY = 'arena_records';
const FEED_ENERGY = 10;
const FEED_RADIUS = 12;
const PAINT_GAP = 8;
const KILL_RADIUS = 10;

function readRecords() {
  try { return JSON.parse(localStorage.getItem(RECORDS_KEY)); } catch { return null; }
}

function writeRecords(data) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(data)); } catch { /* private mode */ }
}

export function createUI(app) {
  const $ = (id) => document.getElementById(id);
  const els = {
    canvas: $('world'), tick: $('tick'), plants: $('plants'), creatures: $('creatures'),
    veg: $('veg'), carn: $('carn'), avgEnergy: $('avgEnergy'), lineage: $('lineage'),
    bestFit: $('bestFit'), peakPop: $('peakPop'),
    popChart: $('popChart'), bestCard: $('bestCard'),
    speed: $('speed'), speedVal: $('speedVal'),
    plantRate: $('plantRate'), plantRateVal: $('plantRateVal'),
    mutation: $('mutation'), mutationVal: $('mutationVal'),
    pauseBtn: $('pauseBtn'), stepBtn: $('stepBtn'), brushBtn: $('brushBtn'),
    killBtn: $('killBtn'), herbBtn: $('herbBtn'), carnBtn: $('carnBtn'),
    resetBtn: $('resetBtn'), recordsBtn: $('recordsBtn'),
    seed: $('seed'), seedCopy: $('seedCopyBtn'), seedNew: $('seedNewBtn'),
    splash: $('splash'), inspect: $('inspect'),
    terrainBtn: $('terrainBtn'), swatches: document.querySelectorAll('.swatch'),
    impactBtn: $('impactBtn'), severity: $('severity'), severityVal: $('severityVal'),
    tornadoBtn: $('tornadoBtn'), feastBtn: $('feastBtn'), perkBtn: $('perkBtn'),
  };
  const panel = panelIds();

  const chartCtx = els.popChart.getContext('2d');

  app.world.records.load(readRecords());

  let tool = 'plant'; // 'plant' | 'feed' | 'terrain'
  let paintBiome = 1;
  let killArmed = false;
  let impactArmed = false;
  let tornadoArmed = false;
  let feastArmed = false;
  let perkArmed = false;
  let draftPts = null;
  let userSeq = 0;
  let painting = null;

  function setPaused(p) {
    app.paused = p;
    els.pauseBtn.textContent = p ? 'Resume' : 'Pause';
    els.splash.hidden = !p;
  }

  els.pauseBtn.addEventListener('click', () => setPaused(!app.paused));
  els.stepBtn.addEventListener('click', () => tick(app.world));
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.target !== document.body) return;
    e.preventDefault();
    setPaused(!app.paused);
  });

  function speed() { return Math.max(1, Math.round(Number(els.speed.value) || 1)); }

  els.canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    els.speed.value = String(Math.min(64, Math.max(1, speed() + (e.deltaY < 0 ? 1 : -1))));
  }, { passive: false });

  function setTool(t) {
    tool = t;
    els.terrainBtn.classList.toggle('active', t === 'terrain');
  }
  els.brushBtn.addEventListener('click', () => {
    if (tool === 'terrain') { setTool('plant'); return; }
    tool = tool === 'plant' ? 'feed' : 'plant';
    els.brushBtn.textContent = tool === 'plant' ? 'Brush: Plant' : 'Brush: Feed';
  });
  els.killBtn.addEventListener('click', () => {
    killArmed = !killArmed;
    els.killBtn.classList.toggle('armed', killArmed);
  });
  // M9: one-shot arm like Kill — the next canvas click drops the impact.
  // Severity (1..4) comes from the slider; s3+ scars the terrain (effects.js).
  els.impactBtn.addEventListener('click', () => {
    impactArmed = !impactArmed;
    els.impactBtn.classList.toggle('armed', impactArmed);
  });
  els.severity.addEventListener('input', () => {
    els.severityVal.textContent = els.severity.value;
  });
  // M10: Tornado arms a drag — mousedown starts the path, drag extends it,
  // release launches the tornado along it (a plain click releases nothing).
  // Feast/Perk arm one-shot modes like Impact: the next click drops the boon.
  els.tornadoBtn.addEventListener('click', () => {
    tornadoArmed = !tornadoArmed;
    els.tornadoBtn.classList.toggle('armed', tornadoArmed);
    if (!tornadoArmed) { draftPts = null; app.tornadoDraft = null; }
  });
  els.feastBtn.addEventListener('click', () => {
    feastArmed = !feastArmed;
    els.feastBtn.classList.toggle('armed', feastArmed);
  });
  els.perkBtn.addEventListener('click', () => {
    perkArmed = !perkArmed;
    els.perkBtn.classList.toggle('armed', perkArmed);
  });
  els.terrainBtn.addEventListener('click', () => setTool(tool === 'terrain' ? 'plant' : 'terrain'));
  for (const sw of els.swatches) {
    sw.addEventListener('click', () => {
      paintBiome = Number(sw.dataset.biome);
      for (const o of els.swatches) o.classList.toggle('active', o === sw);
      setTool('terrain');
    });
  }
  function spawnMany(dna, n) {
    for (let i = 0; i < n; i++) {
      userSeq += 1;
      const c = spawn(app.world, dna, `U${userSeq}`);
      app.fx.push({ x: c.x, y: c.y, t: app.world.tick, hue: 130 - dna.aggression * 130 });
    }
  }
  els.herbBtn.addEventListener('click', (e) => spawnMany(HERBIVORE_DNA, e.shiftKey ? 5 : 1));
  els.carnBtn.addEventListener('click', (e) => spawnMany(CARNIVORE_DNA, e.shiftKey ? 5 : 1));
  els.resetBtn.addEventListener('click', () => resetWorld(app.world.seed));
  // M13: seed controls — the run's identity. Same seed → identical world and
  // history (tests/determinism.test.js guards it), so a copied seed is a
  // shareable, replayable run. New rolls a random 32-bit seed; typing a seed
  // and committing (Enter/blur) loads it. Both keep all-time records, like
  // Reset world does.
  function resetWorld(seed) {
    const s = Math.floor(Number(seed)) >>> 0;
    const kept = app.world.records.data;
    app.world = createWorld(s);
    app.world.records.load(kept);
    app.fx.length = 0;
    app.shake = 0;
    app.tornadoDraft = null;
    draftPts = null;
    clearInspect();
    els.seed.value = String(s);
  }
  els.seed.addEventListener('change', () => {
    const v = els.seed.value.trim();
    if (!v || Number.isNaN(Number(v))) { els.seed.value = String(app.world.seed); return; }
    resetWorld(v);
  });
  els.seedNew.addEventListener('click', () => resetWorld(crypto.getRandomValues(new Uint32Array(1))[0]));
  function copySeed() {
    const text = String(app.world.seed);
    const label = (ok) => {
      els.seedCopy.textContent = ok ? 'Copied!' : 'Copy failed';
      setTimeout(() => { els.seedCopy.textContent = 'Copy seed'; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => label(true), () => fallbackCopy(text, label));
    } else fallbackCopy(text, label);
  }
  function fallbackCopy(text, label) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      label(document.execCommand('copy'));
      ta.remove();
    } catch { label(false); }
  }
  els.seedCopy.addEventListener('click', copySeed);
  els.recordsBtn.addEventListener('click', () => {
    app.world.records.reset();
    try { localStorage.removeItem(RECORDS_KEY); } catch { /* ignore */ }
  });

  setInterval(() => writeRecords(app.world.records.data), 20000);
  window.addEventListener('pagehide', () => writeRecords(app.world.records.data));

  function worldPos(e) {
    const r = els.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }

  function creatureAt(x, y, pad) {
    let best = null;
    let bestD = Infinity;
    for (const c of app.world.creatures) {
      const d = toroidDist(x, y, c.x, c.y, W, H);
      if (d <= Math.max(pad, c.dna.size + 3) && d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function dropPlant(x, y) {
    app.world.plants.push({ x: wrap(x, W), y: wrap(y, H), energy: 1 });
  }

  function feedAt(x, y, radius) {
    for (const c of app.world.creatures) {
      if (toroidDist(x, y, c.x, c.y, W, H) <= radius) {
        c.energy = Math.min(MAX_ENERGY, c.energy + FEED_ENERGY);
      }
    }
  }

  function paintBiomeAt(x, y) {
    app.world.terrain.paint(wrap(x, W), wrap(y, H), paintBiome);
  }

  function brush(x, y) {
    if (tool === 'terrain') paintBiomeAt(x, y);
    else if (tool === 'plant') dropPlant(x, y);
    else feedAt(x, y, FEED_RADIUS);
  }

  function scatter(x, y) {
    if (tool === 'terrain') {
      for (let i = 0; i < 5; i++) {
        paintBiomeAt(x + (app.world.rng.next() - 0.5) * 96, y + (app.world.rng.next() - 0.5) * 96);
      }
    } else if (tool === 'plant') {
      for (let i = 0; i < 5; i++) {
        dropPlant(x + (app.world.rng.next() - 0.5) * 48, y + (app.world.rng.next() - 0.5) * 48);
      }
    } else {
      feedAt(x, y, 24);
    }
  }

  let inspected = null;
  function clearInspect() {
    inspected = null;
    els.inspect.hidden = true;
  }
  // Follows the inspected creature each frame (hud calls it), so the line
  // sticks to its subject instead of stranding at the old cursor spot.
  function refreshInspect() {
    if (!inspected) return;
    if (!app.world.creatures.includes(inspected)) { clearInspect(); return; }
    const c = inspected;
    const d = c.dna;
    els.inspect.textContent =
      `${c.lineageId} g${c.generation} · ${c.state} · E ${c.energy.toFixed(0)} · fit ${Math.round(fitness(c))}\n` +
      `spd ${d.speed.toFixed(2)} · vis ${d.vision.toFixed(0)} · met ${d.metabolism.toFixed(3)}\n` +
      `agg ${d.aggression.toFixed(2)} · size ${d.size.toFixed(1)}`;
    const r = els.canvas.getBoundingClientRect();
    const sx = r.left + (c.x / W) * r.width;
    const sy = r.top + (c.y / H) * r.height;
    els.inspect.style.left = `${Math.min(sx + 14, window.innerWidth - 260)}px`;
    els.inspect.style.top = `${Math.min(sy + 18, window.innerHeight - 96)}px`;
    els.inspect.hidden = false;
  }

  els.canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const { x, y } = worldPos(e);
    if (impactArmed) {
      impactArmed = false;
      els.impactBtn.classList.remove('armed');
      const s = impact(app.world, x, y, Number(els.severity.value) || 2);
      app.fx.push({ x, y, t: app.world.tick, hue: 15, ring: impactRadius(s) });
      app.shake = 3 + 2.5 * s;
      clearInspect();
      return;
    }
    if (feastArmed) {
      feastArmed = false;
      els.feastBtn.classList.remove('armed');
      feast(app.world, x, y);
      app.fx.push({ x, y, t: app.world.tick, hue: 45, ring: FEAST_R });
      clearInspect();
      return;
    }
    if (perkArmed) {
      perkArmed = false;
      els.perkBtn.classList.remove('armed');
      perk(app.world, x, y);
      app.fx.push({ x, y, t: app.world.tick, hue: 320, ring: FERT_R });
      clearInspect();
      return;
    }
    if (tornadoArmed) {
      draftPts = [{ x, y }];
      app.tornadoDraft = draftPts;
      clearInspect();
      return;
    }
    if (e.shiftKey) { clearInspect(); scatter(x, y); return; }
    if (killArmed) {
      killArmed = false;
      els.killBtn.classList.remove('armed');
      const victim = creatureAt(x, y, KILL_RADIUS);
      if (victim) {
        // Bypasses the dead-filter, so tally the user kill directly.
        app.world.deaths.user += 1;
        app.world.creatures = app.world.creatures.filter((c) => c !== victim);
        clearInspect();
      }
      return;
    }
    if (tool === 'feed' || tool === 'terrain') {
      clearInspect();
      painting = { x, y };
      brush(x, y);
      return;
    }
    const hit = creatureAt(x, y, 6);
    if (hit) { inspected = hit; refreshInspect(); return; }
    clearInspect();
    painting = { x, y };
    brush(x, y);
  });

  window.addEventListener('mousemove', (e) => {
    if (draftPts) {
      const { x, y } = worldPos(e);
      const last = draftPts[draftPts.length - 1];
      if ((x - last.x) ** 2 + (y - last.y) ** 2 >= 144) draftPts.push({ x, y }); // 12px
      return;
    }
    if (!painting) return;
    const { x, y } = worldPos(e);
    const dx = x - painting.x;
    const dy = y - painting.y;
    if (dx * dx + dy * dy < PAINT_GAP * PAINT_GAP) return;
    painting = { x, y };
    brush(x, y);
  });

  window.addEventListener('mouseup', () => {
    if (draftPts) {
      const t = startTornado(app.world, draftPts);
      draftPts = null;
      app.tornadoDraft = null;
      if (t) {
        app.shake = Math.max(app.shake, 4);
        app.fx.push({ x: t.pts[0].x, y: t.pts[0].y, t: app.world.tick, hue: 210, ring: TORNADO_RADIUS * 2 });
      }
      tornadoArmed = false;
      els.tornadoBtn.classList.remove('armed');
    }
    painting = null;
  });

  function hud() {
    const w = app.world;
    w.settings.plantRate = Number(els.plantRate.value) || 0;
    w.settings.mutationRate = Number(els.mutation.value) || 0;
    els.tick.textContent = String(w.tick).padStart(6, '0');
    els.plants.textContent = String(w.plants.length);
    els.creatures.textContent = String(w.creatures.length);
    const last = w.stats.samples[w.stats.samples.length - 1];
    els.veg.textContent = String(last ? last.veg : 0);
    els.carn.textContent = String(last ? last.carn : 0);
    els.avgEnergy.textContent = last && w.creatures.length ? (last.energy / w.creatures.length).toFixed(1) : '0';
    const rec = w.records.data;
    els.lineage.textContent = rec.longestLineage ? `${rec.longestLineage.lineageId} g${rec.longestLineage.gen}` : '—';
    els.bestFit.textContent = rec.bestFitness ? `${rec.bestFitness.value.toFixed(0)} (${rec.bestFitness.lineageId})` : '—';
    els.peakPop.textContent = String(rec.peakPopulation.pop);
    drawSparkline(chartCtx, w.stats.samples, els.popChart.width, els.popChart.height);
    const bf = rec.bestFitness;
    els.bestCard.hidden = !bf;
    if (bf) {
      const d = bf.dna;
      els.bestCard.textContent =
        `BEST ${bf.lineageId} · fit ${Math.round(bf.value)}\n` +
        `spd ${d.speed.toFixed(2)} · vis ${d.vision.toFixed(0)} · met ${d.metabolism.toFixed(3)}\n` +
        `agg ${d.aggression.toFixed(2)} · size ${d.size.toFixed(1)}`;
    }
    els.speedVal.textContent = String(speed());
    els.plantRateVal.textContent = Number(els.plantRate.value).toFixed(2);
    els.mutationVal.textContent = Number(els.mutation.value).toFixed(2);
    updatePanel(panel, w); // M9 side readout
    refreshInspect();
  }

  return { speed, hud, setPaused };
}
