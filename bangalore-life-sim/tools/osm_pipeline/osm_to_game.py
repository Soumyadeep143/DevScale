#!/usr/bin/env python3
"""Convert an Overpass JSON response (produced with `out geom`) into a game tile.

Output schema (units: metres, x = east, y = north, local to meta.origin):
{
  meta:  {origin:{lat,lon}, source, approximate, bbox_m:[minx,miny,maxx,maxy], attribution},
  roads: [{id, name, hw, oneway, lanes, width, speed, pts:[[x,y]..]}],
  graph: {nodes:[{x,y,sig}], edges:[{a,b,road,oneway,len,pts:[[x,y]..]}]},   # a,b index nodes
  buildings: [{id, name, h, kind, pts:[[x,y]..]}],                            # open ring, CCW
  parks: [{pts}],
  pois: [{name, kind, x, y}],
  signals: [nodeIndex..]
}
The same converter is used for the real Overpass data and for the stand-in fixture,
so everything downstream (prototype today, UE import tomorrow) sees one format.
"""
import argparse, json, math, sys
from collections import defaultdict

HW_DEFAULTS = {  # highway -> (lanes, speed km/h)
    "motorway": (4, 80), "trunk": (3, 60), "primary": (3, 50), "secondary": (2, 40),
    "tertiary": (2, 35), "unclassified": (2, 30), "residential": (2, 25),
    "service": (1, 15), "living_street": (1, 15),
}
LANE_W = 3.3


def make_projector(lat0, lon0):
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110574.0
    return lambda lat, lon: ((lon - lon0) * kx, (lat - lat0) * ky)


def parse_int(v, default):
    try:
        return int(str(v).split(";")[0])
    except (TypeError, ValueError):
        return default


def signed_area(p):
    return 0.5 * sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))


def building_height(tags):
    h = tags.get("height")
    if h:
        try:
            return float(str(h).split()[0])
        except ValueError:
            pass
    lv = tags.get("building:levels")
    if lv:
        return parse_int(lv, 3) * 3.2 + 1.0
    # untagged OSM buildings are common in Bangalore: default to a low-rise block
    return 9.0


def convert(osm, origin=None, source="overpass", approximate=False):
    els = osm["elements"]
    if origin is None:
        lats, lons = [], []
        for e in els:
            for g in e.get("geometry", []) or []:
                lats.append(g["lat"]); lons.append(g["lon"])
            if e["type"] == "node":
                lats.append(e["lat"]); lons.append(e["lon"])
        origin = {"lat": (min(lats) + max(lats)) / 2, "lon": (min(lons) + max(lons)) / 2}
    proj = make_projector(origin["lat"], origin["lon"])

    roads, buildings, parks, pois = [], [], [], []
    signal_coords = set()
    node_xy = {}

    for e in els:
        t = e.get("tags", {})
        if e["type"] == "node":
            x, y = proj(e["lat"], e["lon"])
            hw = t.get("highway")
            if hw == "traffic_signals":
                signal_coords.add(e["id"]); node_xy[e["id"]] = (x, y)
            elif t.get("name") and (t.get("amenity") or t.get("railway") or t.get("shop")):
                pois.append({"name": t["name"], "kind": t.get("amenity") or t.get("railway") or "shop",
                             "x": round(x, 2), "y": round(y, 2), **({"approx": True} if t.get("approx") else {})})
            elif hw == "bus_stop":
                pois.append({"name": t.get("name", "Bus stop"), "kind": "bus_stop", "x": round(x, 2), "y": round(y, 2)})
            elif t.get("amenity") == "fuel":
                pois.append({"name": t.get("name", "Petrol pump"), "kind": "fuel", "x": round(x, 2), "y": round(y, 2)})
            continue
        if e["type"] != "way" or not e.get("geometry"):
            continue
        pts = [proj(g["lat"], g["lon"]) for g in e["geometry"]]
        if "highway" in t and t["highway"] in HW_DEFAULTS:
            lanes_d, speed_d = HW_DEFAULTS[t["highway"]]
            lanes = parse_int(t.get("lanes"), lanes_d)
            oneway = t.get("oneway") in ("yes", "true", "1")
            if oneway is False and t.get("oneway") == "-1":
                pts.reverse(); oneway = True
            roads.append({"id": e["id"], "name": t.get("name", ""), "hw": t["highway"], "oneway": oneway,
                          "lanes": lanes, "width": round(lanes * LANE_W * (1 if oneway else 1), 1),
                          "speed": parse_int(t.get("maxspeed"), speed_d), "nodes": e.get("nodes", []),
                          "pts": [[round(x, 2), round(y, 2)] for x, y in pts]})
        elif "building" in t:
            if len(pts) < 4:
                continue
            ring = pts[:-1] if pts[0] == pts[-1] else pts
            if signed_area(ring) < 0:
                ring.reverse()
            kind = "res"
            if t.get("amenity") in ("hospital",) or t.get("building") in ("hospital",):
                kind = "hospital"
            elif t.get("building") in ("commercial", "office", "retail"):
                kind = "office"
            buildings.append({"id": e["id"], "name": t.get("name", ""), "h": round(building_height(t), 1), "kind": kind,
                              "pts": [[round(x, 2), round(y, 2)] for x, y in ring]})
        elif t.get("leisure") in ("park", "garden"):
            parks.append({"name": t.get("name", ""), "pts": [[round(x, 2), round(y, 2)] for x, y in pts]})

    graph = build_graph(roads, signal_coords, node_xy)
    # drop raw node id lists from output (kept only for graph building)
    for r in roads:
        r.pop("nodes", None)
    xs = [p[0] for r in roads for p in r["pts"]]; ys = [p[1] for r in roads for p in r["pts"]]
    return {
        "meta": {"origin": origin, "source": source, "approximate": approximate,
                 "bbox_m": [min(xs), min(ys), max(xs), max(ys)] if xs else [0, 0, 0, 0],
                 "attribution": "Map data (c) OpenStreetMap contributors, ODbL"},
        "roads": roads, "graph": graph, "buildings": buildings, "parks": parks, "pois": pois,
        "signals": [i for i, n in enumerate(graph["nodes"]) if n["sig"]],
    }


def build_graph(roads, signal_ids, signal_xy):
    """Split ways at junction nodes (shared by >=2 ways, way endpoints, signals)."""
    use = defaultdict(int)
    for r in roads:
        ns = r["nodes"]
        for i, n in enumerate(ns):
            use[n] += 2 if i in (0, len(ns) - 1) else 1
    key_index, nodes, edges = {}, [], []

    def get_node(nid, xy):
        if nid not in key_index:
            key_index[nid] = len(nodes)
            nodes.append({"x": xy[0], "y": xy[1], "sig": nid in signal_ids})
        return key_index[nid]

    for ri, r in enumerate(roads):
        ns, pts = r["nodes"], r["pts"]
        if len(ns) != len(pts):
            continue  # malformed way
        start = 0
        for i in range(1, len(ns)):
            if use[ns[i]] >= 2 or i == len(ns) - 1:
                seg = pts[start:i + 1]
                if len(seg) >= 2:
                    ln = sum(math.dist(seg[k], seg[k + 1]) for k in range(len(seg) - 1))
                    if ln > 0.5 and ns[start] != ns[i]:
                        a = get_node(ns[start], pts[start]); b = get_node(ns[i], pts[i])
                        edges.append({"a": a, "b": b, "road": ri, "oneway": r["oneway"],
                                      "len": round(ln, 2), "pts": seg})
                start = i
    return {"nodes": nodes, "edges": edges}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input"); ap.add_argument("output")
    ap.add_argument("--origin", help="lat,lon (default: bbox centre)")
    ap.add_argument("--approximate", action="store_true", help="mark tile as not real OSM data")
    a = ap.parse_args()
    origin = None
    if a.origin:
        lat, lon = map(float, a.origin.split(",")); origin = {"lat": lat, "lon": lon}
    with open(a.input) as f:
        osm = json.load(f)
    out = convert(osm, origin, source=a.input, approximate=a.approximate)
    with open(a.output, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    g = out["graph"]
    print(f"roads={len(out['roads'])} graph nodes={len(g['nodes'])} edges={len(g['edges'])} "
          f"buildings={len(out['buildings'])} pois={len(out['pois'])} signals={len(out['signals'])}", file=sys.stderr)


if __name__ == "__main__":
    main()
