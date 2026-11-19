# Bangalore Life Simulator

An open-world simulation of Bengaluru. **Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first** — it is the full technical plan (Unreal Engine 5 target, OSM data pipeline, simulation architecture, roadmap, risks).

## What is in this repo today (Phase 1, milestone M0)

| Part | State | What it is |
|---|---|---|
| `prototype/` | **playable, tested** | Browser game (three.js): drive an auto-rickshaw / hatchback / scooter through Marathahalli with signal-obeying traffic, pedestrians, day-night, rain, GPS, fuel, damage and passenger-fare missions |
| `tools/osm_pipeline/` | **built, unit-tested** | Overpass fetcher + converter from OSM JSON to the game-tile format |
| `native_tests/` + `…/Metro/BLSTrainDynamics.h` | **built, tested with g++** | Engine-independent metro train dynamics + reference stopping driver |
| `unreal/BangaloreLifeSim/` | **skeleton, never compiled** | UE5 project files, tile loader, auto-rickshaw pawn, metro train component |

> ⚠ **The shipped map is an approximate stand-in, not OpenStreetMap data.** The authoring sandbox could not reach Overpass. Roads follow rough bearings around the Marathahalli bridge with a procedural side-street grid and generated buildings, so it does **not** yet satisfy "geographically recognisable Bangalore". The pipeline that fixes this is built; see *Use real OSM data* below.

## Run the prototype

```bash
cd prototype && python3 -m http.server 8765      # any static server works (ES modules need http://, not file://)
# open http://localhost:8765  in Chrome/Edge/Firefox (WebGL2 GPU recommended)
```
Click **Auto Driver Mode** (earn fares) or **Free Roam**. No build step; three.js r170 is vendored in `prototype/vendor/` (MIT).

| Key | Action | Key | Action |
|---|---|---|---|
| W / S | throttle / brake→reverse | A / D | steer |
| Space | handbrake (slides) | H | horn |
| E | interact (board, refuel) | F | leave / re-enter vehicle |
| C | camera (chase / high / hood) | M | map: search places, click to set GPS |
| R | rain | T | time ×1/×20/×90 · `[` `]` ±1 h |
| V | switch vehicle (Free Roam) | Shift | run (on foot) · Esc pause |

**Auto Driver loop:** follow the yellow beam → stop beside the passenger → drive the cyan beam destination with the GPS → stop to drop. Fare = tariff model (₹30 ≤2 km, ₹15/km after, ×1.5 at night — approximate) + 20 % tip if inside the time window − damage penalty. Money is saved in the browser (Continue).

## Use real OSM data (needs internet access to Overpass)

```bash
cd tools/osm_pipeline
python3 fetch_osm.py --bbox 12.940,77.685,12.975,77.725 --out marathahalli.osm.json     # south,west,north,east
python3 osm_to_game.py marathahalli.osm.json ../../prototype/data/marathahalli.json --origin 12.9569,77.7011
```
Reload the page: the "approximate" warning disappears because the tile no longer carries `approximate: true`. Expect to need cleanup for Bangalore's flyovers/dual carriageways (not yet modelled; see Known limitations). Keep "© OpenStreetMap contributors" attribution (ODbL).

## Tests

```bash
./run_tests.sh              # python + node + native: 6 + 28 + 24 checks
E2E=1 ./run_tests.sh        # + 17-step headless-Chromium gameplay test (needs: npm i playwright; npx playwright install chromium)
```
Native only: `g++ -std=c++17 -Iunreal/BangaloreLifeSim/Source/BangaloreLifeSim/Metro native_tests/test_train_dynamics.cpp -o ttd && ./ttd`

## Unreal project (skeleton)
Install the UE version named in `docs/ARCHITECTURE.md` §2, right-click `BangaloreLifeSim.uproject` → *Generate project files* → build. **Expect compile fixes on first build** — these sources were written without an Unreal toolchain and have never been compiled.

Milestone details (files, systems, setup, testing, limitations, next task): [`docs/MILESTONES.md`](docs/MILESTONES.md).

## Screenshots (headless Chromium, software GL, stand-in map)
`docs/screenshots/02_driving.png` (auto on Old Airport Road stand-in), `04_rainy_night.png`, `05_map.png` (GPS/search map).
