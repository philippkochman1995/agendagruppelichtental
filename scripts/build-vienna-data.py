"""Builds public/iso/vienna.json: a light, city-wide backdrop for the intro flight of the 3D map
(Stadt Wien open data, CC BY 4.0): city boundary, district outlines, building blocks, water, green land,
main roads and the 3D buildings around Stephansplatz.

Usage: python3 scripts/build-vienna-data.py <folder with the WFS downloads>
Expected files: landesgrenze.json, bezirke.json, baubloecke.json, realnut.json (REALNUT2024 without building land),
mainroads.json (STRASSENGRAPH with FRC <= 2), stephan.json (FMZKBKM around Stephansplatz).
Coordinates are metres relative to the Grätzl centre (x = east, y = north), like graetzl.json.
"""
import json, math, sys

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else 'public/iso/vienna.json'
LON0, LAT0 = 16.358175, 48.227104
KX = math.cos(math.radians(LAT0)) * 111320.0
KY = 110540.0
# the detailed Grätzl data (graetzl.json) covers this box; the city backdrop leaves it out
DETAIL = (-400, -480, 440, 550)
STEPHANSDOM = ((16.37250 - LON0) * KX, (48.20847 - LAT0) * KY)

def xy(c, digits=0):
    x, y = (c[0] - LON0) * KX, (c[1] - LAT0) * KY
    return [round(x, digits), round(y, digits)] if digits else [int(round(x)), int(round(y))]

def load(name):
    return json.load(open(f'{src}/{name}.json'))['features']

def polys(geom):
    return [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']

def area(ring):
    return abs(sum(ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1] for i in range(len(ring)))) / 2

def simplify(points, tolerance, closed=True):
    if len(points) < 4:
        return points
    def dp(pts):
        if len(pts) < 3:
            return pts
        (ax, ay), (bx, by) = pts[0], pts[-1]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy) or 1e-9
        best, index = 0.0, 0
        for i in range(1, len(pts) - 1):
            d = abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / length
            if d > best:
                best, index = d, i
        if best <= tolerance:
            return [pts[0], pts[-1]]
        return dp(pts[:index + 1])[:-1] + dp(pts[index:])
    if not closed:
        return dp(points)
    far = max(range(len(points)), key=lambda i: math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]))
    result = dp(points[:far + 1])[:-1] + dp(points[far:])
    return result if len(result) >= 4 else points

def in_detail(ring):
    cx = sum(p[0] for p in ring) / len(ring)
    cy = sum(p[1] for p in ring) / len(ring)
    return DETAIL[0] < cx < DETAIL[2] and DETAIL[1] < cy < DETAIL[3]

def area_layer(features, tolerance, min_area, keep=lambda props: True):
    result = []
    for f in features:
        if not f['geometry'] or not keep(f['properties']):
            continue
        for poly in polys(f['geometry']):
            rings = [simplify([xy(c) for c in ring], tolerance) for ring in poly]
            if area(rings[0]) < min_area or in_detail(rings[0]):
                continue
            result.append([rings[0]] + [r for r in rings[1:] if area(r) > min_area])
    return result

data = {}
boundary = polys(load('landesgrenze')[0]['geometry'])[0][0]
data['boundary'] = simplify([xy(c) for c in boundary], 20)
def label_point(ring):
    # area-weighted centroid of the outline
    a = cx = cy = 0.0
    for i in range(len(ring)):
        x0, y0 = ring[i - 1]
        x1, y1 = ring[i]
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    return [int(cx / (3 * a)), int(cy / (3 * a))] if a else ring[0]

data['districts'] = []
for f in load('bezirke'):
    ring = simplify([xy(c) for c in polys(f['geometry'])[0][0]], 15)
    data['districts'].append({'n': f['properties']['NAMEK'], 'b': f['properties']['BEZNR'], 'r': ring, 'c': label_point(ring)})
data['blocks'] = area_layer(load('baubloecke'), 5, 250)
realnut = load('realnut')
data['water'] = area_layer(realnut, 6, 400, lambda p: p.get('LEV2') == 'Gewässer')
data['green'] = area_layer(realnut, 8, 1500, lambda p: p.get('LEV2') in ('Naturraum', 'Erholungs- u. Freizeiteinrichtungen'))
data['fields'] = area_layer(realnut, 12, 4000, lambda p: p.get('LEV2') == 'Landwirtschaft')
data['roads'] = []
for f in load('mainroads'):
    if f['geometry'] and f['geometry']['type'] == 'LineString':
        line = simplify([xy(c) for c in f['geometry']['coordinates']], 5, closed=False)
        data['roads'].append({'w': 1 if (f['properties'].get('FRC') or 2) <= 1 else 0, 'l': line})

# 3D buildings around Stephansplatz, with real heights (roof top minus terrain, both above Wiener Null)
data['stephan'] = []
for f in load('stephan'):
    p = f['properties']
    if p['LAYER'] != 'Gebäude' or p.get('O_KOTE') is None or p.get('HOEHE_DGM') is None:
        continue
    height = p['O_KOTE'] - p['HOEHE_DGM']
    if height < 2.5:
        continue
    for poly in polys(f['geometry']):
        rings = [simplify([xy(c, 1) for c in ring], 0.6) for ring in poly]
        if area(rings[0]) < 8:
            continue
        cx = sum(q[0] for q in rings[0]) / len(rings[0])
        cy = sum(q[1] for q in rings[0]) / len(rings[0])
        dom = math.hypot(cx - STEPHANSDOM[0], cy - STEPHANSDOM[1]) < 75
        data['stephan'].append({'p': rings, 'h': round(height, 1), 'd': 1 if dom else 0})
data['stephansdom'] = [round(STEPHANSDOM[0], 1), round(STEPHANSDOM[1], 1)]
data['attribution'] = 'Datenquelle: Stadt Wien – data.wien.gv.at (CC BY 4.0)'

json.dump(data, open(out, 'w'), separators=(',', ':'))
print({k: len(v) for k, v in data.items() if isinstance(v, list)})
