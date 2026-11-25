// 3D map of the Grätzl rendered with three.js from Stadt Wien open data (buildings, street trees, traffic and
// green areas, see scripts/build-iso-data.py). Replaces the Mapbox map when MAP_ENGINE is 'iso'.
import * as THREE from 'three'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { introCamera, startCamera } from '../mapConfig'
import { markerUrl, QUOTE_COLOR, quoteMarkerUrl, UNICORN_BLUE, unicornMarkerUrl } from '../cleanMarkers'
import { getDemoDetail, kindText } from '../demoDetails'
import { streetPlans, type StreetPlan } from '../streetPlans'
import { planTiles } from '../planTiles'
import { trafficConcepts, type TrafficMode, type TrafficFlow } from '../traffic'
import { PLANNED_TREES } from './plannedTrees'
import { GarageScene, type GarageInput, type GarageStage } from './garageScene'
import type { CategoryId, GeoJsonFeatureCollection, MapCategory, MapLayer } from '../types'

type Ring = [number, number][]
type Poly = Ring[]
interface IsoData {
  /** g = building id: all parts of one building share height and roof colour */
  buildings: { p: Poly; b: number; h: number; k: string; g?: number }[]
  trees: [number, number, number, number][]
  roads: Poly[]
  zebra: Poly[]
  green: Poly[]
  sport: Poly[]
  water: Poly[]
  focus: Ring
  streets: { n: string; l: Ring }[]
  /** areas of the Grätzl: name, centre and building blocks */
  zones?: { n: string; c: [number, number]; b: Ring[] }[]
  /** building blocks around the Grätzl, drawn as calm flat areas */
  outsideBlocks?: Poly[]
}

interface ViennaData {
  boundary: Ring
  districts: { n: string; b: number; r: Ring; c: [number, number] }[]
  blocks: Poly[]
  water: Poly[]
  green: Poly[]
  fields: Poly[]
  roads: { w: number; l: Ring }[]
  stephan: { p: Poly; h: number; d: number }[]
  stephansdom: [number, number]
}

/** City backdrop colours: everything outside the Grätzl stays a soft, greyed-out Vienna */
const CITY = {
  land: '#fcfcf8',
  blocks: '#f7f2eb',
  water: '#a6cbe0',
  green: '#dcf0bc',
  fields: '#e7e8da',
  roads: '#fcfcf8',
  districts: '#b7ada0',
  boundary: '#9a8f82',
  buildings: '#ecebe8',
  dom: '#d6c7ad',
  flatBuildings: '#e2ded8',
}

export interface IsoView { x: number; z: number; distance: number; pitch: number; bearing: number }
export interface IsoFeature {
  layer: MapLayer
  category: MapCategory
  properties: Record<string, unknown>
  /** footprint of the feature on the ground (x, z), used to focus the camera on areas */
  bounds: THREE.Box3
  zoneName?: string
}
export interface IsoCallbacks {
  onFeatureClick(feature: IsoFeature): void
  onZoneClick?(zoneName: string): void
  onBackgroundClick(): void
  onAreaViewChange?(inArea: boolean): void
  /** Press and hold on the map: show the scanned workshop plans while held */
  onHoldPlans?(active: boolean): void
  /** Mapbox-equivalent zoom level of the camera (for overlays that fade with zoom) */
  onZoom?(zoom: number): void
}

// Friendly, sunny palette: warm paper ground, white streets, sand-coloured houses with peach roofs, juicy greens
// Colours matched to the Mapbox version of the map (warm daylight Standard style + its focus mask)
const COLORS = {
  background: '#f8f6f1',
  ground: '#f4f0e8',
  groundOutside: '#f8f6f1',
  road: '#fcfcf8',
  zebra: '#f3efe7',
  green: '#a2cf86',
  sport: '#c9e2b5',
  water: '#93cfe8',
  wallInside: '#ecc99b',
  wallOutside: '#f2e6d8',
  roofInside: '#f3dcb4',
  roofOutside: '#f6eee4',
  roofLine: '#d9b98f',
  accentWall: '#ffd23f',
  accentRoof: '#ffe066',
  trunk: '#a08a74',
}
/** how long you press on the map until the scanned plans show (ms) */
const HOLD_MS = 380
const TREE_GREENS = ['#7fbf68', '#8fca76', '#76b65f', '#9ad283']
/** Outside the Grätzl the map is washed out like under the Mapbox focus mask; parks and water keep a soft tint */
const OUTSIDE = { green: '#dcf0bc', water: '#a9d6ec', sport: '#e3eedb', trees: ['#cfe0c6', '#d6e5ce', '#c8dbbe'] }
/** Real heights, as in Mapbox */
const HEIGHT_SCALE = 1
const FOV = 36.87 // same vertical field of view as Mapbox GL
const LON0 = startCamera.center[0]
const LAT0 = startCamera.center[1]
const KX = Math.cos(THREE.MathUtils.degToRad(LAT0)) * 111320
const KY = 110540
/** How far the camera target may leave the Grätzl centre (m) */
const PAN_LIMIT = 520

export const lonLatToLocal = (lon: number, lat: number) => new THREE.Vector3((lon - LON0) * KX, 0, -(lat - LAT0) * KY)

/** Orange clay-tile roofs in slightly different tones per house */
const ROOF_TONES = ['#f3dcb4', '#f1d7ad', '#f4dfba', '#efd3a7', '#f5e1bf', '#f2d9b0']
function roofTone(index: number) {
  const h = Math.abs(Math.sin(index * 12.9898) * 43758.5453) % 1
  return ROOF_TONES[Math.floor(h * 1000) % ROOF_TONES.length]
}

function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function ringArea(ring: Ring) {
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  return Math.abs(area / 2)
}

function ringCentre(ring: Ring): [number, number] {
  let twiceArea = 0
  let x = 0
  let y = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
    twiceArea += cross
    x += (ring[j][0] + ring[i][0]) * cross
    y += (ring[j][1] + ring[i][1]) * cross
  }
  if (Math.abs(twiceArea) < 1e-6) return ring[0]
  return [x / (3 * twiceArea), y / (3 * twiceArea)]
}

function distanceToRing(ring: Ring, x: number, y: number) {
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j]
    const [bx, by] = ring[i]
    const dx = bx - ax
    const dy = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y))
  }
  return best
}

/** Rounds every corner of a ring with a small curve (radius in metres, never more than 40 % of the adjacent walls) */
function roundRing(ring: Ring, radius: number): Ring {
  const points = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring
  if (points.length < 3) return ring
  const out: Ring = []
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length]
    const corner = points[i]
    const next = points[(i + 1) % points.length]
    const inLength = Math.hypot(corner[0] - prev[0], corner[1] - prev[1])
    const outLength = Math.hypot(next[0] - corner[0], next[1] - corner[1])
    if (inLength < 1e-6 || outLength < 1e-6) continue
    const ux = (corner[0] - prev[0]) / inLength
    const uy = (corner[1] - prev[1]) / inLength
    const vx = (next[0] - corner[0]) / outLength
    const vy = (next[1] - corner[1]) / outLength
    // almost straight: keep the point as it is
    if (Math.abs(ux * vy - uy * vx) < 0.17) { out.push(corner); continue }
    const d = Math.min(radius, inLength * 0.4, outLength * 0.4)
    const a: [number, number] = [corner[0] - ux * d, corner[1] - uy * d]
    const b: [number, number] = [corner[0] + vx * d, corner[1] + vy * d]
    for (let step = 0; step <= 3; step++) {
      const t = step / 3
      const u = 1 - t
      out.push([u * u * a[0] + 2 * u * t * corner[0] + t * t * b[0], u * u * a[1] + 2 * u * t * corner[1] + t * t * b[1]])
    }
  }
  return out.length >= 3 ? out : ring
}

/** Rough wall-to-wall width of a footprint (2 × area / perimeter), used to keep bevels out of narrow parts */
function footprintWidth(ring: Ring) {
  let perimeter = 0
  for (let i = 1; i < ring.length; i++) perimeter += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1])
  return perimeter ? (2 * ringArea(ring)) / perimeter : 0
}

/** Corner radius of the buildings (m) and the soft rounding of the roof edge */
const CORNER_RADIUS = 0.6
const EDGE_BEVEL = 0.2

function toShape(poly: Poly) {
  const [outer, ...holes] = poly
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)))
  holes.forEach((hole) => shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y)))))
  return shape
}

function inside(ring: Ring, x: number, y: number) {
  let result = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result
  }
  return result
}

// ExtrudeGeometry carries two groups (0 = roof/floor caps, 1 = walls); split them so each can be merged per material
function splitGroups(geometry: THREE.BufferGeometry) {
  return geometry.groups.map((group) => {
    const part = new THREE.BufferGeometry()
    for (const name of ['position', 'normal', 'uv'] as const) {
      const attribute = geometry.getAttribute(name) as THREE.BufferAttribute
      const size = attribute.itemSize
      part.setAttribute(name, new THREE.BufferAttribute((attribute.array as Float32Array).slice(group.start * size, (group.start + group.count) * size), size))
    }
    return { part, material: group.materialIndex ?? 0 }
  })
}

/** A flat ribbon along a polyline (lines in WebGL are 1px, so routes are drawn as thin strips on the ground) */
function ribbon(points: THREE.Vector3[], width: number, y: number) {
  const positions: number[] = []
  const indices: number[] = []
  points.forEach((point, i) => {
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const dir = new THREE.Vector3().subVectors(next, prev).setY(0).normalize()
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width / 2)
    positions.push(point.x + side.x, y, point.z + side.z, point.x - side.x, y, point.z - side.z)
    if (i > 0) {
      const a = (i - 1) * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Maps a part (u0..u1, share of the street length) of a scanned street strip to its actual (sometimes bending) centreline. */
function planRibbon(plan: StreetPlan, u0 = 0, u1 = 1) {
  const route = plan.route.map(([x, y]) => new THREE.Vector3(x, 0.8, -y))
  const cum = [0]
  for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + route[i].distanceTo(route[i - 1]))
  const total = cum[cum.length - 1]
  const at = (distance: number) => {
    for (let i = 1; i < route.length; i++) {
      if (distance <= cum[i] || i === route.length - 1) {
        const t = THREE.MathUtils.clamp((distance - cum[i - 1]) / (cum[i] - cum[i - 1]), 0, 1)
        return route[i - 1].clone().lerp(route[i], t)
      }
    }
    return route[0].clone()
  }
  // vertices: the tile's ends plus every route corner in between
  const stops = [u0 * total, ...cum.filter((d) => d > u0 * total + 0.01 && d < u1 * total - 0.01), u1 * total]
  const points = stops.map(at)
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  points.forEach((point, i) => {
    const before = points[Math.max(0, i - 1)]
    const after = points[Math.min(points.length - 1, i + 1)]
    const tangent = new THREE.Vector3().subVectors(after, before).setY(0).normalize()
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(plan.width / 2)
    positions.push(point.x + side.x, point.y, point.z + side.z, point.x - side.x, point.y, point.z - side.z)
    const u = (stops[i] / total - u0) / (u1 - u0)
    uvs.push(u, 0, u, 1)
    if (i > 0) {
      const k = (i - 1) * 2
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

const FLOW_PERIOD = 12

/** Strip along a route, shifted sideways to its right-hand side; u runs in travel direction (one texture period = FLOW_PERIOD m). */
function flowRibbon(route: [number, number][], width: number, shift: number, capped = false) {
  const points = route.map(([x, y]) => new THREE.Vector3(x, 1.0, -y))
  const lengths = [0]
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]))
  // capped (areas such as pedestrian zones): both ends reach half a width further, so zones meeting at a crossing close up
  if (capped && points.length > 1) {
    const first = new THREE.Vector3().subVectors(points[0], points[1]).setY(0).normalize()
    const last = new THREE.Vector3().subVectors(points[points.length - 1], points[points.length - 2]).setY(0).normalize()
    points[0].addScaledVector(first, width / 2)
    points[points.length - 1].addScaledVector(last, width / 2)
  }
  const normalOf = (a: THREE.Vector3, b: THREE.Vector3) => {
    const tangent = new THREE.Vector3().subVectors(b, a).setY(0).normalize()
    return new THREE.Vector3(-tangent.z, 0, tangent.x)
  }
  const positions: number[] = []
  const uvs: number[] = []
  const reveal: number[] = []
  const indices: number[] = []
  points.forEach((point, i) => {
    // mitred corners: the band keeps its full width round a bend (no notches)
    const before = i > 0 ? normalOf(points[i - 1], point) : null
    const after = i < points.length - 1 ? normalOf(point, points[i + 1]) : null
    const right = before && after ? before.clone().add(after).normalize() : (before ?? after ?? new THREE.Vector3(1, 0, 0))
    const stretch = before && after ? 1 / Math.max(0.45, right.dot(before)) : 1
    const centre = point.clone().addScaledVector(right, shift * stretch)
    const half = right.clone().multiplyScalar((width / 2) * stretch)
    positions.push(centre.x + half.x, centre.y, centre.z + half.z, centre.x - half.x, centre.y, centre.z - half.z)
    const u = lengths[i] / FLOW_PERIOD
    uvs.push(u, 0, u, 1)
    const along = lengths[i] / (lengths[lengths.length - 1] || 1)
    reveal.push(along, along)
    if (i > 0) {
      const a = (i - 1) * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('reveal', new THREE.Float32BufferAttribute(reveal, 1))
  geometry.setIndex(indices)
  return geometry
}

/** how far before and after a bend the lane starts to curve (m) */
const BEND_REACH = 11

/**
 * The line a traffic lane runs on: shifted to the right-hand side of its route, with every bend rounded into a curve.
 * So the arrows drive round the corner, instead of being kinked and squashed on a sharp one.
 */
function lanePath(route: [number, number][], shift: number): [number, number][] {
  type P = [number, number]
  const unit = (a: P, b: P): P => { const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / length, (b[1] - a[1]) / length] }
  const shifted = route.map((point, i): P => {
    const before = i > 0 ? unit(route[i - 1], point) : null
    const after = i < route.length - 1 ? unit(point, route[i + 1]) : null
    // right of the direction (dx, dy) is (dy, -dx)
    const a: P = before ? [before[1], -before[0]] : [after![1], -after![0]]
    const b: P = after ? [after[1], -after[0]] : a
    const length = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1
    const right: P = [(a[0] + b[0]) / length, (a[1] + b[1]) / length]
    const stretch = 1 / Math.max(0.45, right[0] * a[0] + right[1] * a[1])
    return [point[0] + right[0] * shift * stretch, point[1] + right[1] * shift * stretch]
  })
  const path: P[] = [shifted[0]]
  for (let i = 1; i < shifted.length - 1; i++) {
    const previous = shifted[i - 1], corner = shifted[i], next = shifted[i + 1]
    // at most just under half of a neighbouring piece, so two bends close together do not run into each other
    const reach = Math.min(BEND_REACH, Math.hypot(corner[0] - previous[0], corner[1] - previous[1]) * 0.48, Math.hypot(next[0] - corner[0], next[1] - corner[1]) * 0.48)
    const into = unit(previous, corner), out = unit(corner, next)
    const start: P = [corner[0] - into[0] * reach, corner[1] - into[1] * reach]
    const end: P = [corner[0] + out[0] * reach, corner[1] + out[1] * reach]
    // many small steps, so the arrows bend smoothly
    for (let step = 0; step <= 18; step++) {
      const t = step / 18, u = 1 - t
      path.push([u * u * start[0] + 2 * u * t * corner[0] + t * t * end[0], u * u * start[1] + 2 * u * t * corner[1] + t * t * end[1]])
    }
  }
  path.push(shifted[shifted.length - 1])
  return path
}

/** Lets a ribbon grow along its route: everything beyond `uniform.value` (0..1 of the route) is still hidden, with a soft edge. */
function growsAlongRoute(material: THREE.MeshBasicMaterial, uniform: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = uniform
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float reveal;\nvarying float vReveal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReveal = reveal;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uReveal;\nvarying float vReveal;')
      .replace('#include <dithering_fragment>', 'gl_FragColor.a *= 1.0 - smoothstep(uReveal - 0.1, uReveal, vReveal);\n#include <dithering_fragment>')
  }
  material.customProgramCacheKey = () => 'grows-along-route'
}

/** Soft lane with chevrons pointing along +u; scrolling the texture makes the traffic flow. */
function flowTexture(color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 192
  canvas.height = 128
  const context = canvas.getContext('2d')!
  context.scale(2, 2)
  context.fillStyle = color
  context.globalAlpha = 0.42
  context.fillRect(0, 6, 96, 52)
  context.globalAlpha = 1
  context.lineCap = 'round'
  context.lineJoin = 'round'
  // white outline first, so the arrows stay legible on lawns and trees
  for (const [stroke, width] of [['#ffffff', 23], [color, 14]] as const) {
    context.strokeStyle = stroke
    context.lineWidth = width
    context.beginPath()
    context.moveTo(27, 16)
    context.lineTo(69, 32)
    context.lineTo(27, 48)
    context.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** Cool air: a soft bluish tint with wavy white streaks. One texture period is 12 m of street and tiles seamlessly, so it can drift along the street. */
function coolTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 192
  canvas.height = 64
  const context = canvas.getContext('2d')!
  const gradient = context.createLinearGradient(0, 0, 0, 64)
  gradient.addColorStop(0, 'rgba(70, 150, 235, 0)')
  gradient.addColorStop(0.28, 'rgba(70, 150, 235, 0.3)')
  gradient.addColorStop(0.72, 'rgba(70, 150, 235, 0.3)')
  gradient.addColorStop(1, 'rgba(70, 150, 235, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 192, 64)
  // soft wisps of air: long, gentle curves that fade in and out and are blurred by stacking a few strokes (no hard bright lines)
  context.lineCap = 'round'
  const wisp = (x0: number, length: number, y: number, amplitude: number, width: number, alpha: number) => {
    for (const shift of [-192, 0, 192]) {
      const x = x0 + shift
      const gradient = context.createLinearGradient(x, 0, x + length, 0)
      gradient.addColorStop(0, 'rgba(235, 246, 255, 0)')
      gradient.addColorStop(0.5, `rgba(235, 246, 255, ${alpha})`)
      gradient.addColorStop(1, 'rgba(235, 246, 255, 0)')
      for (const [spread, strength] of [[3.2, 0.3], [2, 0.5], [1, 1]] as const) {
        context.beginPath()
        context.moveTo(x, y)
        context.bezierCurveTo(x + length * 0.3, y - amplitude, x + length * 0.65, y + amplitude, x + length, y)
        context.strokeStyle = gradient
        context.globalAlpha = strength
        context.lineWidth = width * spread
        context.stroke()
      }
    }
    context.globalAlpha = 1
  }
  wisp(6, 120, 19, 4, 2.6, 0.5)
  wisp(80, 112, 33, -4, 3, 0.42)
  wisp(128, 100, 46, 3, 2.2, 0.38)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  return texture
}

/** Soft ends for a ribbon: it fades in and out along its length, so cool air never has a hard edge */
function fadesAtEnds(material: THREE.MeshBasicMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float reveal;\nvarying float vReveal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReveal = reveal;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vReveal;')
      .replace('#include <dithering_fragment>', 'gl_FragColor.a *= smoothstep(0.0, 0.2, vReveal) * (1.0 - smoothstep(0.8, 1.0, vReveal));\n#include <dithering_fragment>')
  }
  material.customProgramCacheKey = () => 'fades-at-ends'
}

/** Where (distance along the route, distance sideways) a point lies relative to a polyline */
function projectOnRoute(route: [number, number][], x: number, y: number) {
  let best = { along: 0, dist: Infinity }
  let travelled = 0
  for (let i = 1; i < route.length; i++) {
    const [ax, ay] = route[i - 1], [bx, by] = route[i]
    const dx = bx - ax, dy = by - ay
    const length = Math.hypot(dx, dy)
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (length * length)))
    const dist = Math.hypot(x - (ax + dx * t), y - (ay + dy * t))
    if (dist < best.dist) best = { along: travelled + t * length, dist }
    travelled += length
  }
  return best
}

/** The part of a polyline between two distances (local metres), including every corner in between */
function routeBetween(route: [number, number][], from: number, to: number): [number, number][] {
  const out: [number, number][] = []
  let travelled = 0
  const pointAt = (distance: number): [number, number] => {
    let done = 0
    for (let i = 1; i < route.length; i++) {
      const length = Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1])
      if (distance <= done + length || i === route.length - 1) {
        const t = Math.min(1, Math.max(0, (distance - done) / length))
        return [route[i - 1][0] + (route[i][0] - route[i - 1][0]) * t, route[i - 1][1] + (route[i][1] - route[i - 1][1]) * t]
      }
      done += length
    }
    return route[0]
  }
  out.push(pointAt(from))
  for (let i = 1; i < route.length; i++) {
    travelled += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1])
    if (travelled > from + 0.5 && travelled < to - 0.5) out.push(route[i])
  }
  out.push(pointAt(to))
  return out
}

/** Reznicekgasse from Liechtensteinstraße to the Badgasse corner (local metres, x east, y north) */
const REZNICEK_ROUTE: [number, number][] = [[-153.1, 108.6], [-119.5, 116.5], [-67.9, 129.9], [-15.2, 151.2], [42.8, 184.8]]

/** The areas of the start view: north, middle and south of the Grätzl, each made of workshop areas (named after their streets) */
export const AREA_GROUPS = [
  { name: 'Newaldgasse & Reznicekgasse', parts: ['Newaldgasse & Reznicekgasse'] },
  { name: 'Lichtentaler Gasse & Badgasse', parts: ['Lichtentaler Gasse & Wiesengasse', 'Badgasse & Simon-Denk-Gasse'] },
  { name: 'Fechtergasse & Thurygasse', parts: ['Marktgasse & Fechtergasse', 'Thurygasse'] },
]

/** Calm, static lime band: a pedestrian zone */
function pedestrianTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')!
  // plain, fully opaque green: where two zones overlap at a crossing they merge into one surface (no darker patches)
  context.fillStyle = '#79af42'
  context.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** White scanner paper becomes transparent; annotations and coloured notes remain legible. */
function planTexture(image: HTMLImageElement, fadeStart: boolean, fadeEnd: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = pixels
  const width = canvas.width
  const height = canvas.height
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const darkness = 255 - Math.min(data[index], data[index + 1], data[index + 2])
      const edge = Math.min(1, fadeStart ? x / 40 : 1, fadeEnd ? (width - x) / 40 : 1, y / (height * .05), (height - y) / (height * .05))
      data[index + 3] = Math.round(Math.min(255, Math.max(0, darkness - 9) * 3.6) * Math.max(0, edge))
    }
  }
  context.putImageData(pixels, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

type Pin = { element: HTMLButtonElement; position: THREE.Vector3; categoryId: CategoryId; category: MapCategory; layerId: string; x: number; y: number; on: boolean }
type Pickable = { mesh: THREE.Mesh; feature: IsoFeature }

export class IsoMap {
  readonly ready: Promise<void>
  private readonly container: HTMLElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: MapControls
  private readonly pinLayer: HTMLDivElement
  private readonly infoTooltip: HTMLDivElement
  private hoveredFeature: IsoFeature | null = null
  /**
   * Touch screens: icons let every touch through to the map (moving and pinch-zooming work wherever the fingers land);
   * a tap is recognised by the map and handed to the icon under the finger.
   */
  private readonly tapActions = new Map<HTMLElement, () => void>()
  private readonly streetLayer: HTMLDivElement
  private readonly districtLayer: HTMLDivElement
  private readonly districtLabels: { element: HTMLSpanElement; position: THREE.Vector3 }[] = []
  private readonly controlsUi: HTMLDivElement
  private readonly pins: Pin[] = []
  private readonly streetLabels: { element: HTMLSpanElement; name: string; a: THREE.Vector3; b: THREE.Vector3; mid: THREE.Vector3; width: number }[] = []
  private zoomTarget: { distance: number; anchor: THREE.Vector3 } | null = null
  private readonly clusterPool = new Map<string, HTMLButtonElement>()
  private clusterTier: 'near' | 'mid' | 'far' = 'far'
  private inAreaView = false
  /** areas of the Grätzl: tooltip at the start view, highlight of their blocks and buildings on hover */
  private readonly zones: {
    name: string
    centre: THREE.Vector3
    blocks: Ring[]
    bounds: THREE.Box3
    buildings: number[]
    ground: THREE.Mesh
    tip: HTMLButtonElement
    /** the same area in the side list (desktop) */
    item: HTMLButtonElement
  }[] = []
  /** desktop: the area names as a list at the side, so they do not cover the houses */
  private readonly areaList: HTMLDivElement = document.createElement('div')
  /** outline of the Grätzl (for placing the side bubbles) */
  private focusRing: THREE.Vector3[] = []
  private focusBoundary: Ring = []
  /** objects that make the Grätzl stand out (3D houses, trees, its own colours); hidden on the start screen */
  private readonly graetzlObjects: THREE.Object3D[] = []
  /** while the Grätzl is not highlighted it looks like its surroundings (flat blocks) */
  private graetzlPlain: THREE.Object3D | null = null
  private graetzlHighlighted = true
  private hoveredZone: (typeof this.zones)[number] | null = null
  private originalColours = new Map<THREE.BufferAttribute, Float32Array>()
  private readonly pickables: Pickable[] = []
  private readonly categoryGroups = new Map<CategoryId, THREE.Group>()
  private readonly visibleCategories = new Set<CategoryId>()
  private readonly lastView = new THREE.Matrix4()
  private readonly raycaster = new THREE.Raycaster()
  private readonly resizeObserver: ResizeObserver
  private path: { start: number; duration: number; sample(time: number): { position: THREE.Vector3; look: THREE.Vector3 }; done(): void } | null = null
  private stephansdom = new THREE.Vector3(1063, 0, 2060)
  private flight: { from: IsoView; to: IsoView; start: number; duration: number; easing: (t: number) => number; done: () => void } | null = null
  private readonly buildingIndex: { ring: Ring; inner: boolean; ranges: { attribute: THREE.BufferAttribute; start: number; count: number; roof: boolean }[] }[] = []
  private revealed = false
  /** start view: no free zooming / panning, only clicks on the areas */
  private locked = true
  /** camera distance right after flying into an area; zooming out a little beyond it returns to the start */
  private areaDistance: number | null = null
  private pinsDirty = true
  private disposed = false
  private planOverlayMeshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = []
  private planOverlayRequest = 0
  private plansWanted = false
  private plansRequested = false
  private holdTimer: number | null = null
  private holdActive = false
  private suppressClick = false
  private trafficMeshes: THREE.Mesh[] = []
  private trafficTextures: THREE.CanvasTexture[] = []
  private trafficFlowTexture: THREE.CanvasTexture | null = null
  /** traffic view: free pan and zoom from the start, no locked overview, no data picking */
  private freeView = false
  private trafficReveal = { value: 2 }
  /** texture periods per second: the green Neu arrows run about 35 % slower than the red Bestand ones */
  private trafficSpeed = 0.9
  private trafficAnim: { start: number } | null = null
  private pedReveal = { value: 2 }
  private pedAnim: { start: number; delay: number } | null = null
  private pedMeshes: THREE.Mesh[] = []
  private pedTexture: THREE.CanvasTexture | null = null
  private pedestrianWanted = true
  private basePedMeshes: THREE.Mesh[] = []
  private basePedMaterial: THREE.MeshBasicMaterial | null = null
  private basePedWanted = { show: false, faint: false }
  private graetzlReady = false
  private trafficMode: TrafficMode | null = null
  private treeObjects: THREE.Group[] = []
  private coolMeshes: THREE.Mesh[] = []
  private garageInput: GarageInput | null = null
  private garageScene: GarageScene | null = null
  /** street axes of the open data (x1, y1, x2, y2), to line the cool air up with the street next to a tree */
  private streetSegments: [number, number, number, number][] = []
  private coolTexture: THREE.CanvasTexture | null = null
  /** trees the map already has (x, z, crown radius): new trees keep clear of them */
  private standingTrees: { x: number; z: number; r: number }[] = []
  private standingMeshes: { meshes: THREE.InstancedMesh[]; matrices: THREE.Matrix4[][] } | null = null
  private trafficPedMaterial: THREE.MeshBasicMaterial | null = null
  private trafficLeaving: { start: number; meshes: THREE.Mesh[]; materials: THREE.MeshBasicMaterial[]; textures: THREE.CanvasTexture[]; flowTexture: THREE.CanvasTexture | null; speed: number } | null = null

  constructor(container: HTMLElement, private readonly callbacks: IsoCallbacks) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.className = 'iso-canvas'
    container.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(COLORS.background)
    this.scene.fog = new THREE.Fog(COLORS.background, 1100, 2600)

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 150000)
    this.controls = new MapControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.screenSpacePanning = false
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(72)
    this.controls.rotateSpeed = 0.6
    this.controls.minDistance = 90
    // zoom is handled below (smooth, towards the cursor, like Mapbox)
    this.controls.enableZoom = false
    this.controls.maxDistance = 2200
    this.controls.enabled = false
    this.controls.addEventListener('change', () => {
      // keep the Grätzl in reach
      const target = this.controls.target
      const length = Math.hypot(target.x, target.z)
      if (length > PAN_LIMIT) {
        const shift = new THREE.Vector3(target.x, 0, target.z).multiplyScalar(PAN_LIMIT / length - 1)
        target.add(shift)
        this.camera.position.add(shift)
      }
    })

    // flat illustration light: roofs bright, the two visible facade directions in two clear tones, no cast shadows
    // neutral white light: the warmth lives in the Grätzl's own colours, the surroundings stay a cool whitish grey
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#ececec', 2.45))
    const sun = new THREE.DirectionalLight('#ffffff', 1.45)
    sun.position.set(-320, 520, 260)
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096)
    Object.assign(sun.shadow.camera, { left: -650, right: 650, top: 650, bottom: -650, near: 1, far: 1800 })
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.6
    sun.shadow.radius = 3
    this.scene.add(sun)

    this.districtLayer = document.createElement('div')
    this.districtLayer.className = 'iso-districts'
    container.appendChild(this.districtLayer)
    this.streetLayer = document.createElement('div')
    this.streetLayer.className = 'iso-streets'
    container.appendChild(this.streetLayer)
    this.pinLayer = document.createElement('div')
    this.pinLayer.className = 'iso-pins'
    container.appendChild(this.pinLayer)
    this.infoTooltip = document.createElement('div')
    this.infoTooltip.className = 'iso-info-tooltip'
    this.infoTooltip.setAttribute('role', 'tooltip')
    container.appendChild(this.infoTooltip)
    this.areaList.className = 'iso-area-list'
    this.areaList.setAttribute('role', 'list')
    this.areaList.style.display = 'none'
    container.appendChild(this.areaList)
    this.controlsUi = this.createControlsUi()
    container.appendChild(this.controlsUi)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.jumpTo(this.introView())

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown)
    container.addEventListener('pointerdown', this.handleHoldDown)
    container.addEventListener('pointermove', this.handleHoldMove)
    container.addEventListener('pointerup', this.handleHoldEnd)
    container.addEventListener('pointercancel', this.handleHoldEnd)
    container.addEventListener('pointerleave', this.handleHoldEnd)
    container.addEventListener('contextmenu', this.handleContextMenu)
    this.renderer.domElement.addEventListener('click', this.handleClick)
    this.renderer.domElement.addEventListener('pointermove', this.handleHover)
    this.renderer.domElement.addEventListener('pointerleave', this.handlePointerLeave)
    // capture phase: the wheel is ours, the controls only handle touch pinching
    this.renderer.domElement.addEventListener('wheel', this.handleWheel, { passive: false, capture: true })
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
    this.renderer.domElement.addEventListener('dblclick', this.handleDoubleClick)
    this.renderer.setAnimationLoop(this.frame)
    this.callbacks.onAreaViewChange?.(false)
    this.ready = this.buildCity()
  }

  /** Shows or hides all scanned street plans at once, each laid onto its street (built once, then only toggled) */
  setPlansVisible(visible: boolean) {
    this.plansWanted = visible
    this.planOverlayMeshes.forEach((mesh) => { mesh.visible = visible })
    if (!visible || this.plansRequested) return
    this.plansRequested = true
    Object.values(streetPlans).forEach((plan, index) => {
      // the junction sheet is a rotated scene, not a strip: it needs its own placement and overlaps the street scans
      if (plan.id === 'badgasseReznicek') return
      const tiles = planTiles[plan.id] ?? []
      tiles.forEach((tile, tileIndex) => {
        const image = new Image()
        image.onload = () => {
          if (this.disposed) return
          const material = new THREE.MeshBasicMaterial({
            map: planTexture(image, tileIndex === 0, tileIndex === tiles.length - 1), transparent: true, opacity: .92,
            depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1,
          })
          const mesh = new THREE.Mesh(planRibbon(plan, tile.u0, tile.u1), material)
          mesh.renderOrder = 11 + index
          mesh.visible = this.plansWanted
          this.scene.add(mesh)
          this.planOverlayMeshes.push(mesh)
        }
        image.src = `plans/${tile.file}`
      })
    })
  }

  private disposePlans() {
    this.planOverlayMeshes.forEach((mesh) => {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      mesh.material.map?.dispose()
      mesh.material.dispose()
    })
    this.planOverlayMeshes = []
  }

  // --- press and hold: the scans are a peek, not a mode ------------------------------------------
  private holdStart = { x: 0, y: 0 }
  private handleHoldDown = (event: PointerEvent) => {
    this.suppressClick = false
    if (this.freeView || !this.revealed || event.button > 0) return
    // pins and the controls keep their own taps
    if ((event.target as Element | null)?.closest('.iso-pin, .iso-cluster, button, a')) return
    this.holdStart = { x: event.clientX, y: event.clientY }
    this.cancelHoldTimer()
    // a second finger means pinching, not holding
    if (!event.isPrimary) return
    this.holdTimer = window.setTimeout(() => {
      this.holdTimer = null
      this.holdActive = true
      this.suppressClick = true
      this.hideInfoTooltip()
      this.callbacks.onHoldPlans?.(true)
    }, HOLD_MS)
  }
  private cancelHoldTimer() {
    if (this.holdTimer === null) return
    window.clearTimeout(this.holdTimer)
    this.holdTimer = null
  }

  private handleHoldMove = (event: PointerEvent) => {
    if (this.holdTimer !== null && Math.hypot(event.clientX - this.holdStart.x, event.clientY - this.holdStart.y) > 8) {
      this.cancelHoldTimer()
    }
  }
  private handleHoldEnd = () => {
    this.cancelHoldTimer()
    if (this.holdActive) {
      this.holdActive = false
      this.callbacks.onHoldPlans?.(false)
    }
  }
  private handleContextMenu = (event: Event) => {
    if (this.holdActive || this.suppressClick) event.preventDefault()
  }

  /** Animated traffic flow of the current ("bestand") or the new concept; null hides it */
  setTrafficMode(mode: TrafficMode | null, animate = false) {
    this.clearTrafficLeaving()
    const hadLines = this.trafficMeshes.length > 0 || this.pedMeshes.length > 0
    const oldMeshes = [...this.trafficMeshes, ...this.pedMeshes]
    const oldTextures = [...this.trafficTextures, ...(this.pedTexture ? [this.pedTexture] : [])]
    if (animate && hadLines) {
      // the old concept fades out while the new one grows in along its routes
      this.trafficLeaving = {
        start: performance.now(),
        meshes: oldMeshes,
        materials: [...new Set(oldMeshes.map((mesh) => mesh.material as THREE.MeshBasicMaterial))],
        textures: oldTextures,
        flowTexture: this.trafficFlowTexture,
        speed: this.trafficSpeed,
      }
      // the leaving lines sit under the arriving ones, so overlapping lanes never flicker between the two
      oldMeshes.forEach((mesh) => { mesh.renderOrder -= 3 })
    } else {
      oldMeshes.forEach((mesh) => {
        this.scene.remove(mesh)
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
      })
      oldTextures.forEach((texture) => texture.dispose())
    }
    this.trafficMeshes = []
    this.trafficTextures = []
    this.pedMeshes = []
    this.pedTexture = null
    this.trafficFlowTexture = null
    this.trafficPedMaterial = null
    this.trafficAnim = null
    this.pedAnim = null
    this.trafficMode = mode
    if (!mode) return
    const concept = trafficConcepts[mode]
    this.trafficSpeed = mode === 'neu' ? 0.9 * 0.65 : 0.9
    const growing = animate && hadLines
    this.trafficReveal.value = growing ? 0 : 2
    if (growing) this.trafficAnim = { start: performance.now() }
    const texture = flowTexture(concept.color)
    this.trafficTextures.push(texture)
    this.trafficFlowTexture = texture
    const material = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
    })
    growsAlongRoute(material, this.trafficReveal)
    const add = (route: [number, number][], shift: number) => {
      const mesh = new THREE.Mesh(flowRibbon(lanePath(route, shift), 8, 0), material)
      mesh.renderOrder = 40
      this.scene.add(mesh)
      this.trafficMeshes.push(mesh)
    }
    concept.flows.forEach((flow: TrafficFlow) => {
      if (flow.both) {
        add(flow.path, 4.4)
        add([...flow.path].reverse(), 4.4)
      } else add(flow.path, 0)
    })
    // pedestrian zones come in a moment after the lanes (or not at all while the tour has not reached them)
    this.buildPedestrianZones(growing ? 1000 : 0, growing)
  }

  /** Pedestrian zones of the new concept on or off; shown with a growing animation when `animate` */
  setPedestrianZones(show: boolean, animate = false) {
    if (show === this.pedestrianWanted && (!show || this.pedMeshes.length > 0 || this.trafficMode !== 'neu')) return
    this.pedestrianWanted = show
    this.pedMeshes.forEach((mesh) => {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    })
    this.pedTexture?.dispose()
    this.pedMeshes = []
    this.pedTexture = null
    this.trafficPedMaterial = null
    this.pedAnim = null
    this.buildPedestrianZones(0, animate)
  }

  private buildPedestrianZones(delay: number, animate: boolean) {
    const pedestrian = this.trafficMode ? trafficConcepts[this.trafficMode].pedestrian : undefined
    if (!pedestrian || !this.pedestrianWanted) return
    const texture = pedestrianTexture()
    this.pedTexture = texture
    const material = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
    })
    this.pedReveal.value = animate ? 0 : 2
    growsAlongRoute(material, this.pedReveal)
    this.trafficPedMaterial = material
    if (animate) this.pedAnim = { start: performance.now(), delay }
    pedestrian.forEach((route) => {
      const mesh = new THREE.Mesh(flowRibbon(route, 9, 0, true), material)
      mesh.renderOrder = 39
      this.scene.add(mesh)
      this.pedMeshes.push(mesh)
    })
  }

  /**
   * Grätzl-Ideen: the pedestrian zones of the new traffic concept lie under everything (the whole concept builds on them).
   * faint: over the scanned plans they turn see-through, so the plans stay readable.
   */
  setBasePedestrianZones(show: boolean, faint = false) {
    this.basePedWanted = { show, faint }
    if (show && !this.basePedMeshes.length && this.graetzlReady) {
      const texture = pedestrianTexture()
      this.basePedMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })
      trafficConcepts.neu.pedestrian?.forEach((route) => {
        const mesh = new THREE.Mesh(flowRibbon(route, 9, 0, true), this.basePedMaterial!)
        mesh.renderOrder = 39
        this.scene.add(mesh)
        this.basePedMeshes.push(mesh)
      })
    }
    this.basePedMeshes.forEach((mesh) => { mesh.visible = show })
    if (this.basePedMaterial) this.basePedMaterial.opacity = faint ? 0.4 : 1
  }

  private clearTrafficLeaving() {
    const leaving = this.trafficLeaving
    if (!leaving) return
    leaving.meshes.forEach((mesh) => {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
    })
    leaving.materials.forEach((material) => material.dispose())
    leaving.textures.forEach((texture) => texture.dispose())
    this.trafficLeaving = null
  }

  /** One frame of the Bestand <-> Neu transition: old lines fade, new lines grow along their routes, new zones grow in */
  private stepTrafficTransition(now: number) {
    const leaving = this.trafficLeaving
    if (leaving) {
      // the old lines keep running while they fade, so nothing freezes
      if (leaving.flowTexture) leaving.flowTexture.offset.x = -((now / 1000) * leaving.speed) % 1
      const t = Math.min(1, (performance.now() - leaving.start) / 600)
      const eased = t * t * (3 - 2 * t)
      leaving.materials.forEach((material) => { material.opacity = 1 - eased })
      if (t >= 1) this.clearTrafficLeaving()
    }
    const anim = this.trafficAnim
    if (anim) {
      // the new lines start growing as the old ones are almost gone
      const growStart = 350, growDuration = 1400
      const grow = Math.min(1, Math.max(0, (performance.now() - anim.start - growStart) / growDuration))
      this.trafficReveal.value = (1 - Math.pow(1 - grow, 3)) * 1.15
      if (grow >= 1) {
        this.trafficReveal.value = 2
        this.trafficAnim = null
      }
    }
    const ped = this.pedAnim
    if (ped) {
      // the pedestrian zones grow along their routes, nothing else
      const growDuration = 1200
      const grow = Math.min(1, Math.max(0, (performance.now() - ped.start - ped.delay) / growDuration))
      this.pedReveal.value = (1 - Math.pow(1 - grow, 3)) * 1.15
      if (grow >= 1) {
        this.pedReveal.value = 2
        this.pedAnim = null
      }
    }
  }

  /**
   * Seen exactly from above, centred and as large as the screen allows. By default the whole Grätzl; with `focus` a
   * rectangle in local metres (x east, y north). `insets` are pixels kept free for the controls and the tour card.
   */
  trafficView(
    focus?: { x: number; y: number; width: number; height: number },
    insets: { top?: number; bottom?: number; left?: number; right?: number } = {},
    /** a card next to the Grätzl (wide screens): Grätzl and card are centred together, `cardLeft` is where the card starts */
    beside?: { width: number; gap: number },
  ): IsoView & { cardLeft?: number } {
    const start = this.startView()
    let minX: number, maxX: number, minZ: number, maxZ: number
    if (focus) {
      minX = focus.x - focus.width / 2; maxX = focus.x + focus.width / 2
      minZ = -(focus.y + focus.height / 2); maxZ = -(focus.y - focus.height / 2)
    } else {
      if (!this.focusRing.length) return { ...start, pitch: 0, bearing: 0 }
      minX = Infinity; maxX = -Infinity; minZ = Infinity; maxZ = -Infinity
      this.focusRing.forEach((p) => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
      })
    }
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    // wide screens: only the small switch on top needs room, the bottom switch may overlap the empty corner next to the Grätzl
    const wide = width > 720
    const top = insets.top ?? (wide ? 46 : 56), bottom = insets.bottom ?? (wide ? 16 : 64), left = insets.left ?? (wide ? 10 : 20), right = insets.right ?? (wide ? 10 : 20)
    const sideRoom = beside ? beside.width + beside.gap : 0
    const availW = Math.max(120, width - left - right - sideRoom)
    const availH = Math.max(120, height - top - bottom)
    const metresPerPixel = Math.max((maxX - minX) / availW, (maxZ - minZ) / availH)
    const distance = (metresPerPixel * height) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)))
    // the centre of the area sits in the middle of the free rectangle, which is off the screen centre by these pixels
    let offsetX = (left - right) / 2
    let cardLeft: number | undefined
    if (beside) {
      // centre Grätzl + gap + card as one group on the screen
      const areaWidth = (maxX - minX) / metresPerPixel
      const groupLeft = (width - (areaWidth + sideRoom)) / 2
      offsetX = groupLeft + areaWidth / 2 - width / 2
      cardLeft = Math.round(groupLeft + areaWidth + beside.gap)
    }
    const offsetY = (top - bottom) / 2
    return {
      ...start,
      cardLeft,
      x: (minX + maxX) / 2 - offsetX * metresPerPixel,
      z: (minZ + maxZ) / 2 - offsetY * metresPerPixel,
      distance: THREE.MathUtils.clamp(distance, this.controls.minDistance, this.controls.maxDistance),
      pitch: 0,
      bearing: 0,
    }
  }

  /** Traffic view on: the map is not locked to the start view and moves freely */
  setFreeView(on: boolean) {
    this.freeView = on
    // traffic and trees show their own picture: the coloured areas and lines of the ideas step aside
    this.categoryGroups.forEach((group, categoryId) => { group.visible = !on && this.visibleCategories.has(categoryId) })
    // unlock right away (the lock is recomputed with the next pin update, which could otherwise pull the camera back to the start view)
    if (on) this.locked = false
    this.pinsDirty = true
    this.hideInfoTooltip()
  }

  /** Close-up rectangle around the new trees at the Reznicekgasse (local metres), for the camera */
  coolFocus() {
    // straight from above, close on the Reznicekgasse towards its corner with the Liechtensteinstraße
    // (with all 134 spots the trees line the whole street, framing them all would be too far away)
    return { x: -95, y: 124, width: 135, height: 92 }
  }

  /**
   * Cool air where the new trees are: a bluish area with white streaks of air that drift along. At the Reznicekgasse it is one
   * long band (a little wider than the trees, reaching well into the crossings), everywhere else a small patch per tree that
   * lines up with the nearest street. All ends fade out softly.
   */
  setCoolZone(show: boolean) {
    this.coolMeshes.forEach((mesh) => {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
    })
    this.coolMeshes = []
    if (this.coolTexture) {
      this.coolTexture.dispose()
      this.coolTexture = null
    }
    if (!show) return
    const texture = coolTexture()
    this.coolTexture = texture
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 })
    fadesAtEnds(material)
    const addRibbon = (route: [number, number][], width: number) => {
      const mesh = new THREE.Mesh(flowRibbon(route, width, 0), material)
      mesh.position.y = -0.3
      mesh.renderOrder = 20
      this.scene.add(mesh)
      this.coolMeshes.push(mesh)
    }
    const all = this.treeSpots()
    const atRez = all.filter((spot) => projectOnRoute(REZNICEK_ROUTE, spot.x, -spot.z).dist < 20)
    if (atRez.length) {
      const total = REZNICEK_ROUTE.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - REZNICEK_ROUTE[i][0], point[1] - REZNICEK_ROUTE[i][1]), 0)
      const alongs = atRez.map((spot) => projectOnRoute(REZNICEK_ROUTE, spot.x, -spot.z).along)
      addRibbon(routeBetween(REZNICEK_ROUTE, Math.max(0, Math.min(...alongs) - 34), Math.min(total, Math.max(...alongs) + 34)), 13)
    }
    // a patch for every other tree, turned like the street beside it
    all.filter((spot) => !atRez.includes(spot)).forEach((spot) => {
      let angle = 0.37
      let nearest = Infinity
      this.streetSegments.forEach(([x1, y1, x2, y2]) => {
        const dx = x2 - x1, dy = y2 - y1
        const length = Math.hypot(dx, dy) || 1
        const t = Math.min(1, Math.max(0, ((spot.x - x1) * dx + (-spot.z - y1) * dy) / (length * length)))
        const dist = Math.hypot(spot.x - (x1 + dx * t), -spot.z - (y1 + dy * t))
        if (dist < nearest) { nearest = dist; angle = Math.atan2(dy, dx) }
      })
      const half = 17
      addRibbon([[spot.x - Math.cos(angle) * half, -spot.z - Math.sin(angle) * half], [spot.x + Math.cos(angle) * half, -spot.z + Math.sin(angle) * half]], 14)
    })
  }

  /** Number of possible new trees on the map */
  treeCount() {
    return this.treeSpots().length
  }

  /** The 134 possible tree spots of the tree analysis (Studio LAUT), as they stand on the plan */
  private treeSpots() {
    return PLANNED_TREES.map(([x, y]) => ({ x, z: -y, r: 3.4 }))
  }

  /**
   * New trees: at each of the 134 possible spots of the tree analysis a tree pops up, drawn exactly like the
   * trees the map already has (same crown and trunk, in warm colours).
   */
  setTreesView(on: boolean) {
    this.treeObjects.forEach((object) => {
      this.scene.remove(object)
      object.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
      })
    })
    this.treeObjects = []
    this.hideStandingTrees(on ? this.treeSpots() : [])
    if (!on) return
    const crownGeometry = new THREE.IcosahedronGeometry(1, 1)
    const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.26, 1, 5)
    // new trees: same shape as the existing ones, but warm yellow to orange so they stand out
    const crownMaterials = ['#f6c13e', '#f2a73a', '#f8cf52', '#ef9a36'].map((color) => new THREE.MeshLambertMaterial({ color, flatShading: true }))
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: COLORS.trunk })
    const spots = this.treeSpots()
    spots.forEach((spot, index) => {
      const r = 3.4 + (index % 3) * 0.35
      const top = r * 2 + 3
      const tree = new THREE.Group()
      tree.position.set(spot.x, 0, spot.z)
      const crown = new THREE.Mesh(crownGeometry, crownMaterials[index % crownMaterials.length])
      crown.scale.set(r, r * 1.08, r)
      crown.position.y = top - r * 0.9
      crown.castShadow = true
      const trunkHeight = Math.max(0.5, top - r * 1.6)
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial)
      trunk.scale.set(1, trunkHeight, 1)
      trunk.position.y = trunkHeight / 2
      trunk.castShadow = true
      tree.add(trunk, crown)
      crown.userData.scale = crown.scale.clone()
      this.scene.add(tree)
      this.treeObjects.push(tree)
    })
  }

  /** Where a new tree stands right on a tree the map already has, the old one steps aside (two crowns in one flicker) */
  private hideStandingTrees(spots: { x: number; z: number }[]) {
    if (!this.standingMeshes) return
    const { meshes, matrices } = this.standingMeshes
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
    const covered = this.standingTrees.map((tree) => spots.some((spot) => Math.hypot(spot.x - tree.x, spot.z - tree.z) < 3.5))
    meshes.forEach((mesh, m) => {
      covered.forEach((isCovered, i) => mesh.setMatrixAt(i, isCovered ? hidden : matrices[m][i]))
      mesh.instanceMatrix.needsUpdate = true
    })
  }

  private treePulse: number | null = null

  /** One frame of the pulse of the new trees: three soft swells of the crowns, then they rest */
  private stepTreePulse(now: number) {
    if (this.treePulse === null) return
    const t = (now - this.treePulse - 500) / 1000
    const done = t >= 3
    const swell = t <= 0 || done ? 0 : Math.pow(Math.sin(Math.PI * t), 2) * 0.22
    this.treeObjects.forEach((tree) => {
      const crown = tree.children[1] as THREE.Mesh | undefined
      const base = crown?.userData.scale as THREE.Vector3 | undefined
      if (crown && base) crown.scale.copy(base).multiplyScalar(1 + swell)
    })
    if (done) this.treePulse = null
  }

  /** Icons and scans are alternatives: with scans on, the pins are hidden */
  setPinsHidden(hidden: boolean) {
    this.pinLayer.classList.toggle('is-pins-hidden', hidden)
    this.hideInfoTooltip()
  }

  // --- views -------------------------------------------------------------------------------------
  /** Distance at which the view matches the Mapbox start zoom for the current viewport height */
  private distanceForZoom(zoom: number) {
    const metresPerPixel = (78271.517 * Math.cos(THREE.MathUtils.degToRad(LAT0))) / 2 ** zoom
    return (this.container.clientHeight / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2))) * metresPerPixel
  }

  /** The start view seen straight from above (the intro zooms down to this, then tilts into startView) */
  topView(): IsoView {
    return { ...this.startView(), pitch: 0, bearing: 0 }
  }

  /** Same start view as the main map (north up, 40° pitch) */
  startView(): IsoView {
    const target = lonLatToLocal(...startCamera.center)
    return { x: target.x, z: target.z, distance: this.distanceForZoom(startCamera.zoom), pitch: startCamera.pitch, bearing: startCamera.bearing }
  }

  /** Start of the intro: high above Vienna, the whole city in view */
  introView(): IsoView {
    // already close above the Grätzl, straight from above (its neighbourhood around it)
    const centre = lonLatToLocal(16.3592, 48.2255)
    return { x: centre.x, z: centre.z, distance: this.distanceForZoom(14.8), pitch: 0, bearing: 0 }
  }

  /**
   * Intro flight: from high above Vienna down to Stephansdom, past its spire like a bird, then across the
   * city to the Grätzl, ending in the start view. Keyframes are camera positions and look-at points.
   */
  flyIntro(duration = 9000) {
    const dom = new THREE.Vector3(this.stephansdom.x, 0, this.stephansdom.z)
    const grätzl = new THREE.Vector3(0, 0, 0)
    const at = (base: THREE.Vector3, x: number, y: number, z: number) => base.clone().add(new THREE.Vector3(x, y, z))
    const between = (t: number, y: number) => dom.clone().lerp(grätzl, t).setY(y)
    const start = this.startView()
    const end = new THREE.Vector3().setFromSphericalCoords(start.distance, THREE.MathUtils.degToRad(start.pitch), THREE.MathUtils.degToRad(-start.bearing)).add(new THREE.Vector3(start.x, 0, start.z))
    const keys: { t: number; position: THREE.Vector3; look: THREE.Vector3 }[] = [
      { t: 0, position: this.camera.position.clone(), look: this.controls.target.clone() },
      { t: 0.24, position: at(dom, 2600, 5200, 7200), look: at(dom, 0, 0, 0) },
      { t: 0.44, position: at(dom, 760, 620, 1500), look: at(dom, 0, 60, 0) },
      { t: 0.57, position: at(dom, 240, 150, 330), look: at(dom, 0, 105, 0) },
      { t: 0.67, position: at(dom, -190, 175, -190), look: between(0.4, 40) },
      { t: 0.83, position: between(0.5, 700).add(new THREE.Vector3(0, 0, 500)), look: grätzl },
      { t: 1, position: end, look: grätzl },
    ]
    const positions = new THREE.CatmullRomCurve3(keys.map((key) => key.position), false, 'centripetal')
    const looks = new THREE.CatmullRomCurve3(keys.map((key) => key.look), false, 'centripetal')
    const segments = keys.length - 1
    return new Promise<void>((resolve) => {
      this.flight?.done()
      this.zoomTarget = null
      this.path = {
        start: performance.now(),
        duration,
        sample: (time: number) => {
          const t = 0.5 - Math.cos(Math.PI * Math.min(1, time)) / 2
          let k = 0
          while (k < segments - 1 && t > keys[k + 1].t) k++
          const local = (t - keys[k].t) / (keys[k + 1].t - keys[k].t)
          const u = (k + Math.min(1, Math.max(0, local))) / segments
          return { position: positions.getPoint(u), look: looks.getPoint(u) }
        },
        done: () => {
          this.jumpTo(start)
          resolve()
        },
      }
    })
  }

  private currentView(): IsoView {
    const offset = this.camera.position.clone().sub(this.controls.target)
    const spherical = new THREE.Spherical().setFromVector3(offset)
    return {
      x: this.controls.target.x,
      z: this.controls.target.z,
      distance: spherical.radius,
      pitch: THREE.MathUtils.radToDeg(spherical.phi),
      bearing: -THREE.MathUtils.radToDeg(spherical.theta),
    }
  }

  jumpTo(view: IsoView) {
    this.controls.target.set(view.x, 0, view.z)
    this.camera.position
      .setFromSphericalCoords(view.distance, THREE.MathUtils.degToRad(view.pitch), THREE.MathUtils.degToRad(-view.bearing))
      .add(this.controls.target)
    this.camera.lookAt(this.controls.target)
    this.pinsDirty = true
  }

  flyTo(view: IsoView, duration: number, easing: (t: number) => number = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)) {
    return new Promise<void>((resolve) => {
      this.flight?.done()
      this.zoomTarget = null
      const from = this.currentView()
      // turn the short way round
      let bearing = view.bearing
      while (bearing - from.bearing > 180) bearing -= 360
      while (bearing - from.bearing < -180) bearing += 360
      this.flight = { from, to: { ...view, bearing }, start: performance.now(), duration, easing, done: resolve }
    })
  }

  /** Fly so that the given ground box fills the view */
  flyToBounds(bounds: THREE.Box3, duration = 1100) {
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const extent = Math.max(size.x, size.z, 40)
    return this.flyTo({ x: center.x, z: center.z, distance: extent * 2.3, pitch: 32, bearing: 0 }, duration)
  }

  /** Start screen: the Grätzl looks like the rest of the city; it gets its houses and colours once you fly in */
  setGraetzlHighlighted(highlighted: boolean) {
    this.graetzlHighlighted = highlighted
    this.applyGraetzlHighlight()
  }

  private keepForGraetzl(object: THREE.Object3D | null) {
    if (object) this.graetzlObjects.push(object)
  }

  private applyGraetzlHighlight() {
    this.graetzlObjects.forEach((object) => { object.visible = this.graetzlHighlighted })
    if (this.graetzlPlain) this.graetzlPlain.visible = !this.graetzlHighlighted
  }

  setInteractive(enabled: boolean) {
    this.controls.enabled = enabled
  }

  setRevealed(revealed: boolean) {
    this.revealed = revealed
    this.pinLayer.classList.toggle('is-revealed', revealed)
    this.categoryGroups.forEach((group) => group.traverse((object) => {
      const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
      if (material && 'opacity' in material) material.userData.targetOpacity = revealed ? material.userData.baseOpacity : 0
    }))
  }

  // --- data layers -------------------------------------------------------------------------------
  addLayer(layer: MapLayer, category: MapCategory, geojson: GeoJsonFeatureCollection, visible: boolean) {
    if (visible) this.visibleCategories.add(category.id)
    let group = this.categoryGroups.get(category.id)
    if (!group) {
      group = new THREE.Group()
      group.visible = visible
      this.categoryGroups.set(category.id, group)
      this.scene.add(group)
    }
    const makeMaterial = (opacity: number) => {
      const material = new THREE.MeshBasicMaterial({ color: category.color, transparent: true, opacity: this.revealed ? opacity : 0, depthWrite: false })
      material.userData.baseOpacity = opacity
      material.userData.targetOpacity = this.revealed ? opacity : 0
      return material
    }

    for (const feature of geojson.features) {
      const geometry = feature.geometry
      if (!geometry) continue
      const properties = feature.properties ?? {}
      if (layer.geometry === 'point' && geometry.type === 'Point') {
        const [lon, lat] = geometry.coordinates as [number, number]
        this.addPin(layer, category, properties, lonLatToLocal(lon, lat))
        continue
      }
      if (layer.geometry === 'line' && (geometry.type === 'LineString' || geometry.type === 'MultiLineString')) {
        const lines = (geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates) as [number, number][][]
        for (const line of lines) {
          const points = line.map(([lon, lat]) => lonLatToLocal(lon, lat))
          if (points.length < 2) continue
          const mesh = new THREE.Mesh(ribbon(points, 2.6, 0.35), makeMaterial(0.75))
          mesh.renderOrder = 3
          group.add(mesh)
          this.pickables.push({ mesh, feature: { layer, category, properties, bounds: new THREE.Box3().setFromPoints(points) } })
        }
        continue
      }
      if (layer.geometry === 'polygon' && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')) {
        const polys = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as [number, number][][][]
        for (const poly of polys) {
          const local = poly.map((ring) => ring.map(([lon, lat]) => {
            const point = lonLatToLocal(lon, lat)
            return [point.x, -point.z] as [number, number]
          }))
          const shapeGeometry = new THREE.ShapeGeometry(toShape(local))
          shapeGeometry.rotateX(-Math.PI / 2)
          shapeGeometry.translate(0, 0.3, 0)
          const mesh = new THREE.Mesh(shapeGeometry, makeMaterial(layer.id === 'stay' ? 0.32 : 0.24))
          mesh.renderOrder = 2
          group.add(mesh)
          const outline = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(local[0].map(([x, y]) => new THREE.Vector3(x, 0.4, -y))),
            new THREE.LineBasicMaterial({ color: category.color, transparent: true, opacity: 0 }),
          )
          ;(outline.material as THREE.LineBasicMaterial).userData = { baseOpacity: 0.9, targetOpacity: this.revealed ? 0.9 : 0 }
          group.add(outline)
          const bounds = new THREE.Box3().setFromObject(mesh)
          this.pickables.push({ mesh, feature: { layer, category, properties, bounds } })
        }
      }
    }
    this.pinsDirty = true
  }

  /** Colour the building at (or right next to) each point in the accent yellow, like the landmarks in an illustrated map */
  highlightBuildingsAt(points: THREE.Vector3[]) {
    const colour = new THREE.Color()
    const touched = new Set<THREE.BufferAttribute>()
    for (const point of points) {
      const x = point.x
      const y = -point.z
      let best: (typeof this.buildingIndex)[number] | null = null
      let bestDistance = 7
      for (const building of this.buildingIndex) {
        if (!building.inner) continue
        if (inside(building.ring, x, y)) { best = building; break }
        const distance = distanceToRing(building.ring, x, y)
        if (distance < bestDistance) { bestDistance = distance; best = building }
      }
      if (!best) continue
      for (const range of best.ranges) {
        colour.set(range.roof ? COLORS.accentRoof : COLORS.accentWall)
        for (let i = range.start; i < range.start + range.count; i++) range.attribute.setXYZ(i, colour.r, colour.g, colour.b)
        touched.add(range.attribute)
      }
    }
    touched.forEach((attribute) => { attribute.needsUpdate = true })
  }

  /** Garagen-Initiative: the scene for a stage of the tour (null removes it) */
  setGarageStage(stage: GarageStage | null, glide = true) {
    if (!stage) {
      this.garageScene?.dispose()
      this.garageScene = null
      return
    }
    this.ensureGarageScene()?.setStage(stage, glide)
  }

  /** Rectangle the camera should frame for a garage stage (close: the tighter view at the Bahnhof while the cars arrive) */
  garageFocus(stage: GarageStage, close = false) {
    return this.ensureGarageScene()?.focus(stage, close)
  }

  private ensureGarageScene() {
    if (!this.garageScene && this.garageInput) this.garageScene = new GarageScene(this.scene, this.container, this.garageInput, this.handlePinWheel)
    return this.garageScene
  }

  /** Calm houses for the traffic view: every roof of the Grätzl in one quiet tone, so the lanes are what you see */
  setCalmHouses(on: boolean) {
    const calm = new THREE.Color('#efe3cd')
    const touched = new Set<THREE.BufferAttribute>()
    this.buildingIndex.forEach((building) => {
      if (!building.inner) return
      for (const range of building.ranges) {
        if (!range.roof) continue
        const original = this.originalColours.get(range.attribute)
        for (let i = range.start; i < range.start + range.count; i++) {
          if (on) range.attribute.setXYZ(i, calm.r, calm.g, calm.b)
          else if (original) range.attribute.setXYZ(i, original[i * 3], original[i * 3 + 1], original[i * 3 + 2])
        }
        touched.add(range.attribute)
      }
    })
    touched.forEach((attribute) => { attribute.needsUpdate = true })
  }

  setCategoryVisible(categoryId: CategoryId, visible: boolean) {
    if (visible) this.visibleCategories.add(categoryId)
    else this.visibleCategories.delete(categoryId)
    const group = this.categoryGroups.get(categoryId)
    if (group) group.visible = visible
    this.pinsDirty = true
  }

  // --- pins --------------------------------------------------------------------------------------
  private addPin(layer: MapLayer, category: MapCategory, properties: Record<string, unknown>, position: THREE.Vector3) {
    // the one special place without a text of its own is the blue unicorn of the Lichtental: a blue unicorn icon and its own line
    const unicorn = layer.id === 'unicorn' && !kindText(properties)
    if (unicorn) properties = { ...properties, Art: 'Das ikonische blaue Einhorn im Lichtental' }
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'iso-pin'
    // the quotes of the neighbours get a speech bubble in their own colour instead of the culture star
    const quote = layer.id === 'quote'
    element.style.setProperty('--c', unicorn ? UNICORN_BLUE : quote ? QUOTE_COLOR : category.color)
    element.innerHTML = `<img class="iso-pin-icon" src="${unicorn ? unicornMarkerUrl() : quote ? quoteMarkerUrl() : markerUrl(category)}" alt="" />`
    const feature: IsoFeature = { layer, category, properties, bounds: new THREE.Box3(position.clone(), position.clone()).expandByScalar(15), zoneName: this.zoneAt(position)?.name }
    const detail = getDemoDetail({ layerId: layer.id, layerLabel: layer.label, categoryId: category.id, featureId: '', properties })
    element.setAttribute('aria-label', `${layer.label} (${category.label})${detail ? `: ${detail.title}` : ''}`)
    // anchored to the icon: the tooltip stays put while hovering (mouse); a tap shows it the same way (no panel)
    const showInfo = () => {
      const rect = element.querySelector('.iso-pin-icon')!.getBoundingClientRect()
      this.showInfoTooltip(feature, rect.left + rect.width / 2, rect.top)
      // the icon whose text shows gets the active ring (also after a tap on the phone)
      this.activePin?.classList.remove('is-active')
      this.activePin = element
      element.classList.add('is-active')
    }
    element.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') showInfo() })
    element.addEventListener('pointerleave', (event) => { if (event.pointerType === 'mouse') this.hideInfoTooltip() })
    element.addEventListener('wheel', this.handlePinWheel, { passive: false })
    element.addEventListener('focus', showInfo)
    element.addEventListener('blur', () => this.hideInfoTooltip())
    element.addEventListener('click', (event) => {
      event.stopPropagation()
      showInfo()
    })
    this.tapActions.set(element, showInfo)
    this.pinLayer.appendChild(element)
    this.pins.push({ element, position, categoryId: category.id, category, layerId: layer.id, x: 0, y: 0, on: false })
  }

  private showInfoTooltip(feature: IsoFeature, clientX: number, clientY: number) {
    if (this.hoveredFeature !== feature) {
      const detail = getDemoDetail({
        layerId: feature.layer.id,
        layerLabel: feature.layer.label,
        categoryId: feature.category.id,
        featureId: '',
        properties: feature.properties,
      })
      const heading = document.createElement('strong')
      heading.textContent = detail && detail.title !== feature.layer.label ? detail.title : feature.layer.label
      this.infoTooltip.replaceChildren(heading)
      this.hoveredFeature = feature
    }
    const rect = this.container.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const halfWidth = this.infoTooltip.offsetWidth / 2
    this.infoTooltip.style.left = `${Math.max(halfWidth + 12, Math.min(rect.width - halfWidth - 12, x))}px`
    this.infoTooltip.style.top = `${y}px`
    this.infoTooltip.classList.toggle('is-below', y < this.infoTooltip.offsetHeight + 28)
    this.infoTooltip.classList.add('is-visible')
  }

  private activePin: HTMLElement | null = null

  private hideInfoTooltip() {
    this.activePin?.classList.remove('is-active')
    this.activePin = null
    this.hoveredFeature = null
    this.infoTooltip.classList.remove('is-visible')
  }

  /** Area tooltips at the start view: one per area of the Grätzl, kept apart from each other */
  /** Bubbles to the left and right of the Grätzl, each at the height of its area, the tail pointing at it */
  private placeSideTips(width: number, height: number) {
    const toScreen = (point: THREE.Vector3) => {
      const p = point.clone().project(this.camera)
      return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height, z: p.z }
    }
    const outline = this.focusRing.map(toScreen)
    const left = Math.min(...outline.map((p) => p.x))
    const right = Math.max(...outline.map((p) => p.x))
    // the western half of the areas gets its bubble on the left, the eastern half on the right
    const sides = { left: [] as { index: number; y: number }[], right: [] as { index: number; y: number }[] }
    const byX = this.zones.map((zone, index) => ({ index, ...toScreen(zone.centre) })).sort((a, b) => a.x - b.x)
    byX.forEach((entry, order) => sides[order < Math.ceil(byX.length / 2) ? 'left' : 'right'].push({ index: entry.index, y: entry.y }))
    for (const [side, entries] of Object.entries(sides) as ['left' | 'right', typeof sides.left][]) {
      entries.sort((a, b) => a.y - b.y)
      let last = -Infinity
      for (const entry of entries) {
        const y = Math.max(entry.y, last + 58)
        last = y
        // dock onto the edge of the Grätzl at the bubble's own height (the Grätzl is slanted, its widest point is far off)
        const crossings: number[] = []
        for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
          const a = outline[j], b = outline[i]
          if ((a.y > y) !== (b.y > y)) crossings.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
        }
        const edge = crossings.length ? (side === 'left' ? Math.min(...crossings) : Math.max(...crossings)) : (side === 'left' ? left : right)
        const x = side === 'left' ? Math.max(16, edge - 10) : Math.min(width - 16, edge + 10)
        const tip = this.zones[entry.index].tip
        tip.classList.toggle('side-left', side === 'left')
        tip.classList.toggle('side-right', side === 'right')
        tip.style.display = ''
        tip.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
        tip.style.zIndex = '1'
      }
    }
  }

  private placeAreaTips(width: number, height: number) {
    this.zones.forEach((zone) => zone.tip.classList.remove('side-left', 'side-right'))
    const placed: { x: number; y: number }[] = []
    for (const zone of this.zones) {
      const p = zone.centre.clone().project(this.camera)
      const baseX = Math.max(120, Math.min(width - 120, (p.x * 0.5 + 0.5) * width))
      const baseY = (-p.y * 0.5 + 0.5) * height
      const free = (cx: number, cy: number) => !placed.some((other) => Math.abs(other.x - cx) < 205 && Math.abs(other.y - cy) < 56)
      const offsets = [[0, 0], [0, -30], [0, 30], [0, -60], [0, 60], [-110, 0], [110, 0], [-110, -40], [110, 40], [-110, 40], [110, -40], [0, -90], [0, 90]]
      const [dx, dy] = offsets.find(([ox, oy]) => free(baseX + ox, baseY + oy)) ?? [0, 0]
      const x = Math.max(120, Math.min(width - 120, baseX + dx))
      const y = baseY + dy
      placed.push({ x, y })
      zone.tip.style.display = p.z < 1 ? '' : 'none'
      zone.tip.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      zone.tip.style.zIndex = String(Math.round(y))
    }
  }

  /** The area a ground point belongs to (inside one of its blocks, else a nearby street gap). */
  private zoneAt(point: THREE.Vector3) {
    const x = point.x
    const y = -point.z
    if (!inside(this.focusBoundary, x, y)) return null
    let best: (typeof this.zones)[number] | null = null
    let bestDistance = 12
    for (const zone of this.zones) {
      for (const block of zone.blocks) {
        if (inside(block, x, y)) return zone
        const distance = distanceToRing(block, x, y)
        if (distance < bestDistance) { bestDistance = distance; best = zone }
      }
    }
    return best
  }

  /** Keep the hovered area's warm tint and desaturate the other buildings. */
  private highlightZone(zone: (typeof this.zones)[number] | null) {
    if (zone === this.hoveredZone) return
    const tint = new THREE.Color('#ffc24a')
    const colour = new THREE.Color()
    const activeBuildings = new Set(zone?.buildings ?? [])
    for (const target of this.zones) {
      const on = target === zone
      ;(target.ground.material as THREE.MeshBasicMaterial).opacity = on ? 0.42 : 0
      target.tip.classList.toggle('is-hover', on)
      target.item.classList.toggle('is-hover', on)
    }
    const touched = new Set<THREE.BufferAttribute>()
    this.buildingIndex.forEach((building, index) => {
      const active = activeBuildings.has(index)
      for (const range of building.ranges) {
        const original = this.originalColours.get(range.attribute)!
        for (let i = range.start; i < range.start + range.count; i++) {
          colour.fromArray(original, i * 3)
          if (active) {
            colour.lerp(tint, range.roof ? 0.55 : 0.4)
          } else if (zone) {
            const grey = colour.r * 0.2126 + colour.g * 0.7152 + colour.b * 0.0722
            colour.setRGB(
              THREE.MathUtils.lerp(colour.r, grey, 0.55),
              THREE.MathUtils.lerp(colour.g, grey, 0.55),
              THREE.MathUtils.lerp(colour.b, grey, 0.55),
            )
          }
          range.attribute.setXYZ(i, colour.r, colour.g, colour.b)
        }
        touched.add(range.attribute)
      }
    })
    touched.forEach((attribute) => { attribute.needsUpdate = true })
    this.hoveredZone = zone
  }

  private buildZones(source: NonNullable<IsoData['zones']>) {
    // three areas from north to south instead of the five workshop areas (named after their streets)
    const zones = AREA_GROUPS.map((group) => {
      const parts = source.filter((zone) => group.parts.includes(zone.n))
      return parts.length ? {
        n: group.name,
        b: parts.flatMap((zone) => zone.b),
        c: [parts.reduce((sum, zone) => sum + zone.c[0], 0) / parts.length, parts.reduce((sum, zone) => sum + zone.c[1], 0) / parts.length] as [number, number],
      } : null
    }).filter((zone): zone is NonNullable<typeof zone> => zone !== null)
    // north to south, so the side list reads like the map
    for (const zone of [...zones].sort((a, b) => b.c[1] - a.c[1])) {
      const geometries = zone.b.map((ring) => {
        const geometry = new THREE.ShapeGeometry(toShape([ring]))
        geometry.rotateX(-Math.PI / 2)
        geometry.translate(0, 0.15, 0)
        return geometry
      })
      const ground = new THREE.Mesh(mergeGeometries(geometries), new THREE.MeshBasicMaterial({ color: '#ffc24a', transparent: true, opacity: 0, depthWrite: false }))
      ground.renderOrder = 10 // above the beige theme areas (renderOrder 2/3), so the highlighted area is on top
      this.scene.add(ground)
      const points = zone.b.flat().map(([x, y]) => new THREE.Vector3(x, 0, -y))
      const tip = document.createElement('button')
      tip.type = 'button'
      tip.className = 'iso-area'
      tip.innerHTML = `<span class="iso-area-text"><b>${zone.n}</b></span>`
      tip.setAttribute('aria-label', `${zone.n} – heranzoomen`)
      const entry = {
        name: zone.n,
        centre: new THREE.Vector3(zone.c[0], 0, -zone.c[1]),
        blocks: zone.b,
        bounds: new THREE.Box3().setFromPoints(points),
        buildings: this.buildingIndex.flatMap((building, index) => {
          if (!building.inner) return []
          const [x, y] = ringCentre(building.ring)
          return zone.b.some((block) => inside(block, x, y)) ? [index] : []
        }),
        ground,
        tip,
        item: document.createElement('button'),
      }
      tip.addEventListener('pointerenter', () => this.highlightZone(entry))
      tip.addEventListener('pointerleave', () => this.highlightZone(null))
      entry.item.type = 'button'
      entry.item.className = 'iso-area-item'
      entry.item.setAttribute('role', 'listitem')
      entry.item.textContent = zone.n
      entry.item.setAttribute('aria-label', `${zone.n} – heranzoomen`)
      entry.item.addEventListener('pointerenter', () => this.highlightZone(entry))
      entry.item.addEventListener('pointerleave', () => this.highlightZone(null))
      entry.item.addEventListener('focus', () => this.highlightZone(entry))
      entry.item.addEventListener('blur', () => this.highlightZone(null))
      entry.item.addEventListener('click', () => tip.click())
      this.areaList.appendChild(entry.item)
      tip.addEventListener('click', (event) => {
        event.stopPropagation()
        this.highlightZone(null)
        this.callbacks.onZoneClick?.(zone.n)
        const size = entry.bounds.getSize(new THREE.Vector3())
        const centre = entry.bounds.getCenter(new THREE.Vector3())
        const view = this.currentView()
        // close enough that the single places appear (well below the start view distance)
        const distance = Math.min(this.distanceForZoom(startCamera.zoom) * 0.6, Math.max(this.controls.minDistance * 1.6, Math.max(size.x, size.z) * 1.6))
        // into the area straight from above
        this.areaDistance = distance
        void this.flyTo({ ...view, x: centre.x, z: centre.z, distance, pitch: 0, bearing: 0 }, 800)
      })
      this.pinLayer.appendChild(tip)
      this.zones.push(entry)
    }
  }


  private clusterElement(key: string) {
    const existing = this.clusterPool.get(key)
    if (existing) return existing
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'iso-cluster'
    element.innerHTML = '<img alt="" /><b></b>'
    element.addEventListener('wheel', this.handlePinWheel, { passive: false })
    const zoomIn = () => {
      const view = this.currentView()
      // straight in to where the group opens into its single icons (the 'near' tier starts below 145), not to another ring of numbers
      void this.flyTo({ ...view, x: Number(element.dataset.x), z: Number(element.dataset.z), distance: Math.max(this.controls.minDistance, Math.min(view.distance * 0.45, 130)) }, 900)
    }
    element.addEventListener('click', (event) => {
      event.stopPropagation()
      zoomIn()
    })
    this.tapActions.set(element, zoomIn)
    this.pinLayer.appendChild(element)
    this.clusterPool.set(key, element)
    return element
  }

  private updateClusterTier(distance: number) {
    // Wider exit thresholds keep small zoom changes from repeatedly splitting and joining clusters.
    if (this.clusterTier === 'far' && distance < 320) this.clusterTier = 'mid'
    else if (this.clusterTier === 'mid') {
      if (distance > 450) this.clusterTier = 'far'
      else if (distance < 145) this.clusterTier = 'near'
    } else if (this.clusterTier === 'near' && distance > 205) this.clusterTier = 'mid'
    return this.clusterTier
  }

  private placePins() {
    if (!this.pinsDirty && this.lastView.equals(this.camera.matrixWorld)) return
    this.pinsDirty = false
    this.lastView.copy(this.camera.matrixWorld)
    this.placeStreetLabels()
    this.placeDistrictLabels()
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    const projected = new THREE.Vector3()
    // At the start view (and further out) only a handful of theme tooltips; the single places appear when you zoom in
    const overview = !this.freeView && this.camera.position.distanceTo(this.controls.target) > this.distanceForZoom(startCamera.zoom) * 0.8
    this.pinLayer.classList.toggle('is-overview', overview)
    // at the start view the map is locked: only the areas can be clicked; free moving starts once you are in an area
    this.locked = overview
    this.controls.enablePan = !overview
    this.controls.enableRotate = false
    // touch: one finger moves the map, two fingers pinch-zoom (the mouse wheel is handled smoothly by us)
    this.controls.enableZoom = !overview
    this.controlsUi.classList.toggle('is-locked', overview)
    if (this.inAreaView !== !overview) {
      this.inAreaView = !overview
      this.callbacks.onAreaViewChange?.(this.inAreaView)
    }
    if (overview) {
      this.hideInfoTooltip()
      this.pins.forEach((pin) => { pin.element.style.display = 'none' })
      this.clusterPool.forEach((element) => { element.style.display = 'none' })
      // desktop: names in a list at the side (hovering the houses lights them up there); small screens: tooltips on the map
      // desktop: speech bubbles beside the Grätzl (left and right), pointing at their area, so they do not cover the houses;
      // small screens: bubbles on the map
      this.areaList.style.display = 'none'
      if (width >= 900) this.placeSideTips(width, height)
      else this.placeAreaTips(width, height)
      return
    }
    this.zones.forEach((zone) => { zone.tip.style.display = 'none' })
    this.areaList.style.display = 'none'
    this.highlightZone(null)
    for (const pin of this.pins) {
      projected.copy(pin.position).project(this.camera)
      pin.on = this.visibleCategories.has(pin.categoryId) && projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1
      pin.x = (projected.x * 0.5 + 0.5) * width
      pin.y = (-projected.y * 0.5 + 0.5) * height
    }
    const tier = this.updateClusterTier(this.camera.position.distanceTo(this.controls.target))
    const cellSize = tier === 'far' ? 58 : 28
    const groups = new Map<string, Pin[]>()
    this.pins.forEach((pin, index) => {
      if (!this.visibleCategories.has(pin.categoryId)) {
        pin.element.style.display = 'none'
        return
      }
      // World-space cells give every group a fixed identity while the camera moves.
      const key = tier === 'near' ? `pin:${index}` : `${tier}:${Math.floor(pin.position.x / cellSize)}:${Math.floor(pin.position.z / cellSize)}`
      const group = groups.get(key) ?? []
      group.push(pin)
      groups.set(key, group)
    })
    const activeClusters = new Set<string>()
    for (const [key, group] of groups) {
      if (group.length === 1) {
        const pin = group[0]
        pin.element.style.display = pin.on ? '' : 'none'
        if (pin.on) {
          pin.element.style.transform = `translate(${pin.x.toFixed(1)}px, ${pin.y.toFixed(1)}px)`
          pin.element.style.zIndex = String(Math.round(pin.y))
        }
        continue
      }
      group.forEach((member) => { member.element.style.display = 'none' })
      if (!group.some((member) => member.on)) continue
      const centre = new THREE.Vector3(
        group.reduce((sum, member) => sum + member.position.x, 0) / group.length,
        0,
        group.reduce((sum, member) => sum + member.position.z, 0) / group.length,
      )
      projected.copy(centre).project(this.camera)
      const x = (projected.x * 0.5 + 0.5) * width
      const y = (-projected.y * 0.5 + 0.5) * height
      const element = this.clusterElement(key)
      activeClusters.add(key)
      element.style.display = ''
      // artwork of the category most of its members belong to, like the per-category clusters in Mapbox
      const counts = new Map<MapCategory, number>()
      group.forEach((member) => counts.set(member.category, (counts.get(member.category) ?? 0) + 1))
      const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      const image = element.querySelector('img')!
      const url = markerUrl(dominant, true)
      if (image.getAttribute('src') !== url) image.setAttribute('src', url)
      element.querySelector('b')!.textContent = String(group.length)
      element.style.setProperty('--s', `${Math.round(34 + Math.min(1, (group.length - 2) / 10) * 14)}px`)
      element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      element.style.zIndex = String(Math.round(y))
      element.dataset.x = String(centre.x)
      element.dataset.z = String(centre.z)
      element.setAttribute('aria-label', `${group.length} Orte – heranzoomen`)
    }
    this.clusterPool.forEach((element, key) => {
      if (!activeClusters.has(key)) element.style.display = 'none'
    })
  }

  // --- smooth zoom towards the cursor (like Mapbox's scroll zoom) --------------------------------
  private groundPoint(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(pointer, this.camera)
    const hit = new THREE.Vector3()
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ? hit : this.controls.target.clone()
  }

  private zoomAt(clientX: number, clientY: number, factor: number) {
    if (!this.controls.enabled || this.locked || this.flight || this.path) return
    const current = this.zoomTarget?.distance ?? this.camera.position.distanceTo(this.controls.target)
    this.zoomTarget = {
      distance: THREE.MathUtils.clamp(current * factor, this.controls.minDistance, this.controls.maxDistance),
      anchor: this.groundPoint(clientX, clientY),
    }
  }

  private handleWheel = (event: WheelEvent) => {
    event.preventDefault()
    event.stopImmediatePropagation()
    const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY
    // trackpad pinch arrives as wheel + ctrlKey with small deltas
    const factor = Math.exp(THREE.MathUtils.clamp(pixels, -240, 240) * (event.ctrlKey ? 0.01 : 0.0022))
    this.zoomAt(event.clientX, event.clientY, factor)
  }

  /** Icons sit above the canvas: zoom with the wheel works over them too */
  private handlePinWheel = (event: WheelEvent) => {
    this.hideInfoTooltip()
    this.handleWheel(event)
  }

  private handleDoubleClick = (event: MouseEvent) => {
    this.zoomAt(event.clientX, event.clientY, event.shiftKey ? 2 : 0.5)
  }

  /** One frame of the smooth zoom: scale camera and target about the point under the cursor, so it stays put */
  private stepZoom() {
    if (!this.zoomTarget) return
    const distance = this.camera.position.distanceTo(this.controls.target)
    const next = Math.exp(THREE.MathUtils.lerp(Math.log(distance), Math.log(this.zoomTarget.distance), 0.22))
    const scale = next / distance
    const anchor = this.zoomTarget.anchor
    this.camera.position.sub(anchor).multiplyScalar(scale).add(anchor)
    this.controls.target.sub(anchor).multiplyScalar(scale).add(anchor)
    if (Math.abs(Math.log(this.zoomTarget.distance / next)) < 0.002) this.zoomTarget = null
    this.controls.dispatchEvent({ type: 'change' })
  }

  // --- street names ------------------------------------------------------------------------------
  private addStreetLabels(streets: IsoData['streets'], focus: Ring) {
    for (const street of streets) {
      const line = street.l
      if (line.length < 2) continue
      // label each longer segment of the street axis once, at its middle
      let length = 0
      for (let i = 1; i < line.length; i++) length += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
      if (length < 45) continue
      let walked = 0
      let middle = 0
      for (let i = 1; i < line.length; i++) {
        walked += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
        if (walked >= length / 2) { middle = i; break }
      }
      const [ax, ay] = line[middle - 1]
      const [bx, by] = line[middle]
      const mx = (ax + bx) / 2
      const my = (ay + by) / 2
      if (!inside(focus, mx, my) && distanceToRing(focus, mx, my) > 30) continue
      const element = document.createElement('span')
      element.className = 'iso-street'
      element.textContent = street.n
      this.streetLayer.appendChild(element)
      this.streetLabels.push({ element, name: street.n, a: new THREE.Vector3(ax, 0.5, -ay), b: new THREE.Vector3(bx, 0.5, -by), mid: new THREE.Vector3(mx, 0.5, -my), width: street.n.length * 6.6 + 8 })
    }
    this.pinsDirty = true
  }

  /** District names only from high above; they fade out on the way down to the Grätzl */
  private placeDistrictLabels() {
    const distance = this.camera.position.distanceTo(this.controls.target)
    const opacity = THREE.MathUtils.clamp((distance - 2500) / 2500, 0, 1)
    this.districtLayer.style.opacity = String(opacity)
    if (!opacity) return
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    for (const label of this.districtLabels) {
      const p = label.position.clone().project(this.camera)
      const visible = p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05
      label.element.style.display = visible ? '' : 'none'
      if (visible) label.element.style.transform = `translate(${((p.x * 0.5 + 0.5) * width).toFixed(1)}px, ${((-p.y * 0.5 + 0.5) * height).toFixed(1)}px) translate(-50%, -50%)`
    }
  }

  private placeStreetLabels() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    const toScreen = (point: THREE.Vector3) => {
      const p = point.clone().project(this.camera)
      return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height, z: p.z }
    }
    const placed: { x: number; y: number; r: number; name: string }[] = []
    for (const label of this.streetLabels) {
      const mid = toScreen(label.mid)
      const a = toScreen(label.a)
      const b = toScreen(label.b)
      const segment = Math.hypot(b.x - a.x, b.y - a.y)
      const radius = label.width / 2
      const visible = mid.z < 1 && mid.x > -40 && mid.x < width + 40 && mid.y > -20 && mid.y < height + 20
        && segment > label.width * 0.9
        // garages: no street name over the house Liechtensteinstraße 87–89 where the cars park
        && !(this.garageScene && this.garageInput?.garage.some((ring) => ring.some(([x, y]) => Math.hypot(x - label.mid.x, y + label.mid.z) < 45)))
        && !placed.some((other) => Math.hypot(other.x - mid.x, other.y - mid.y) < other.r + radius || (other.name === label.name && Math.hypot(other.x - mid.x, other.y - mid.y) < 320))
      label.element.style.display = visible ? '' : 'none'
      if (!visible) continue
      placed.push({ x: mid.x, y: mid.y, r: radius, name: label.name })
      let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
      if (angle > 90) angle -= 180
      if (angle < -90) angle += 180
      label.element.style.transform = `translate(${mid.x.toFixed(1)}px, ${mid.y.toFixed(1)}px) translate(-50%, -50%) rotate(${angle.toFixed(1)}deg)`
    }
  }

  // --- pointer -----------------------------------------------------------------------------------
  private pick(event: MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(pointer, this.camera)
    const candidates = this.pickables.filter((item) => item.mesh.parent?.visible)
    const hits = this.raycaster.intersectObjects(candidates.map((item) => item.mesh), false)
    if (!hits.length) return null
    // lines before areas
    const sorted = hits.map((hit) => candidates.find((item) => item.mesh === hit.object)!).sort((a, b) => b.mesh.renderOrder - a.mesh.renderOrder)
    return sorted[0]
  }

  private pointerDown = { x: 0, y: 0 }
  private handlePointerDown = (event: PointerEvent) => {
    this.pointerDown = { x: event.clientX, y: event.clientY }
  }
  private handleClick = (event: MouseEvent) => {
    if (this.suppressClick) {
      this.suppressClick = false
      return
    }
    if (!this.controls.enabled || !this.revealed) return
    // a drag (pan / rotate) is not a click
    if (Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y) > 5) return
    if (this.freeView) return
    if (this.pinLayer.classList.contains('is-overview') && this.hoveredZone) {
      this.hoveredZone.tip.click()
      return
    }
    // touch: the icons let touches through, so a tap on one arrives here
    for (const [element, action] of this.tapActions) {
      if (this.pinLayer.classList.contains('is-pins-hidden')) break
      if (element.style.display === 'none' || !element.isConnected) continue
      const rect = element.getBoundingClientRect()
      if (event.clientX >= rect.left - 4 && event.clientX <= rect.right + 4 && event.clientY >= rect.top - 4 && event.clientY <= rect.bottom + 4) {
        action()
        return
      }
    }
    const hit = this.pick(event)
    this.hideInfoTooltip()
    // the park zooms in; everything else just shows its text at the spot (like on hover), no panel
    if (hit && hit.feature.layer.id === 'stay') this.callbacks.onFeatureClick({ ...hit.feature, zoneName: this.zoneAt(hit.feature.bounds.getCenter(new THREE.Vector3()))?.name })
    else if (hit) this.showInfoTooltip(hit.feature, event.clientX, event.clientY)
    else this.callbacks.onBackgroundClick()
  }

  private handleHover = (event: PointerEvent) => {
    if (!this.controls.enabled || !this.revealed || event.buttons) return
    if (this.freeView) {
      this.renderer.domElement.style.cursor = ''
      return
    }
    if (this.pinLayer.classList.contains('is-overview')) {
      this.hideInfoTooltip()
      const zone = this.zoneAt(this.groundPoint(event.clientX, event.clientY))
      this.highlightZone(zone)
      this.renderer.domElement.style.cursor = zone ? 'pointer' : ''
      return
    }
    const hit = this.pick(event)
    this.renderer.domElement.style.cursor = hit ? 'pointer' : ''
    if (hit) this.showInfoTooltip(hit.feature, event.clientX, event.clientY)
    else this.hideInfoTooltip()
  }

  private handlePointerLeave = () => {
    this.highlightZone(null)
    this.hideInfoTooltip()
    this.renderer.domElement.style.cursor = ''
  }

  // --- controls UI (zoom / reset), styled like the former Mapbox controls ------------------------
  private createControlsUi() {
    const icon = (path: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
    const wrapper = document.createElement('div')
    wrapper.className = 'mapboxgl-control-container iso-controls is-locked'
    wrapper.innerHTML = `<div class="mapboxgl-ctrl-bottom-left"><div class="iso-ctrl">
      <button class="iso-zoom-in" type="button" aria-label="Hineinzoomen">${icon('<path d="M12 5v14M5 12h14"/>')}</button>
      <button class="iso-zoom-out" type="button" aria-label="Herauszoomen">${icon('<path d="M5 12h14"/>')}</button>
    </div></div>
`
    const zoom = (factor: number) => {
      if (!this.controls.enabled || this.locked) return
      const view = this.currentView()
      void this.flyTo({ ...view, distance: THREE.MathUtils.clamp(view.distance * factor, this.controls.minDistance, this.controls.maxDistance) }, 350)
    }
    wrapper.querySelector('.iso-zoom-in')!.addEventListener('click', () => zoom(0.6))
    wrapper.querySelector('.iso-zoom-out')!.addEventListener('click', () => zoom(1.65))
    return wrapper
  }

  // --- Vienna backdrop for the intro -----------------------------------------------------------
  private buildCityBackdrop(city: ViennaData, paintFlat: (mesh: THREE.Mesh) => void) {
    this.stephansdom.set(city.stephansdom[0], 0, -city.stephansdom[1])
    const flatMesh = (polys: Poly[], color: string) => {
      const geometries = polys.flatMap((poly) => {
        try {
          const geometry = new THREE.ShapeGeometry(toShape(poly))
          geometry.rotateX(-Math.PI / 2)
          return [geometry]
        } catch {
          return []
        }
      })
      if (geometries.length) paintFlat(new THREE.Mesh(mergeGeometries(geometries), new THREE.MeshBasicMaterial({ color })))
    }
    // building blocks also cover parks and the river, so they go first and land use is painted over them
    flatMesh([[city.boundary]], CITY.land)
    flatMesh(city.blocks, CITY.blocks)
    flatMesh(city.fields, CITY.fields)
    flatMesh(city.green, CITY.green)
    flatMesh(city.water, CITY.water)
    const roads = city.roads.filter((road) => road.l.length > 1).map((road) => ribbon(road.l.map(([x, y]) => new THREE.Vector3(x, 0, -y)), road.w ? 16 : 10, 0))
    if (roads.length) paintFlat(new THREE.Mesh(mergeGeometries(roads), new THREE.MeshLambertMaterial({ color: CITY.roads })))
    // district borders as broad soft bands (readable from high above) plus the city boundary
    const band = (rings: Ring[], width: number, color: string) => {
      const geometries = rings.map((ring) => ribbon(ring.map(([x, y]) => new THREE.Vector3(x, 0, -y)), width, 0))
      paintFlat(new THREE.Mesh(mergeGeometries(geometries), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })))
    }
    band(city.districts.map((district) => district.r), 26, CITY.districts)
    band([city.boundary], 60, CITY.boundary)
    for (const district of city.districts) {
      const element = document.createElement('span')
      element.className = `iso-district${district.b === 9 ? ' is-home' : ''}`
      element.textContent = district.n
      this.districtLayer.appendChild(element)
      this.districtLabels.push({ element, position: new THREE.Vector3(district.c[0], 0, -district.c[1]) })
    }
    this.pinsDirty = true
  }

  // --- city --------------------------------------------------------------------------------------
  private async buildCity() {
    const [data, city] = await Promise.all([
      fetch('iso/graetzl.json').then((response) => response.json() as Promise<IsoData>),
      fetch('iso/vienna.json').then((response) => response.json() as Promise<ViennaData>).catch(() => null),
    ])
    if (this.disposed) return

    // Flat ground layers lie (almost) in one plane. They do not write depth and are painted in a fixed order,
    // so nothing flickers even when the camera is kilometres above the city.
    let layerOrder = -100
    const paintFlat = (mesh: THREE.Mesh) => {
      ;(mesh.material as THREE.Material).depthWrite = false
      mesh.renderOrder = layerOrder++
      mesh.receiveShadow = true
      this.scene.add(mesh)
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160000, 160000), new THREE.MeshLambertMaterial({ color: COLORS.groundOutside }))
    ground.rotateX(-Math.PI / 2)
    paintFlat(ground)
    if (city) this.buildCityBackdrop(city, paintFlat)
    // the Grätzl itself sits on warm paper
    const plate = new THREE.Mesh(new THREE.ShapeGeometry(toShape([data.focus])), new THREE.MeshLambertMaterial({ color: COLORS.ground }))
    plate.geometry.rotateX(-Math.PI / 2)
    plate.geometry.translate(0, 0.01, 0)
    paintFlat(plate)
    this.graetzlObjects.push(plate)
    const inFocus = (poly: Poly) => inside(data.focus, poly[0][0][0], poly[0][0][1])
    const split = (polys: Poly[]) => [polys.filter(inFocus), polys.filter((poly) => !inFocus(poly))] as const

    const flat = (polys: Poly[], color: string, y: number, unlit = false) => {
      if (!polys.length) return null
      const geometries = polys.map((poly) => {
        const geometry = new THREE.ShapeGeometry(toShape(poly))
        geometry.rotateX(-Math.PI / 2)
        geometry.translate(0, y, 0)
        return geometry
      })
      const mesh = new THREE.Mesh(mergeGeometries(geometries), unlit ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }))
      paintFlat(mesh)
      return mesh
    }
    flat(data.roads, COLORS.road, 0.03)
    flat(data.zebra, COLORS.zebra, 0.04)
    const [greenIn, greenOut] = split(data.green)
    const [waterIn, waterOut] = split(data.water)
    const [sportIn, sportOut] = split(data.sport)
    this.keepForGraetzl(flat(greenIn, COLORS.green, 0.05))
    // around the Grätzl: whole building blocks as one calm tone (no single houses), with their green bits on top
    flat(data.outsideBlocks ?? [], CITY.blocks, 0.045, true)
    // only the larger green spaces, the tiny bits made it restless
    flat(greenOut.filter((poly) => ringArea(poly[0]) > 600), OUTSIDE.green, 0.05, true)
    this.keepForGraetzl(flat(waterIn, COLORS.water, 0.06))
    flat(waterOut, OUTSIDE.water, 0.06)
    this.keepForGraetzl(flat(sportIn, COLORS.sport, 0.07))
    flat(sportOut, OUTSIDE.sport, 0.07)

    // buildings: one wall mesh and one roof mesh, coloured per vertex so single buildings can become accents
    const walls: THREE.BufferGeometry[] = []
    const roofs: THREE.BufferGeometry[] = []
    const pending: { index: number; part: THREE.BufferGeometry; roof: boolean }[] = []
    const colour = new THREE.Color()
    for (const building of data.buildings) {
      const height = (building.h - building.b) * HEIGHT_SCALE
      if (height < 0.6) continue
      // outside the Grätzl everything stays flat: just the footprint on the ground
      if (!inside(data.focus, building.p[0][0][0], building.p[0][0][1])) {
        continue
      }
      // soft buildings: rounded vertical corners and, where the footprint is wide enough, a rounded roof edge
      const rounded = building.p.map((ring) => roundRing(ring, CORNER_RADIUS))
      const bevel = footprintWidth(building.p[0]) > 5 && height > 2 * EDGE_BEVEL + 1
      const geometry = new THREE.ExtrudeGeometry(toShape(rounded), bevel
        ? { depth: height - EDGE_BEVEL, bevelEnabled: true, bevelThickness: EDGE_BEVEL, bevelSize: EDGE_BEVEL, bevelOffset: -EDGE_BEVEL, bevelSegments: 3 }
        : { depth: height, bevelEnabled: false })
      geometry.rotateX(-Math.PI / 2)
      geometry.translate(0, building.b * HEIGHT_SCALE + (bevel ? EDGE_BEVEL : 0), 0)
      const [x, y] = building.p[0][0]
      const isInner = inside(data.focus, x, y)
      const index = this.buildingIndex.push({ ring: building.p[0], inner: isInner, ranges: [] }) - 1
      for (const { part, material } of splitGroups(geometry)) {
        const roof = material === 0
        colour.set(roof ? (isInner ? roofTone(building.g ?? index) : COLORS.roofOutside) : (isInner ? COLORS.wallInside : COLORS.wallOutside))
        const count = part.getAttribute('position').count
        const colours = new Float32Array(count * 3)
        for (let i = 0; i < count; i++) colour.toArray(colours, i * 3)
        part.setAttribute('color', new THREE.BufferAttribute(colours, 3))
        ;(roof ? roofs : walls).push(part)
        pending.push({ index, part, roof })
      }
      geometry.dispose()
    }
    const wallMesh = new THREE.Mesh(mergeGeometries(walls), new THREE.MeshLambertMaterial({ vertexColors: true }))
    const roofMesh = new THREE.Mesh(mergeGeometries(roofs), new THREE.MeshLambertMaterial({ vertexColors: true }))
    for (const mesh of [wallMesh, roofMesh]) { mesh.castShadow = true; mesh.receiveShadow = true }
    this.scene.add(wallMesh, roofMesh)
    this.graetzlObjects.push(wallMesh, roofMesh)
    // remember where every building sits inside the merged colour buffers
    const offsets = { wall: 0, roof: 0 }
    for (const { index, part, roof } of pending) {
      const count = part.getAttribute('position').count
      const target = (roof ? roofMesh : wallMesh).geometry.getAttribute('color') as THREE.BufferAttribute
      this.buildingIndex[index].ranges.push({ attribute: target, start: roof ? offsets.roof : offsets.wall, count, roof })
      if (roof) offsets.roof += count
      else offsets.wall += count
      part.dispose()
    }

    // trees: the street trees from the tree register plus many small trees scattered over green areas (courtyards, parks)
    const random = seeded(17)
    const trees: [number, number, number, number][] = data.trees.map(([x, y, crown, height]) => [x, y, Math.max(1.6, crown / 2), Math.max(5, height)])
    for (const poly of data.green) {
      const ring = poly[0]
      const area = ringArea(ring)
      if (area < 25) continue
      const wanted = Math.min(70, Math.floor(area / 55))
      const xs = ring.map((p) => p[0])
      const ys = ring.map((p) => p[1])
      const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      for (let tries = 0, placed = 0; placed < wanted && tries < wanted * 6; tries++) {
        const x = minX + random() * (maxX - minX)
        const y = minY + random() * (maxY - minY)
        if (!inside(ring, x, y) || distanceToRing(ring, x, y) < 1.5) continue
        const r = 1.2 + random() * 1.3
        trees.push([x, y, r, r * 2 + 2.5 + random() * 2.5])
        placed++
      }
      if (trees.length > 6000) break
    }
    // trees in the Grätzl stand in 3D; outside they are flat discs on the ground, like the buildings there
    const standing = trees.filter(([x, y]) => inside(data.focus, x, y))
    this.standingTrees = standing.map(([x, y, r]) => ({ x, z: -y, r }))
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), standing.length)
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.26, 1, 5), new THREE.MeshLambertMaterial({ color: COLORS.trunk }), standing.length)
    const matrix = new THREE.Matrix4()
    const greens = TREE_GREENS.map((c) => new THREE.Color(c))
    standing.forEach(([x, y, r, top], i) => {
      matrix.compose(new THREE.Vector3(x, top - r * 0.9, -y), new THREE.Quaternion(), new THREE.Vector3(r, r * 1.08, r))
      crowns.setMatrixAt(i, matrix)
      crowns.setColorAt(i, greens[i % greens.length])
      const trunkHeight = Math.max(0.5, top - r * 1.6)
      matrix.compose(new THREE.Vector3(x, trunkHeight / 2, -y), new THREE.Quaternion(), new THREE.Vector3(1, trunkHeight, 1))
      trunks.setMatrixAt(i, matrix)
    })
    crowns.castShadow = true
    trunks.castShadow = true
    this.scene.add(crowns, trunks)
    this.standingMeshes = {
      meshes: [crowns, trunks],
      matrices: [crowns, trunks].map((mesh) => standing.map((_, i) => { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); return m })),
    }
    this.graetzlObjects.push(crowns, trunks)
    // trees outside the Grätzl are left out, the surroundings stay calm

    const outline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(data.focus.map(([x, y]) => new THREE.Vector3(x, 0.3, -y))),
      new THREE.LineBasicMaterial({ color: '#9b97cf' }),
    )
    this.scene.add(outline)
    this.graetzlObjects.push(outline)
    // the Grätzl drawn like its surroundings: its blocks as flat areas (shown while it is not highlighted)
    const plainBlocks = (data.zones ?? []).flatMap((zone) => zone.b.map((ring) => [ring] as Poly))
    this.graetzlPlain = flat(plainBlocks, CITY.blocks, 0.09, true)
    this.applyGraetzlHighlight()
    // remember the building colours, so a highlighted area can be painted back exactly
    for (const mesh of [wallMesh, roofMesh]) {
      const attribute = mesh.geometry.getAttribute('color') as THREE.BufferAttribute
      this.originalColours.set(attribute, (attribute.array as Float32Array).slice())
    }
    this.focusRing = data.focus.map(([x, y]) => new THREE.Vector3(x, 0, -y))
    this.focusBoundary = data.focus
    this.buildZones(data.zones ?? [])
    this.streetSegments = (data.streets ?? []).flatMap((street) => street.l.slice(1).map((point, i) => [street.l[i][0], street.l[i][1], point[0], point[1]] as [number, number, number, number]))
    this.garageInput = {
      focus: data.focus,
      streets: this.streetSegments,
      buildings: data.buildings.filter((building) => inside(data.focus, building.p[0][0][0], building.p[0][0][1])).map((building) => building.p[0]),
      green: data.green.map((poly) => poly[0]).filter((ring) => inside(data.focus, ring[0][0], ring[0][1])),
      // the Franz-Josefs-Bahnhof / Althan Quartier complex is one building group in the Stadt Wien data
      station: data.buildings.filter((building) => building.g === 50929).map((building) => building.p[0]),
      // the house Liechtensteinstraße 87–89 with the garage (outside the Grätzl, so it is not drawn in 3D)
      garage: data.buildings.filter((building) => building.g === 4578).map((building) => building.p[0]),
    }
    this.addStreetLabels(data.streets ?? [], data.focus)
    this.graetzlReady = true
    this.setBasePedestrianZones(this.basePedWanted.show, this.basePedWanted.faint)
    // first frame with the full city compiled before the intro reveals it
    this.renderer.compile(this.scene, this.camera)
    this.renderer.render(this.scene, this.camera)
  }

  // --- loop --------------------------------------------------------------------------------------
  private frame = (now: number) => {
    if (this.coolTexture) this.coolTexture.offset.x = -((now / 1000) * 0.2) % 1
    if (this.trafficFlowTexture) this.trafficFlowTexture.offset.x = -((now / 1000) * this.trafficSpeed) % 1
    if (this.trafficLeaving || this.trafficAnim || this.pedAnim) this.stepTrafficTransition(now)
    if (this.path) {
      const time = (now - this.path.start) / this.path.duration
      const { position, look } = this.path.sample(time)
      this.camera.position.copy(position)
      this.controls.target.copy(look)
      this.camera.lookAt(look)
      this.pinsDirty = true
      if (time >= 1) {
        const done = this.path.done
        this.path = null
        done()
      }
    } else if (this.flight) {
      const { from, to, start, duration, easing } = this.flight
      const t = Math.min(1, (now - start) / duration)
      const e = easing(t)
      this.jumpTo({
        x: THREE.MathUtils.lerp(from.x, to.x, e),
        z: THREE.MathUtils.lerp(from.z, to.z, e),
        distance: Math.exp(THREE.MathUtils.lerp(Math.log(from.distance), Math.log(to.distance), e)),
        pitch: THREE.MathUtils.lerp(from.pitch, to.pitch, e),
        bearing: THREE.MathUtils.lerp(from.bearing, to.bearing, e),
      })
      if (t >= 1) {
        const done = this.flight.done
        this.flight = null
        done()
      }
    } else if (this.controls.enabled) {
      this.stepZoom()
      this.controls.update()
      const limit = Math.min(this.distanceForZoom(startCamera.zoom) * 0.72, (this.areaDistance ?? Infinity) * 1.3)
      const distance = this.camera.position.distanceTo(this.controls.target)
      const startDistance = this.distanceForZoom(startCamera.zoom)
      // the start view is fixed: if anything moved the camera away from it, glide back
      if (this.revealed && this.locked && Math.abs(distance / startDistance - 1) > 0.08) {
        this.zoomTarget = null
        void this.flyTo(this.startView(), 500)
      } else if (this.revealed && !this.locked && !this.freeView && distance > limit) {
        this.zoomTarget = null
        this.areaDistance = null
        this.locked = true
        void this.flyTo(this.startView(), 650)
      }
    }
    const distance = this.camera.position.distanceTo(this.controls.target)
    const fog = this.scene.fog as THREE.Fog
    if (this.path) {
      // during the intro flight the haze follows the altitude, so the Grätzl stays visible behind Stephansdom
      const altitude = Math.max(50, this.camera.position.y)
      fog.near = 1600 + altitude * 2.2
      fog.far = 4200 + altitude * 5
    } else {
      fog.near = distance * 1.15
      fog.far = distance * 2.8
    }
    // fade data layers in / out
    this.categoryGroups.forEach((group) => group.traverse((object) => {
      const material = (object as THREE.Mesh).material as THREE.Material | undefined
      if (!material || material.userData.targetOpacity === undefined) return
      material.opacity += (material.userData.targetOpacity - material.opacity) * 0.12
    }))
    this.renderer.render(this.scene, this.camera)
    this.placePins()
    this.garageScene?.update(this.camera, this.container.clientWidth, this.container.clientHeight)
    this.stepTreePulse(performance.now())
    this.callbacks.onZoom?.(startCamera.zoom + Math.log2(this.distanceForZoom(startCamera.zoom) / this.camera.position.distanceTo(this.controls.target)))

  }

  private resize() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    if (!width || !height) return
    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.pinsDirty = true
  }

  dispose() {
    this.disposed = true
    this.handleHoldEnd()
    this.container.removeEventListener('pointerdown', this.handleHoldDown)
    this.container.removeEventListener('pointermove', this.handleHoldMove)
    this.container.removeEventListener('pointerup', this.handleHoldEnd)
    this.container.removeEventListener('pointercancel', this.handleHoldEnd)
    this.container.removeEventListener('pointerleave', this.handleHoldEnd)
    this.container.removeEventListener('contextmenu', this.handleContextMenu)
    this.setTreesView(false)
    this.setCoolZone(false)
    this.setGarageStage(null)
    this.disposePlans()
    this.setTrafficMode(null)
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown)
    this.renderer.domElement.removeEventListener('click', this.handleClick)
    this.renderer.domElement.removeEventListener('pointermove', this.handleHover)
    this.renderer.domElement.removeEventListener('pointerleave', this.handlePointerLeave)
    this.renderer.domElement.removeEventListener('wheel', this.handleWheel, { capture: true })
    this.renderer.domElement.removeEventListener('dblclick', this.handleDoubleClick)
    this.renderer.dispose()
    this.container.replaceChildren()
  }
}
