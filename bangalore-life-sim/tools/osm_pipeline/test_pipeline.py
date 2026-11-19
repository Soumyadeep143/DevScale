import json, math, os, sys, unittest
sys.path.insert(0, os.path.dirname(__file__))
import osm_to_game as C

LAT0, LON0 = 12.9569, 77.7011


def way(i, nodes, pts, **tags):
    return {"type": "way", "id": i, "nodes": nodes, "geometry": [{"lat": a, "lon": b} for a, b in pts], "tags": tags}


class T(unittest.TestCase):
    def test_projection_distances(self):
        p = C.make_projector(LAT0, LON0)
        x, y = p(LAT0 + 0.001, LON0)
        self.assertAlmostEqual(y, 110.574, delta=0.01)         # 0.001 deg lat ~ 110.6 m
        self.assertAlmostEqual(x, 0, delta=1e-6)
        x, y = p(LAT0, LON0 + 0.001)
        self.assertAlmostEqual(x, 111.32 * math.cos(math.radians(LAT0)), delta=0.01)
        # Marathahalli -> Koramangala (approx 12.9352, 77.6245): haversine vs our local projection within 0.5 % at ~5.5 km
        la, lo = 12.9352, 77.6245
        x, y = p(la, lo); d_proj = math.hypot(x, y)
        R = 6371008.8; dphi = math.radians(la - LAT0); dl = math.radians(lo - LON0)
        a = math.sin(dphi / 2) ** 2 + math.cos(math.radians(LAT0)) * math.cos(math.radians(la)) * math.sin(dl / 2) ** 2
        d_hav = 2 * R * math.asin(math.sqrt(a))
        self.assertLess(abs(d_proj - d_hav) / d_hav, 0.005)

    def _t_junction(self):
        # two ways sharing node 2: A: 1-2-3 (east-west), B: 2-4 (north)
        return {"elements": [
            way(10, [1, 2, 3], [(LAT0, LON0 - .001), (LAT0, LON0), (LAT0, LON0 + .001)], highway="primary", lanes="4", name="A"),
            way(11, [2, 4], [(LAT0, LON0), (LAT0 + .001, LON0)], highway="residential", oneway="yes", name="B"),
            {"type": "node", "id": 2, "lat": LAT0, "lon": LON0, "tags": {"highway": "traffic_signals"}},
        ]}

    def test_graph_splits_at_shared_nodes_and_marks_signals(self):
        out = C.convert(self._t_junction(), origin={"lat": LAT0, "lon": LON0})
        g = out["graph"]
        self.assertEqual(len(g["nodes"]), 4)                    # 1,2,3,4
        self.assertEqual(len(g["edges"]), 3)                    # A split in two + B
        self.assertEqual(sum(1 for n in g["nodes"] if n["sig"]), 1)
        self.assertEqual(out["signals"], [i for i, n in enumerate(g["nodes"]) if n["sig"]])
        self.assertEqual(sorted(e["oneway"] for e in g["edges"]), [False, False, True])

    def test_road_attributes(self):
        r = C.convert(self._t_junction(), origin={"lat": LAT0, "lon": LON0})["roads"]
        a = next(x for x in r if x["name"] == "A")
        self.assertEqual((a["lanes"], a["speed"], a["width"]), (4, 50, 13.2))
        b = next(x for x in r if x["name"] == "B")
        self.assertTrue(b["oneway"]); self.assertEqual(b["lanes"], 2)

    def test_building_height_orientation_and_defaults(self):
        sq = [(LAT0, LON0), (LAT0, LON0 + .0002), (LAT0 + .0002, LON0 + .0002), (LAT0 + .0002, LON0), (LAT0, LON0)]
        cw = list(reversed(sq))                                 # clockwise input must be normalised to CCW
        osm = {"elements": [way(1, [], sq, building="yes", **{"building:levels": "5"}), way(2, [], cw, building="yes", height="30 m"), way(3, [], sq, building="yes")]}
        b = {x["id"]: x for x in C.convert(osm, origin={"lat": LAT0, "lon": LON0})["buildings"]}
        self.assertAlmostEqual(b[1]["h"], 17.0); self.assertAlmostEqual(b[2]["h"], 30.0); self.assertAlmostEqual(b[3]["h"], 9.0)
        for x in b.values():
            self.assertGreater(C.signed_area(x["pts"]), 0)
            self.assertEqual(len(x["pts"]), 4)                  # closing vertex removed

    def test_oneway_minus_one_reverses_geometry(self):
        osm = {"elements": [way(5, [1, 2], [(LAT0, LON0), (LAT0, LON0 + .001)], highway="tertiary", oneway="-1")]}
        r = C.convert(osm, origin={"lat": LAT0, "lon": LON0})["roads"][0]
        self.assertTrue(r["oneway"]); self.assertGreater(r["pts"][0][0], r["pts"][-1][0])

    def test_shipped_tile_is_consistent(self):
        p = os.path.join(os.path.dirname(__file__), "../../prototype/data/marathahalli.json")
        d = json.load(open(p)); n = len(d["graph"]["nodes"])
        self.assertTrue(d["meta"]["approximate"])               # stand-in must stay labelled
        for e in d["graph"]["edges"]:
            self.assertTrue(0 <= e["a"] < n and 0 <= e["b"] < n and e["len"] > 0)
        self.assertTrue(all(C.signed_area(b["pts"]) > 0 for b in d["buildings"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
