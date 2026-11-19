#!/usr/bin/env python3
"""Download OpenStreetMap data for a bounding box from an Overpass API server.

Usage:
  python3 fetch_osm.py --bbox 12.940,77.685,12.975,77.725 --out marathahalli.osm.json

bbox order is south,west,north,east (Overpass order).
Data (c) OpenStreetMap contributors, ODbL 1.0 - keep attribution in anything you ship.
Be polite: public Overpass servers are rate limited. For big areas use a Geofabrik
Karnataka extract + osmium instead (see docs/ARCHITECTURE.md section 3).
"""
import argparse, json, sys, time, urllib.parse, urllib.request

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

QUERY = """[out:json][timeout:120];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]({bbox});
  way["building"]({bbox});
  way["leisure"~"^(park|garden)$"]({bbox});
  way["railway"~"^(subway|light_rail|rail)$"]({bbox});
  node["highway"~"^(traffic_signals|bus_stop|crossing)$"]({bbox});
  node["amenity"~"^(fuel|hospital|restaurant|cafe|cinema|bus_station|taxi)$"]({bbox});
  node["railway"="station"]({bbox});
  node["name"]["shop"="mall"]({bbox});
);
out geom;
"""


def fetch(bbox: str, retries: int = 4) -> dict:
    data = urllib.parse.urlencode({"data": QUERY.format(bbox=bbox)}).encode()
    last = None
    for attempt in range(retries):
        for url in MIRRORS:
            try:
                req = urllib.request.Request(url, data=data, headers={"User-Agent": "bangalore-life-sim-pipeline/0.1"})
                with urllib.request.urlopen(req, timeout=180) as r:
                    return json.load(r)
            except Exception as e:  # noqa: BLE001 - we retry on anything
                last = e
                print(f"[fetch] {url} failed: {e}", file=sys.stderr)
        time.sleep(5 * 2 ** attempt)
    raise SystemExit(f"all Overpass mirrors failed: {last}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", required=True, help="south,west,north,east")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    d = fetch(a.bbox)
    with open(a.out, "w") as f:
        json.dump(d, f)
    print(f"wrote {a.out}: {len(d.get('elements', []))} elements")
