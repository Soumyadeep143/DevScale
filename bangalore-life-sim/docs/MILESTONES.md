# Milestone report — M0 / Phase 1 "Playable Prototype"

## Files created
* **Docs:** `README.md`, `docs/ARCHITECTURE.md`, `docs/MILESTONES.md`
* **Data pipeline:** `tools/osm_pipeline/{fetch_osm.py, osm_to_game.py, make_fixture.py, test_pipeline.py, fixtures/marathahalli_approx.osm.json}`, generated `prototype/data/marathahalli.json`
* **Prototype:** `prototype/index.html, style.css, js/{graph,world,vehicles,traffic,peds,weather,audio,missions,ui,main}.js`, `vendor/three.module.js`
* **Tests:** `prototype/tests/{graph,vehicle,traffic,missions}.test.mjs, e2e.cjs`, `native_tests/test_train_dynamics.cpp`, `run_tests.sh`
* **Unreal skeleton (uncompiled):** `unreal/BangaloreLifeSim/{BangaloreLifeSim.uproject, Source/…}` incl. `Metro/BLSTrainDynamics.h` (compiled/tested separately)

## Systems implemented (and how each is verified)
| System | Verified by |
|---|---|
| OSM→tile converter: projection, classification, oneway, building heights/orientation, junction-split directed graph, signals | 6 Python tests (projection vs haversine < 0.5 %) |
| Road graph, A* routing, spatial road/building queries, 2-phase signal timing (opposing axes never both green) | 9 Node tests |
| Vehicle physics: speed-sensitive steering, slip/grip (wet, handbrake), braking, damage, fuel | 9 Node tests (a real slip bug was found and fixed by these) |
| Traffic AI: IDM following, keep-left lanes, signal obedience, deadlock squeeze, recycling | 7 Node tests: 180 s × 90 agents, signal-violation rate < 2 %, no gridlock |
| Auto missions + tariff + tip/damage payout | 3 Node tests + live e2e |
| Rendering: roads, markings, merged extruded buildings with night-lit windows, trees, lamps, signals; day/night, rain | e2e screenshots (reviewed by eye) |
| Gameplay loop: collisions with buildings/traffic/pedestrians, fuel & refuel, on-foot, GPS/minimap/full map with search, save/continue | 17 e2e checks in headless Chromium, zero console errors |
| Metro train dynamics + reference stopping driver | 24 g++ checks (worst stop error 0.01 m over 16 approaches) |

## Setup / testing
See `README.md`. In short: serve `prototype/`, open in a browser; `./run_tests.sh` (add `E2E=1` for the browser test).

## Known limitations (be skeptical of the prototype's realism)
1. **Map is not real OSM data** (see warning in README); no real Bangalore landmarks' geometry. The grid of side streets is generic.
2. **No flyovers/underpasses/elevated metro** — the Marathahalli bridge is flat at-grade. ORR is one two-way ribbon, not a dual carriageway.
3. Traffic yields by forward cone, not conflict-zone reservation; no lane changes, overtaking rules, or turn restrictions; buses/emergency vehicles exist as types but no bus routes/stops behaviour.
4. Pedestrians walk sidewalks and idle; **they do not cross roads**, queue at bus stops, or follow daily routines. Hit pedestrians are knocked down and get up (no injury model).
5. Wet-road "reflections" are a darker/shinier material only (no SSR/Lumen). Lighting is basic; shadows follow the player only. No clouds/fog volumetrics.
6. Auto model is box primitives; sounds are synthesised oscillators, not recordings. Auto tariff numbers are approximate.
7. Metro Driver Mode is **not implemented** in the game — only the dynamics core exists. No metro stations, tracks, stations data, cab or passengers.
8. Phase 2 areas (Koramangala, HSR, Silk Board, Jayadeva) and the "additional locations" are absent.
9. Performance was only measured in software rendering (≈2.5 fps), which says nothing about real-GPU performance; budgets are unverified.
10. Unreal sources have never been compiled or opened in the editor.

## Next development task
**M1 — real map first.** On a machine with Overpass access: fetch the Marathahalli bbox, convert, load it, and fix what breaks (junction topology, `layer`/`bridge` handling so the Marathahalli flyover and ORR carriageways become level-aware, turn restrictions). Acceptance: route Marathahalli→Kundalahalli Gate in-game matches a reference map app's road sequence, and the "approximate" banner is gone. Then M2 (compile & stand up the UE project).
