#!/usr/bin/env python3
"""Generate an *approximate stand-in* tile in Overpass JSON format around Marathahalli.

IMPORTANT: this is NOT real OpenStreetMap data. It is hand-authored geometry (arterial
bearings from general knowledge of the area, procedural side streets and buildings) used
so the pipeline and the prototype can be developed and tested offline. Replace it with
real data:   fetch_osm.py --bbox ...   then   osm_to_game.py (see docs/SETUP.md).

Every element carries tag  approx=yes.
"""
import json, math, random, sys

R = random.Random(7)
LAT0, LON0 = 12.9569, 77.7011   # approx. Marathahalli Bridge junction
KX, KY = 111320.0 * math.cos(math.radians(LAT0)), 110574.0


def ll(x, y):
    return LAT0 + y / KY, LON0 + x / KX


_nodes, _by_key = {}, {}
_next = [1000]


def node(x, y):
    k = (round(x, 1), round(y, 1))
    if k not in _by_key:
        _next[0] += 1
        _by_key[k] = _next[0]
        _nodes[_next[0]] = (x, y)
    return _by_key[k]


def resample(poly, step):
    out = [poly[0]]
    for a, b in zip(poly, poly[1:]):
        d = math.dist(a, b); n = max(1, round(d / step))
        for i in range(1, n + 1):
            out.append((a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n))
    return out


ways = []  # dict(name, hw, lanes, pts[(x,y)], extra)


def add_way(name, hw, lanes, pts, **tags):
    ways.append({"name": name, "hw": hw, "lanes": lanes, "pts": list(pts), "tags": tags})


# ---- arterials (control points in metres from the junction; x east, y north)
ART = {}
ART["ORR"] = ("Outer Ring Road", "trunk", 6, resample([(-342, -940), (-250, -620), (-120, -300), (0, 0), (60, 300), (130, 700), (229, 1076)], 20))
ART["OAR"] = ("Old Airport Road", "primary", 4, resample([(-1000, -60), (-500, -35), (-120, -8), (0, 0)], 20))
ART["VAR"] = ("Varthur Road", "primary", 4, resample([(0, 0), (250, -40), (600, -120), (900, -230)], 20))
ART["ITPL"] = ("ITPL Main Road", "primary", 4, resample([(-450, 300), (0, 330), (260, 440), (600, 530), (900, 600)], 20))
for k, (nm, hw, ln, pts) in ART.items():
    add_way(nm, hw, ln, pts)
art_pts = [p for (_, _, _, pts) in ART.values() for p in pts]


def dist_art(x, y):
    return min(math.hypot(x - a, y - b) for a, b in art_pts)


# ---- residential lattice, dropped near arterials
XS = list(range(-880, 881, 110)); YS = list(range(-990, 1100, 110))
kept = {(i, j) for i, x in enumerate(XS) for j, y in enumerate(YS) if dist_art(x, y) > 62}
for j, y in enumerate(YS):  # rows -> "Nth Cross"
    seg = []
    for i, x in enumerate(XS):
        if (i, j) in kept:
            seg.append((x, y))
        else:
            if len(seg) >= 2: add_way(f"{j+1}th Cross", "residential", 2, seg)
            seg = []
    if len(seg) >= 2: add_way(f"{j+1}th Cross", "residential", 2, seg)
for i, x in enumerate(XS):  # columns -> "Nth Main"
    seg = []
    for j, y in enumerate(YS):
        if (i, j) in kept:
            seg.append((x, y))
        else:
            if len(seg) >= 2: add_way(f"{i+1}th Main Road", "tertiary" if i % 3 == 0 else "residential", 2, seg)
            seg = []
    if len(seg) >= 2: add_way(f"{i+1}th Main Road", "tertiary" if i % 3 == 0 else "residential", 2, seg)
# connectors from lattice edge nodes to nearest arterial vertex
used = set()
for (i, j) in sorted(kept):
    x, y = XS[i], YS[j]
    nb = [(i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)]
    if all(n in kept for n in nb if 0 <= n[0] < len(XS) and 0 <= n[1] < len(YS)):
        continue  # interior node: no missing neighbour, no connector needed
    best = min(art_pts, key=lambda p: math.hypot(x - p[0], y - p[1]))
    if math.hypot(x - best[0], y - best[1]) < 170 and best not in used:
        used.add(best)
        add_way("Link Road", "residential", 2, [(x, y), best])

# ---- noding: insert shared nodes where ways cross
def seg_int(p1, p2, p3, p4):
    d = (p2[0]-p1[0])*(p4[1]-p3[1]) - (p2[1]-p1[1])*(p4[0]-p3[0])
    if abs(d) < 1e-9: return None
    t = ((p3[0]-p1[0])*(p4[1]-p3[1]) - (p3[1]-p1[1])*(p4[0]-p3[0])) / d
    u = ((p3[0]-p1[0])*(p2[1]-p1[1]) - (p3[1]-p1[1])*(p2[0]-p1[0])) / d
    if 0.001 < t < 0.999 and 0.001 < u < 0.999:
        return t, u, (p1[0]+t*(p2[0]-p1[0]), p1[1]+t*(p2[1]-p1[1]))
    return None


inserts = {}  # (way_idx, seg_idx) -> [(t, (x,y))]
segs = [(wi, si, w["pts"][si], w["pts"][si+1]) for wi, w in enumerate(ways) for si in range(len(w["pts"]) - 1)]
for a in range(len(segs)):
    wa, sa, a1, a2 = segs[a]
    for b in range(a + 1, len(segs)):
        wb, sb, b1, b2 = segs[b]
        if wa == wb: continue
        if max(a1[0], a2[0]) < min(b1[0], b2[0]) or max(b1[0], b2[0]) < min(a1[0], a2[0]): continue
        if max(a1[1], a2[1]) < min(b1[1], b2[1]) or max(b1[1], b2[1]) < min(a1[1], a2[1]): continue
        r = seg_int(a1, a2, b1, b2)
        if r:
            t, u, p = r
            inserts.setdefault((wa, sa), []).append((t, p)); inserts.setdefault((wb, sb), []).append((u, p))
for wi, w in enumerate(ways):
    new = []
    for si in range(len(w["pts"]) - 1):
        new.append(w["pts"][si])
        for t, p in sorted(inserts.get((wi, si), [])):
            new.append(p)
    new.append(w["pts"][-1]); w["pts"] = new

# ---- buildings
bld = []  # (ring, levels, name, kind)
all_segs = [(w["pts"][i], w["pts"][i+1]) for w in ways for i in range(len(w["pts"]) - 1)]


def dist_roads(x, y):
    best = 1e9
    for (a, b) in all_segs:
        dx, dy = b[0]-a[0], b[1]-a[1]; L = dx*dx+dy*dy
        t = 0 if L == 0 else max(0, min(1, ((x-a[0])*dx + (y-a[1])*dy) / L))
        best = min(best, math.hypot(x-(a[0]+t*dx), y-(a[1]+t*dy)))
    return best


def rect(cx, cy, w, d, ang):
    c, s = math.cos(ang), math.sin(ang)
    return [(cx + c*px - s*py, cy + s*px + c*py) for px, py in ((-w/2, -d/2), (w/2, -d/2), (w/2, d/2), (-w/2, d/2))]


parks = []
for i in range(len(XS) - 1):
    for j in range(len(YS) - 1):
        if not all(c in kept for c in ((i, j), (i+1, j), (i, j+1), (i+1, j+1))): continue
        x0, y0 = XS[i], YS[j]
        if (i * 7 + j * 3) % 17 == 0:
            parks.append([(x0+14, y0+14), (x0+96, y0+14), (x0+96, y0+96), (x0+14, y0+96), (x0+14, y0+14)]); continue
        tech = (i + j) % 11 == 0
        for px in (0, 1):
            for py in (0, 1):
                cx, cy = x0 + 33 + px * 44, y0 + 33 + py * 44
                if tech and px == 0 and py == 0:
                    bld.append((rect(x0 + 55, y0 + 55, 70, 70, 0), R.randint(8, 12), "Tech Park (approx.)", "office")); break
                if tech: continue
                bld.append((rect(cx, cy, R.uniform(24, 34), R.uniform(24, 34), 0), R.choice([3, 4, 4, 5, 6, 7]), "", "res"))
        # tech: single big building handled above
# arterial frontage
for k, (nm, hw, ln, pts) in ART.items():
    d = 0
    for a, b in zip(pts, pts[1:]):
        seglen = math.dist(a, b); ang = math.atan2(b[1]-a[1], b[0]-a[0])
        d += seglen
        if int(d // 36) == int((d - seglen) // 36): continue
        for side in (1, -1):
            off = ln * 3.3 / 2 + 16 + R.uniform(0, 5)
            cx, cy = a[0] - math.sin(ang) * off * side, a[1] + math.cos(ang) * off * side
            w, dp = R.uniform(26, 34), R.uniform(16, 22)
            if dist_roads(cx, cy) < ln * 1.65 + 14: continue
            if any(math.hypot(cx - sum(p[0] for p in r[0])/4, cy - sum(p[1] for p in r[0])/4) < 28 for r in bld[-40:]): continue
            bld.append((rect(cx, cy, w, dp, ang), R.choice([4, 5, 6, 8, 10, 12]), "", "office"))
# drop buildings overlapping any road
bld = [b for b in bld if all(dist_roads(sum(p[0] for p in b[0])/4, sum(p[1] for p in b[0])/4) > 16 for _ in [0])]

# ---- assemble Overpass-like JSON
els = []
for w in ways:
    ids = [node(*p) for p in w["pts"]]
    geom = [dict(zip(("lat", "lon"), ll(*p))) for p in w["pts"]]
    els.append({"type": "way", "id": 5000000 + len(els), "nodes": ids, "geometry": geom,
                "tags": {"highway": w["hw"], "name": w["name"], "lanes": str(w["lanes"]), "approx": "yes"}})
for ring, lv, nm, kind in bld:
    r = ring + [ring[0]]
    t = {"building": "commercial" if kind == "office" else "apartments", "building:levels": str(lv), "approx": "yes"}
    if nm: t["name"] = nm
    els.append({"type": "way", "id": 7000000 + len(els), "nodes": [node(*p) for p in r],
                "geometry": [dict(zip(("lat", "lon"), ll(*p))) for p in r], "tags": t})
for pk in parks:
    els.append({"type": "way", "id": 8000000 + len(els), "nodes": [], "tags": {"leisure": "park", "approx": "yes"},
                "geometry": [dict(zip(("lat", "lon"), ll(*p))) for p in pk]})


def near_node(x, y):
    nid = min(_nodes, key=lambda n: math.hypot(_nodes[n][0] - x, _nodes[n][1] - y)); return nid, _nodes[nid]


_way_nodes = {w["name"]: set(node(*p) for p in w["pts"]) for w in ways if w["name"] in ("Outer Ring Road", "ITPL Main Road")}
_cross = sorted(_way_nodes["Outer Ring Road"] & _way_nodes["ITPL Main Road"])  # shared node(s) = the real crossing
assert len(_cross) == 1, _cross
for nid in (near_node(0, 0)[0], _cross[0]):  # J0 and ITPL x ORR crossing ("Kundalahalli Gate" approx.)
    nx, ny = _nodes[nid]
    els.append({"type": "node", "id": nid, "lat": ll(nx, ny)[0], "lon": ll(nx, ny)[1], "tags": {"highway": "traffic_signals", "approx": "yes"}})
POIS = [  # name, tag key, tag value, x, y   -- positions approximate, for gameplay only
    ("Marathahalli Bridge", "amenity", "bus_station", 40, -30),
    ("Innovative Multiplex (approx.)", "amenity", "cinema", -330, -60),
    ("Kundalahalli Gate (approx.)", "amenity", "bus_station", 40, 320),
    ("HP Petrol Pump (approx.)", "amenity", "fuel", -170, 38),
    ("Sakra World Hospital (approx.)", "amenity", "hospital", -280, -820),
    ("Spice Garden (approx.)", "amenity", "cafe", -500, 560),
    ("Doddanekundi Cafe (approx.)", "amenity", "cafe", 620, -150),
    ("AECS Layout Bus Stop (approx.)", "amenity", "taxi", -420, 320),
    ("Munnekollal Junction (approx.)", "amenity", "bus_station", 560, 500),
    ("Marathahalli Market (approx.)", "amenity", "restaurant", -700, -60),
]
for i, (nm, k, v, x, y) in enumerate(POIS):
    la, lo = ll(x, y)
    els.append({"type": "node", "id": 9000000 + i, "lat": la, "lon": lo, "tags": {"name": nm, k: v, "approx": "yes"}})
for i, (x, y) in enumerate([(-200, 6), (80, -300), (-60, 150), (120, 600), (500, -110), (-600, -50)]):
    la, lo = ll(x, y)
    els.append({"type": "node", "id": 9100 + i, "lat": la, "lon": lo, "tags": {"highway": "bus_stop", "name": "Bus stop", "approx": "yes"}})

out = sys.argv[1] if len(sys.argv) > 1 else "fixtures/marathahalli_approx.osm.json"
json.dump({"version": 0.6, "generator": "make_fixture.py (APPROXIMATE, NOT OSM)", "elements": els}, open(out, "w"))
print(f"{out}: ways={len(ways)} buildings={len(bld)} parks={len(parks)} elements={len(els)}")
