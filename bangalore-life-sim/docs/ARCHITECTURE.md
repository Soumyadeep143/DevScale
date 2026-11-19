# Bangalore Life Simulator — Technical Architecture

Status key used throughout: **[built]** exists and is tested in this repo · **[skeleton]** source written but not compiled/run (needs the Unreal toolchain) · **[planned]** design only.

## 0. Honest scope statement

The brief describes a multi-year, multi-person AAA project. This repo delivers (a) this architecture, (b) a **playable browser prototype** of Phase 1 that proves the simulation systems and the data pipeline, and (c) an Unreal Engine 5 project skeleton plus one engine-independent C++ core (train dynamics) that *is* compiled and tested. The prototype is the **behavioural reference**: handling constants, traffic rules, tariff logic and the tile format are validated there, then ported to UE.

The Marathahalli tile shipped here is an **approximate stand-in, not OpenStreetMap data** (the sandbox could not reach Overpass). The pipeline that converts real OSM data is built and tested; swapping the tile is one command (see README).

## 1. System architecture

```
                 ┌────────────────────────── OFFLINE DATA PIPELINE (Python) ──────────────────────────┐
 OSM (Geofabrik  │ fetch → clean → project → classify → graph → height/DEM → tile & PCG data → validate │
 + Overpass),    └───────────────┬───────────────────────────────────────────────┬─────────────────────┘
 DEM, BMRCL data                 │ game-tile JSON (+ GeoJSON, heightmaps)        │ metro line/station JSON
                                 ▼                                               ▼
 ┌──────────────────────────── UNREAL ENGINE 5 RUNTIME (C++/Blueprint) ──────────────────────────────┐
 │ WORLD            World Partition cells ← PCG graphs (roads, buildings, props) ← tile data assets    │
 │ SIMULATION       Mass Entity (traffic, pedestrians) · ZoneGraph lanes · Chaos vehicles (hero cars)  │
 │ TRANSIT          Metro line graph · Train dynamics (BLS::Step) · Signalling/ATP · Passenger flow    │
 │ GAMEPLAY         Modes (Free/Auto/Metro/Daily/Career/Mission) · Economy · Save · Missions           │
 │ PRESENTATION     Lumen · Nanite · VSM · MetaSounds · Niagara (rain) · Common UI HUD/menus/map      │
 └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Layering rule: **gameplay code depends on interfaces; simulation never depends on rendering.** Traffic/NPC/metro logic is data-in/data-out so it can run headless (dedicated tests, soak tests, future server-side validation).

### Module map (UE project `BangaloreLifeSim`; one module until build times justify splitting)

| Module / folder | Responsibility | Depends on |
|---|---|---|
| `World/` | Tile loading, geo-reference, PCG inputs, POI registry | Json, GeoReferencing, PCG |
| `Vehicles/` | Chaos vehicle pawns (auto, car, scooter, bus), damage, fuel | ChaosVehicles |
| `Traffic/` | Mass traffic processors, signal controllers, lane graph | MassEntity, ZoneGraph, World |
| `Crowd/` | Pedestrian Mass fragments, daily-schedule planner, crossings | MassEntity, World |
| `Metro/` | Line/station data, `BLSTrainDynamics.h`, ATP, driver cab, passengers | World |
| `Gameplay/` | Mode state machines, missions, economy, save game | all above (interfaces) |
| `UI/` | Common UI: HUD, map, GPS, menus | Gameplay |
| `Weather/` | Time-of-day, rain/Niagara, wet-surface parameter collection | — |

## 2. Unreal Engine version

**Recommendation: pin to a single UE 5.6.x release for Phases 1–3** (the `.uproject` says `5.6`). Reasons: World Partition + One File Per Actor, Nanite, Lumen and Chaos Vehicles are established; PCG and Mass Entity/ZoneGraph are usable but younger and thinly documented, so budget prototyping time for them (M2/M3) before committing the design to them. **Caveat:** this sandbox cannot see Epic's release page, so I cannot confirm the newest stable build. Rule: pick the newest 5.x that has been out ≥3 months with at least a `.2` hotfix, pin it in the `.uproject`, and re-evaluate only at phase boundaries (never mid-phase). Do not use the Mass traffic "City Sample" plugin as a dependency; borrow ideas, keep our own processors (it is sample code, not a supported product).

## 3. Geographic data pipeline

**Sources (all legitimately licensed):**

| Data | Source | Licence/attribution |
|---|---|---|
| Roads, buildings, POIs, signals, bus stops, metro alignment | OpenStreetMap — Geofabrik Karnataka extract for bulk, Overpass for bbox work | ODbL — attribute "© OpenStreetMap contributors"; share-alike applies to derived *databases* |
| Terrain | Copernicus GLO-30 DEM (or SRTM) | Free with attribution |
| Metro stations / line order / timetables / fares | BMRCL official publications; cross-check OSM `railway=station` | Verify terms of use; do not scrape in bulk |
| Building heights | OSM `height`, `building:levels`; fallback heuristics by use/zone; optionally Overture Maps buildings | ODbL / CDLA |

**Stages** (implemented as scripts in `tools/osm_pipeline/`):

1. **fetch** `fetch_osm.py` — bbox → Overpass JSON with `out geom` (mirror fallback + back-off). **[built, untested against the live server in this sandbox]**
2. **normalise & project** `osm_to_game.py` — equirectangular projection around a tile origin (error vs haversine < 0.5 % at 5.5 km, unit-tested; use UTM 43N for production tiles > 10 km). **[built]**
3. **classify** highway → lanes/speed/width; `oneway`, `oneway=-1`; building kind & height. **[built]**
4. **graph build** — ways split at junction nodes (shared by ≥2 ways, endpoints, signals) into directed edges. **[built]**
5. **repair/validate** — [planned] snap tolerance, dual-carriageway merge, flyover/underpass layering (`layer`, `bridge`, `tunnel`), turn restrictions (`restriction` relations), connectivity check per tile.
6. **tile & stream** — [planned] cut into 256 m logical tiles; 512 m World Partition cells; per-tile files so cells stream independently.
7. **terrain** — [planned] DEM → 16-bit heightmap tiles → Landscape (Bangalore ≈ 900 m plateau, mostly gentle, so one Landscape component grid is enough).
8. **metro** — [planned] OSM `railway=subway/light_rail` ways + BMRCL station list → `line.json` (ordered stations, chainage, elevated/underground flag, platform side).

**Production rule:** the pipeline must be deterministic (same input ⇒ byte-identical tile) so tiles can be diffed in review and cached in CI.

## 4. OSM → playable 3D environment

| Feature | Prototype (built) | Unreal (planned) |
|---|---|---|
| Road ribbon | Mitered strip mesh per way, kerb strip, lane dashes, centre line | Spline per way → PCG spline mesh/decal; intersections via junction patches; Landscape splines for terrain-hugging |
| Intersections | Overlap of ribbons (same material) | Procedural junction mesh from the node's incident edges (sort by bearing, fillet corners) |
| Buildings | Extruded footprint, merged, window atlas + night emissive | PCG: footprint → modular facade kit (Nanite) by kind/height; LOD to proxy slab ≥ 400 m |
| Trees / lamps / signals | Instanced / placed along edges | PCG point generators with exclusion by road & footprint; HISM |
| Signals | 2-phase timing per node | Same timing data → traffic-light actors driving Mass lane access |
| Traffic lanes | Offset from centreline, **keep-left** | ZoneGraph lane graph generated from the same edges |

## 5. Simulation architecture

### 5.1 Vehicles (hero vs ambient)
* **Hero vehicles** (player & ≤ ~12 nearby): Chaos Vehicles pawns. Handling is first tuned against `prototype/js/vehicles.js` (bicycle model + slip + damage/fuel), then re-tuned in-engine. [skeleton: `BLSAutoRickshaw`]
* **Ambient vehicles**: Mass Entity fragments (transform, lane position, speed, personality) with LOD: full Chaos pawn → skeletal mesh kinematic → instanced static mesh → statistical (no mesh) beyond ~400 m. Never simulate invisible traffic per-vehicle; keep per-tile *flow state* and materialise it near the player.
* Damage: per-zone deformation parameters (Phase 4); fuel & refuelling (Phase 1 prototype built).

### 5.2 Traffic AI [prototype built, Mass port planned]
Per agent each tick: (1) follow edge polyline with lateral lane offset (**left-hand traffic**); (2) IDM car-following against the nearest leader found with a spatial hash; (3) virtual leader at the stop line for red/amber signals; (4) random-weighted route choice (later: OD matrices from time-of-day demand); (5) personality (desired-speed factor); (6) Bangalore behaviours — two-wheeler lateral filtering, honking after sustained blockage, **squeeze-through** after 7 s deadlock (bounded ghosting so junctions never gridlock permanently); (7) recycle-by-distance spawn/despawn near the player.
Known gap: junction conflict resolution is cone-based, not conflict-zone reservation (see §8).

### 5.3 Pedestrians / NPC life [prototype: sidewalk walkers + idlers; rest planned]
Mass fragments + a **schedule planner** (home → commute → work → lunch → shop → home) over a POI registry; navigation on sidewalk graph + crossing links at signals/zebras; LOD to animation-instanced crowd. Metro/bus boarding is an *action* in the schedule that consumes a transit vehicle's capacity.

### 5.4 Namma Metro [dynamics built & tested; rest planned]
* **Data model:** `Line{id,name,colour,stations[], segments[{elevated|underground, chainage range}]}`, `Station{id,name,chainage,platformLength,exits[],interchangeWith[]}`, `Timetable{headway by time band}`. **All station sequences must come from verified BMRCL data — none are hard-coded in this repo.**
* **Dynamics:** `BLSTrainDynamics.h` — jerk-limited traction/brake, Davis-equation resistance, gradient, emergency-brake latch, overspeed flag. Engine-free, compiled and unit-tested with `g++`; includes a reference "perfect driver" (stops within 0.01 m of the mark in 16 scenarios) usable as ATO and as the scoring oracle. Parameters are typical-metro defaults, **not BEML/BMRCL specs** — replace.
* **Signalling:** block sections + ATP speed supervision (movement-authority distance → braking-curve limit) that feeds `SpeedLimitMS`.
* **Driver cab:** spline-follow actor + cab Blueprint (notch handle, EB, door controls, ATP/speed display); score = punctuality + stop accuracy + comfort (jerk integral) + overspeed events.
* **Passengers:** platform capacity, dwell time from boarding demand, announcements (MetaSounds, Kannada/English/Hindi).
* **Interchange example** from the brief — *Jayadeva Hospital → MG Road*: from my understanding this is **Yellow Line → (RV Road) → Green Line → (Majestic) → Purple Line**, i.e. two interchanges, not one direct ride. This must be validated against the current BMRCL network map; the route planner must be driven by the verified line graph, not by this note.

### 5.5 Gameplay layers
Mode = state machine over shared services (Economy, Missions, Save). **Auto Driver** [built]: hail → pickup → metered ride → drop → payout with tip window and damage penalty; tariff model (₹30 for first 2 km, ₹15/km after, ×1.5 night — *approximate, verify against the current Transport Department notification*). Career/Daily-life/Mission modes build on the same mission and schedule services [planned].

## 6. Project folder structure

```
bangalore-life-sim/
├── docs/                     ARCHITECTURE.md, MILESTONES.md
├── tools/osm_pipeline/       fetch_osm.py, osm_to_game.py, make_fixture.py, test_pipeline.py, fixtures/
├── prototype/                playable browser reference (index.html, js/, data/, tests/, vendor/)
│   ├── js/                   graph, world, vehicles, traffic, peds, weather, audio, missions, ui, main
│   └── tests/                node unit tests + Playwright e2e
├── unreal/BangaloreLifeSim/  UE5 project skeleton (uproject, Source/BangaloreLifeSim/{World,Vehicles,Traffic,Crowd,Metro,Gameplay,UI,Weather})
├── native_tests/             g++-compiled tests for engine-independent C++ cores
└── run_tests.sh              runs everything (E2E=1 adds the browser test)
```
UE content conventions: `/Game/BLS/{Maps,World,Vehicles,Metro,Characters,Audio,UI,Data}`; one File Per Actor; Data Assets for tuning; no gameplay logic in level Blueprints.

## 7. Roadmap & milestones (each: playable build + automated tests + perf budget check)

| M | Deliverable | Exit criteria |
|---|---|---|
| **M0** ✔ | Architecture, pipeline v1, browser reference (this repo) | tests green; README setup works |
| **M1** | Real OSM Marathahalli tile in prototype; flyover/layers; turn restrictions | tile built from live Overpass; route sanity vs a map app |
| **M2** | UE project compiles; tile → roads/buildings via PCG; Chaos auto driving | 60 fps @1080p on target GPU, 1 tile |
| **M3** | Mass traffic + pedestrians in UE; signals; hero-vehicle handoff | 300 ambient vehicles, no deadlock in 30-min soak |
| **M4** | Phase 2: Koramangala, HSR, Silk Board, Jayadeva; streaming | cell stream hitch < 33 ms |
| **M5** | Phase 3: Purple & Green lines, cab, passengers, announcements | verified station data; stop accuracy scoring |
| **M6** | Phase 4: weather/wet reflections (Lumen), schedules, damage | rain on/off perf delta < 15 % |
| **M7** | Phase 5: career, missions, economy, achievements | 2 h content loop |
| **M8** | Phase 6: optimisation, memory, console-ready abstraction | budgets below met |

**Budgets (PC mid-high target, to be validated):** 60 fps 1440p with upscaling; ≤ 12 GB VRAM; ≤ 16 GB RAM; game thread ≤ 8 ms; ≤ 10 k draw calls via instancing.

## 8. Technical risks & mitigations

| Risk | Why it bites | Mitigation |
|---|---|---|
| **OSM data quality in Bangalore** (missing heights, unmapped lanes, inconsistent junction topology, informal roads) | Wrong-looking streets break the "recognisable Bangalore" goal | Validation reports per tile; manual override layer (`overrides/*.json`) keyed by OSM id; local-knowledge review of landmark junctions (Silk Board, Marathahalli) |
| **Flyovers & elevated metro** (Marathahalli bridge, Silk Board, Jayadeva) | 2.5-D topology: roads cross without joining | Use `layer/bridge/tunnel` to build level-aware graph; separate lane graphs per level; ramps explicit |
| **Density vs CPU** | Bangalore traffic is dense and two-wheeler-heavy | Mass + LOD + flow materialisation; two-wheelers share lane-space model, not capsule collision |
| **Junction deadlock** | Cone-based yielding can lock; real Bangalore junctions also "lock" | Current: bounded squeeze-through. Next: conflict-zone reservation + aggression parameter |
| **Vehicle feel** (3-wheel Chaos setup; autos tip) | Chaos has no tricycle template | Tune against the prototype's reference curves; custom anti-roll; consider custom movement component if Chaos fights us |
| **World streaming hitches** | Dense building meshes | WP cells ≤ 512 m, Nanite, HLOD, async PCG generation at cook time (not runtime) |
| **Licensing** | ODbL share-alike, GTA IP | Attribution in credits; derived tile DB published under ODbL if distributed; **zero** GTA assets/code; original art only |
| **Metro realism claims** | Fabricated station data would be wrong and misleading | [planned] Pipeline requires a source-citation field per station and rejects unsourced records (and a CI job once CI exists) |
| **Scope** | AAA ambition vs team size | Vertical slice per phase; no phase starts before the previous one's exit criteria pass |
| **Sandbox limits (this session)** | No GPU, no UE, no live OSM | Everything claimed "built" has an automated test; everything else is marked [skeleton]/[planned] |
