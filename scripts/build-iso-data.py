"""Builds public/iso/graetzl.json for the isometric 3D view from Stadt Wien open data (CC BY 4.0).

Input: WFS GeoJSON downloads (FMZKBKMOGD buildings, BAUMKATOGD trees, FMZKVERKEHR1OGD traffic areas,
FMZKGRUEN2OGD green areas, FMZKGEWOGD water, STRASSENGRAPHOGD street axes with names, baubloecke = BAUBLOCKOGD building blocks)
in the folder given as first argument.
Output coordinates are metres relative to the Grätzl centre: x = east, y = north.
"""
import json, math, re, sys

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else 'public/iso/graetzl.json'
LON0, LAT0 = 16.358175, 48.227104
KX = math.cos(math.radians(LAT0)) * 111320.0
KY = 110540.0

def xy(c):
    return [round((c[0] - LON0) * KX, 1), round((c[1] - LAT0) * KY, 1)]

def rings(geom):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    return [[[xy(c) for c in ring] for ring in poly] for poly in polys]

def load(name):
    return json.load(open(f'{src}/{name}.json'))['features']

data = {'buildings': [], 'trees': [], 'roads': [], 'zebra': [], 'green': [], 'sport': [], 'water': [], 'streets': []}

def area(ring):
    return abs(sum(ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1] for i in range(len(ring)))) / 2

def simplify(ring, tolerance):
    """Douglas-Peucker on a closed ring: removes small jogs and steps from the facade outline"""
    if len(ring) < 5:
        return ring
    def dp(points):
        if len(points) < 3:
            return points
        (ax, ay), (bx, by) = points[0], points[-1]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy) or 1e-9
        best, index = 0.0, 0
        for i in range(1, len(points) - 1):
            px, py = points[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / length
            if d > best:
                best, index = d, i
        if best <= tolerance:
            return [points[0], points[-1]]
        return dp(points[:index + 1])[:-1] + dp(points[index:])
    # split the ring at its farthest point so both halves are open polylines
    start = ring[0]
    far = max(range(len(ring)), key=lambda i: math.hypot(ring[i][0] - start[0], ring[i][1] - start[1]))
    out = dp(ring[:far + 1])[:-1] + dp(ring[far:])
    return out if len(out) >= 4 else ring

# Buildings, simplified like the footprints on a web map: only real buildings (no canopies, portals, kiosks),
# tiny parts dropped, outlines smoothed, and one height per building (area-weighted) instead of every roof step.
parts = []
for f in load('FMZKBKMOGD'):
    p = f['properties']
    # O_KOTE (roof top) and HOEHE_DGM (terrain) are both heights above "Wiener Null"; the difference is the building height
    if p['LAYER'] != 'Gebäude' or p.get('O_KOTE') is None or p.get('HOEHE_DGM') is None:
        continue
    top = p['O_KOTE'] - p['HOEHE_DGM']
    if top < 2.5:
        continue
    for poly in rings(f['geometry']):
        if area(poly[0]) < 20:
            continue
        parts.append((p.get('BW_GEB_ID') or p['FMZK_ID'], top, poly))
heights = {}
for gid, top, poly in parts:
    a = area(poly[0])
    total, weight = heights.get(gid, (0.0, 0.0))
    heights[gid] = (total + top * a, weight + a)
for gid, top, poly in parts:
    total, weight = heights[gid]
    simplified = [simplify(ring, 1.2) for ring in poly]
    simplified = [simplified[0]] + [ring for ring in simplified[1:] if area(ring) > 30]
    data['buildings'].append({'p': simplified, 'b': 0, 'h': round(total / weight), 'k': 'b', 'g': gid % 100000})

for f in load('BAUMKATOGD'):
    p = f['properties']
    crown = (p.get('KRONENDURCHMESSER') or 1) * 3.0
    height = (p.get('BAUMHOEHE') or 1) * 5.0
    data['trees'].append(xy(f['geometry']['coordinates']) + [round(crown, 1), round(height, 1)])

for f in load('FMZKVERKEHR1OGD'):
    layer = f['properties']['LAYER']
    key = {'Fahrbahn': 'roads', 'Ruhender Verkehr': 'roads', 'Fahrbahnschwelle': 'roads', 'Zebrastreifen': 'zebra'}.get(layer)
    if key:
        data[key].extend(rings(f['geometry']))

for f in load('FMZKGRUEN2OGD'):
    layer = f['properties']['LAYER']
    key = 'sport' if layer == 'Sportfeld' else 'green' if layer in ('Grünfläche', 'Sonstige Grünfläche', 'Wiese') else None
    if key:
        data[key].extend(rings(f['geometry']))

for f in load('FMZKGEWOGD'):
    data['water'].extend(rings(f['geometry']))

# street axes with their names (for labels)
for f in load('STRASSENGRAPHOGD'):
    name = f['properties'].get('FEATURENAME')
    if name and f['geometry']['type'] == 'LineString':
        data['streets'].append({'n': name, 'l': [xy(c) for c in f['geometry']['coordinates']]})

cfg = open('src/mapConfig.ts').read()
i = cfg.index('focusAreaRing')
data['focus'] = [xy([float(a), float(b)]) for a, b in re.findall(r'\[(16\.\d+),\s*(48\.\d+)\]', cfg[i:])]

# --- areas of the Grätzl (for the start view): the building blocks inside the Grätzl grouped into five compact
# areas, each named after the streets that run through it (the border streets around the Grätzl are left out)
def inside_ring(ring, x, y):
    result = False
    j = len(ring) - 1
    for k in range(len(ring)):
        xi, yi = ring[k]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            result = not result
        j = k
    return result

def distance_to_ring(ring, x, y):
    best = 1e9
    for k in range(1, len(ring)):
        (ax, ay), (bx, by) = ring[k - 1], ring[k]
        dx, dy = bx - ax, by - ay
        t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy or 1)))
        best = min(best, math.hypot(ax + t * dx - x, ay + t * dy - y))
    return best

focus = data['focus']
blocks = []
for f in load('baubloecke'):
    for poly in rings(f['geometry']):
        ring = poly[0]
        cx = sum(p[0] for p in ring) / len(ring)
        cy = sum(p[1] for p in ring) / len(ring)
        if inside_ring(focus, cx, cy):
            blocks.append({'r': ring, 'c': (cx, cy)})
# blocks around the Grätzl (inside the detail box, outside the Grätzl): drawn as calm flat areas instead of every building
DETAIL = (-400, -480, 440, 550)
data['outsideBlocks'] = []
for f in load('baubloecke'):
    for poly in rings(f['geometry']):
        ring = poly[0]
        cx = sum(p[0] for p in ring) / len(ring)
        cy = sum(p[1] for p in ring) / len(ring)
        if DETAIL[0] - 150 < cx < DETAIL[2] + 150 and DETAIL[1] - 150 < cy < DETAIL[3] + 150 and not inside_ring(focus, cx, cy):
            data['outsideBlocks'].append([ring])

ZONES = 5
points = [b['c'] for b in blocks]
centres = [max(points, key=lambda p: p[1])]
while len(centres) < ZONES:
    centres.append(max(points, key=lambda p: min(math.dist(p, c) for c in centres)))
for _ in range(40):
    groups = [[] for _ in centres]
    for p in points:
        groups[min(range(ZONES), key=lambda k: math.dist(p, centres[k]))].append(p)
    centres = [(sum(q[0] for q in g) / len(g), sum(q[1] for q in g) / len(g)) if g else centres[k] for k, g in enumerate(groups)]
zone_of = [min(range(ZONES), key=lambda k: math.dist(b['c'], centres[k])) for b in blocks]
BORDER_STREETS = {'Liechtensteinstraße', 'Althanstraße', 'Alserbachstraße', 'Julius-Tandler-Platz'}
lengths = [dict() for _ in range(ZONES)]
totals = {}
for f in load('STRASSENGRAPHOGD'):
    name = f['properties'].get('FEATURENAME')
    if not name or name in BORDER_STREETS or f['geometry']['type'] != 'LineString':
        continue
    line = [xy(c) for c in f['geometry']['coordinates']]
    for k in range(1, len(line)):
        mx, my = (line[k][0] + line[k - 1][0]) / 2, (line[k][1] + line[k - 1][1]) / 2
        if not inside_ring(focus, mx, my) and distance_to_ring(focus, mx, my) > 12:
            continue
        nearest = min(range(len(blocks)), key=lambda j: distance_to_ring(blocks[j]['r'], mx, my))
        length = math.dist(line[k], line[k - 1])
        zone = zone_of[nearest]
        lengths[zone][name] = lengths[zone].get(name, 0) + length
        totals[name] = totals.get(name, 0) + length
data['zones'] = []
for zone in range(ZONES):
    ranked = sorted(((length * length / totals[name], name) for name, length in lengths[zone].items()), reverse=True)
    names = [ranked[0][1]] + [name for score, name in ranked[1:2] if score >= ranked[0][0] * 0.35]
    data['zones'].append({
        'n': ' & '.join(names),
        'c': [round(centres[zone][0], 1), round(centres[zone][1], 1)],
        'b': [b['r'] for b, z in zip(blocks, zone_of) if z == zone],
    })
print('zones', [z['n'] for z in data['zones']])
data['attribution'] = 'Datenquelle: Stadt Wien – data.wien.gv.at (CC BY 4.0)'

json.dump(data, open(out, 'w'), separators=(',', ':'))
print({k: len(v) for k, v in data.items() if isinstance(v, list)})
