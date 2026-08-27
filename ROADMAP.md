# Roadmap

Backlog, in priority order. Each item lands as one small PR that is
reviewed before merging into `main`.

## Wave 1 — finish what's planned, harden the core claims
- [x] M10 Tornado + Boons — drag-drawn tornado hazard; Feast and Perk boon zones
- [x] M11 CI — GitHub Actions running `node --test` on push and on PR
- [x] M12 Determinism regression test (same seed, two worlds, identical state after 600 ticks)
- [x] M13 Seed display + copy (+ roll) in the HUD (shareable, replayable runs)

## Wave 2 — make evolution visible
- [ ] Color-by-lineage toggle (diet | lineage | size)
- [ ] Lineage detail view (age, live population, per-generation trait drift)
- [ ] Trait drift sparklines in the stats panel
- [ ] Aging — per-tick cost that grows with age, real generational turnover

## Wave 3 — deepen the sim
- [ ] Metabolic trade-offs — speed and size burn energy (stops all-trait drift)
- [ ] Seasonal plant cycles — the regen pool pulses, driving boom/crash waves
- [ ] Scenario presets — Drought, Ice Age, Mutagen Storm, Purge

## Wave 4 — shareability polish
- [ ] Screenshot capture (canvas + stats as a PNG)
- [ ] Screenshot/GIF in the README
- [ ] Interactive population chart (hover for values, herbivore/carnivore series)
- [ ] Responsive scaling for smaller windows

## Deliberately out of scope
Audio, mobile touch input, multiplayer.
