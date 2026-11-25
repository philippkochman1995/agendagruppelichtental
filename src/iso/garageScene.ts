// Garagen-Initiative: parked cars leave the streets of the Grätzl.
// Bestand: the cars parked along the streets. Neu, step by step:
// 1 Bahnhof: cars glide into the garage under the Franz-Josefs-Bahnhof (Althan Quartier) and line up there.
// 2 Garage: cars glide into the garage Liechtensteinstraße 87–89 and line up inside the house.
// 3 Sharing: car-sharing cars appear on three streets, a few private cars next to them disappear.
// 4 Ladezonen: the loading zones of the traffic concept appear as yellow road markings, the cars on them leave.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type Ring = [number, number][]

export type GarageStage = 'start' | 'station' | 'garage' | 'sharing' | 'loading' | 'all'
const STAGE_INDEX: Record<GarageStage, number> = { start: 0, station: 1, garage: 2, sharing: 3, loading: 4, all: 5 }

export interface GarageInput {
  /** outline of the Grätzl (x east, y north, metres) */
  focus: Ring
  /** street axes (x1, y1, x2, y2) */
  streets: [number, number, number, number][]
  /** footprints of the houses in the Grätzl: no parked car may stand in a house */
  buildings: Ring[]
  /** green areas and parks: no cars there either */
  green: Ring[]
  /** footprints of the Franz-Josefs-Bahnhof / Althan Quartier complex */
  station: Ring[]
  /** footprints of the house with the garage Liechtensteinstraße 87–89 */
  garage: Ring[]
}

/** Garage Liechtensteinstraße 87–89 (OpenStreetMap address point), in case the house is missing */
const GARAGE: [number, number] = [-122, -69]
/** Car-sharing spots, laid onto the nearest street: Fechtergasse (the tour looks there), Lichtentaler Gasse at the park, Badgasse */
const SHARING_SPOTS: [number, number][] = [[-63, -141], [-7, 17], [52, 150]]
/** Loading zones of the traffic concept (positions read off the plan, about ±10 m; laid onto the nearest street when built) */
const LOADING_ZONES: { at: [number, number]; length: number }[] = [
  { at: [-108.6, 221], length: 13 },
  { at: [-45.4, 143.3], length: 20 },
  { at: [81.6, 55.5], length: 20 },
  { at: [83.3, -83.5], length: 16 },
]
/** cars are drawn a bit larger than life, so they read at the distances the tour looks from */
const CAR_SCALE = 1.5
const CAR_COLOURS = ['#d8d3ca', '#8e99a6', '#45525f', '#b4574d', '#ece8e1', '#6a86a3', '#c9b48f', '#3c4a3f']
/** time a car takes to glide into its garage, and the pause before the next one sets off (ms) */
const GLIDE = 2300
const STAGGER = 150

function pointInRing(ring: Ring, x: number, y: number) {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

function distanceToRing(ring: Ring, x: number, y: number) {
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i]
    const dx = bx - ax, dy = by - ay
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)))
  }
  return best
}

const world = (x: number, y: number, height = 0) => new THREE.Vector3(x, height, -y)

interface Spot { x: number; y: number; angle: number }
interface Car {
  object: THREE.Group
  home: Spot
  target: Spot | null
  /** stage at which the car leaves its street spot (0 = stays) */
  stage: number
  /** place in the queue of its stage: the cars set off one after the other */
  order: number
  /** the car fades away on its spot (it makes room for car sharing or a loading zone) */
  vanish: 'fade' | null
  placed: 'home' | 'target'
  /** quick: Bestand / Neu switched, the car just fades (no glide) */
  anim: { start: number; delay: number; quick?: boolean } | null
  /** time the car appeared at its new place (Bestand / Neu switched): it fades in */
  fadeIn: number | null
}
interface Mark { element: HTMLDivElement; position: THREE.Vector3; stage: number }

/** Low-poly car like the rest of the map: body, cabin and, for car sharing, a roof stripe. Length along +x. */
function makeCar(geometries: { body: THREE.BufferGeometry; cabin: THREE.BufferGeometry; stripe: THREE.BufferGeometry }, colour: string, sharing = false, shared?: Map<string, THREE.Material[]>) {
  const car = new THREE.Group()
  const cached = shared?.get(colour)
  if (cached) {
    const body = new THREE.Mesh(geometries.body, cached[0])
    body.position.y = 0.75
    const cabin = new THREE.Mesh(geometries.cabin, cached[1])
    cabin.position.set(-0.25, 1.42, 0)
    car.add(body, cabin)
    car.traverse((child) => { if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).castShadow = true })
    return car
  }
  const body = new THREE.Mesh(geometries.body, new THREE.MeshLambertMaterial({ color: colour, transparent: true }))
  body.position.y = 0.75
  const cabin = new THREE.Mesh(geometries.cabin, new THREE.MeshLambertMaterial({ color: sharing ? '#e9fbf8' : '#a9b9c6', transparent: true }))
  cabin.position.set(-0.25, 1.42, 0)
  car.add(body, cabin)
  shared?.set(colour, [body.material, cabin.material])
  if (sharing) {
    const stripe = new THREE.Mesh(geometries.stripe, new THREE.MeshLambertMaterial({ color: '#0e7f74', transparent: true }))
    stripe.position.set(-0.25, 1.75, 0)
    car.add(stripe)
  }
  car.traverse((child) => { if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).castShadow = true })
  return car
}

function setOpacity(object: THREE.Object3D, opacity: number) {
  object.traverse((child) => {
    const material = (child as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined
    if (material) material.opacity = opacity
  })
}

/** Yellow zig-zag marking of a loading zone, 20 × 3.6 m */
function loadingTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 280
  canvas.height = 50
  const context = canvas.getContext('2d')!
  context.fillStyle = 'rgba(255, 205, 40, 0.45)'
  context.fillRect(0, 0, 280, 50)
  context.strokeStyle = '#e8a800'
  context.lineWidth = 6
  context.lineJoin = 'round'
  context.strokeRect(3, 3, 274, 44)
  context.beginPath()
  for (let i = 0; i <= 14; i++) context.lineTo(6 + i * 19, i % 2 ? 42 : 8)
  context.stroke()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

const ICONS = {
  parking: '<b>P</b>',
  sharing: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 16V11l2-4.5h10L19 11v5" /><path d="M3.5 16h17" /><circle cx="7.5" cy="16.5" r="1.6" /><circle cx="16.5" cy="16.5" r="1.6" /><path d="M9 4.5c1.8-1.4 4.2-1.4 6 0" /></svg>',
  loading: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.5h11v9h-11z" /><path d="M13.5 9.5h4l3 3v3h-7" /><circle cx="6" cy="17" r="1.6" /><circle cx="17" cy="17" r="1.6" /></svg>',
}

export class GarageScene {
  private readonly root = new THREE.Group()
  private readonly marks: Mark[] = []
  private readonly layer: HTMLDivElement
  private readonly cars: Car[] = []
  private readonly stageGroups = new Map<number, THREE.Object3D[]>()
  private readonly disposables: { dispose(): void }[] = []
  private stage = -1
  private readonly sharingCars: THREE.Group[] = []
  private sharingAnim: number | null = null
  private sharingSpots: Spot[] = []
  private loadingSpots: (Spot & { length: number })[] = []
  private stationSlots: Spot[] = []
  private stationLabel: [number, number] = [215, -30]

  constructor(
    private readonly scene: THREE.Scene,
    container: HTMLElement,
    private readonly input: GarageInput,
    /** the wheel over a symbol still zooms the map */
    private readonly onWheel?: (event: WheelEvent) => void,
  ) {
    this.layer = document.createElement('div')
    this.layer.className = 'map-marks'
    container.appendChild(this.layer)
    scene.add(this.root)
    this.build()
  }

  private keep<T extends { dispose(): void }>(item: T) {
    this.disposables.push(item)
    return item
  }

  private addToStage(stage: GarageStage, object: THREE.Object3D) {
    const index = STAGE_INDEX[stage]
    const list = this.stageGroups.get(index) ?? []
    list.push(object)
    this.stageGroups.set(index, list)
    this.root.add(object)
  }

  /** A symbol on the map; its caption shows at its own step of the tour, on hover, or on tap */
  private addMark(stage: GarageStage, kind: keyof typeof ICONS, caption: string, x: number, y: number, height: number) {
    const element = document.createElement('div')
    element.className = `map-mark is-${kind}`
    element.innerHTML = `<div class="mark-body"><span class="mark-icon" role="img" aria-label="${caption}">${ICONS[kind]}</span><span class="mark-caption">${caption}</span></div>`
    const icon = element.querySelector('.mark-icon') as HTMLElement
    let touch = false
    icon.addEventListener('pointerdown', (event) => { touch = event.pointerType !== 'mouse' })
    icon.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') element.classList.add('is-hover') })
    icon.addEventListener('pointerleave', (event) => { if (event.pointerType === 'mouse') element.classList.remove('is-hover') })
    icon.addEventListener('click', () => {
      if (!touch) return
      const open = !element.classList.contains('is-hover')
      this.marks.forEach((mark) => mark.element.classList.remove('is-hover'))
      element.classList.toggle('is-hover', open)
    })
    if (this.onWheel) icon.addEventListener('wheel', this.onWheel, { passive: false })
    this.layer.appendChild(element)
    this.marks.push({ element, position: world(x, y, height), stage: STAGE_INDEX[stage] })
  }

  /** A footprint in calm blue with its outline: a garage the cars move into (overlapping parts read as one area) */
  private addFootprint(stage: GarageStage, rings: Ring[]) {
    // overlapping parts must not get darker: the stencil lets each pixel be tinted only once per area
    const fillMaterial = this.keep(new THREE.MeshBasicMaterial({
      color: '#2a6fd6', transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
      stencilWrite: true, stencilRef: STAGE_INDEX[stage], stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
    }))
    const lineMaterial = this.keep(new THREE.LineBasicMaterial({ color: '#2a6fd6', transparent: true, opacity: 0.7 }))
    // the parts of a house do not always meet exactly: small gaps enclosed by the house count as house
    const all = rings.flat()
    const minX = Math.min(...all.map((p) => p[0])) - 1, minY = Math.min(...all.map((p) => p[1])) - 1
    const columns = Math.ceil(Math.max(...all.map((p) => p[0])) + 1 - minX) * 2, rows = Math.ceil(Math.max(...all.map((p) => p[1])) + 1 - minY) * 2
    // only for single houses: on the large station complex the parts meet well and the check would take too long
    const small = columns * rows <= 30000
    const raster = new Uint8Array(small ? columns * rows : 0)
    for (let c = 0; small && c < columns; c++) {
      // a cell counts as house only when it lies wholly inside (so even slits thinner than a cell are found)
      for (let r = 0; r < rows; r++) {
        const x = minX + c / 2 + 0.25, y = minY + r / 2 + 0.25
        raster[r * columns + c] = [[0, 0], [-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]].every(([dx, dy]) => rings.some((ring) => pointInRing(ring, x + dx, y + dy))) ? 1 : 0
      }
    }
    const cell = (c: number, r: number) => (c >= 0 && r >= 0 && c < columns && r < rows ? raster[r * columns + c] : 0)
    const hits = (c: number, r: number, dc: number, dr: number, reach: number) => {
      for (let step = 1; step <= reach; step++) if (cell(c + dc * step, r + dr * step)) return true
      return false
    }
    // a gap: house on all four sides within 6 m, or a thin slit with house right on two opposite sides
    const enclosedCell = (c: number, r: number) => small && !cell(c, r) && (
      [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dc, dr]) => hits(c, r, dc, dr, 12))
      || [[1, 0], [0, 1], [1, 1], [1, -1]].some(([dc, dr]) => hits(c, r, dc, dr, 3) && hits(c, r, -dc, -dr, 3)))
    const inArea = (x: number, y: number) => {
      const c = Math.floor((x - minX) * 2), r = Math.floor((y - minY) * 2)
      return rings.some((ring) => pointInRing(ring, x, y)) || enclosedCell(c, r)
    }
    const gap: THREE.BufferGeometry[] = []
    for (let c = 0; small && c < columns; c++) {
      for (let r = 0; r < rows; r++) if (enclosedCell(c, r)) gap.push(new THREE.PlaneGeometry(0.55, 0.55).translate(minX + c / 2 + 0.25, minY + r / 2 + 0.25, 0))
    }
    if (gap.length) {
      const merged = this.keep(mergeGeometries(gap))
      gap.forEach((part) => part.dispose())
      merged.rotateX(-Math.PI / 2)
      const fill = new THREE.Mesh(merged, fillMaterial)
      fill.position.y = 0.8
      fill.renderOrder = 22
      this.addToStage(stage, fill)
    }
    const edges: THREE.Vector3[] = []
    rings.forEach((ring) => {
      const geometry = this.keep(new THREE.ShapeGeometry(new THREE.Shape(cleanRing(ring).map(([x, y]) => new THREE.Vector2(x, y)))))
      geometry.rotateX(-Math.PI / 2)
      const fill = new THREE.Mesh(geometry, fillMaterial)
      fill.position.y = 0.8
      fill.renderOrder = 22
      this.addToStage(stage, fill)
      // only the outer edge of the whole area gets a line, not the seams between its parts
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[j], [bx, by] = ring[i]
        const length = Math.hypot(bx - ax, by - ay)
        if (length < 0.3) continue
        const nx = -(by - ay) / length * 0.7, ny = (bx - ax) / length * 0.7
        const mx = (ax + bx) / 2, my = (ay + by) / 2
        if (inArea(mx + nx, my + ny) === inArea(mx - nx, my - ny)) continue
        edges.push(world(ax, ay, 1), world(bx, by, 1))
      }
    })
    if (edges.length) {
      const outline = new THREE.LineSegments(this.keep(new THREE.BufferGeometry().setFromPoints(edges)), lineMaterial)
      outline.renderOrder = 23
      this.addToStage(stage, outline)
    }
  }

  private build() {
    const { focus, streets, buildings, green, station, garage } = this.input
    const geometries = {
      body: this.keep(new THREE.BoxGeometry(4.3, 0.78, 1.85)),
      cabin: this.keep(new THREE.BoxGeometry(2.3, 0.62, 1.6)),
      stripe: this.keep(new THREE.BoxGeometry(2.1, 0.06, 0.5)),
    }

    // --- parked cars along the streets of the Grätzl (both sides, every ~24 m, not in houses, parks or crossings)
    const homes: Spot[] = []
    streets.forEach(([x1, y1, x2, y2], segment) => {
      const length = Math.hypot(x2 - x1, y2 - y1)
      if (length < 30 || !pointInRing(focus, x1, y1) || !pointInRing(focus, x2, y2)) return
      const angle = Math.atan2(y2 - y1, x2 - x1)
      const nx = -Math.sin(angle), ny = Math.cos(angle)
      for (let along = 12, k = segment; along < length - 12; along += 24, k++) {
        const side = k % 2 ? 1 : -1
        const x = x1 + Math.cos(angle) * along + nx * 4 * side
        const y = y1 + Math.sin(angle) * along + ny * 4 * side
        if (!pointInRing(focus, x, y)) continue
        if (buildings.some((ring) => pointInRing(ring, x, y) || distanceToRing(ring, x, y) < 0.8)) continue
        if (green.some((ring) => pointInRing(ring, x, y))) continue
        if (homes.some((other) => Math.hypot(other.x - x, other.y - y) < 9)) continue
        homes.push({ x, y, angle })
      }
    })

    // --- the places of the four measures
    this.sharingSpots = SHARING_SPOTS.map(([x, y]) => this.onStreet(x, y, 3.4))
    // a loading zone keeps clear of the crossings: it slides along its street until it ends 5 m before one
    const degree = new Map<string, { x: number; y: number; n: number }>()
    streets.forEach(([x1, y1, x2, y2]) => [[x1, y1], [x2, y2]].forEach(([x, y]) => {
      const key = `${Math.round(x)},${Math.round(y)}`
      const node = degree.get(key) ?? { x, y, n: 0 }
      node.n++
      degree.set(key, node)
    }))
    const crossings = [...degree.values()].filter((node) => node.n >= 3)
    this.loadingSpots = LOADING_ZONES.map(({ at, length }) => {
      const spot = this.onStreet(at[0], at[1], 3.4)
      const ux = Math.cos(spot.angle), uy = Math.sin(spot.angle)
      for (let round = 0; round < 3; round++) {
        for (const node of crossings) {
          const along = (node.x - spot.x) * ux + (node.y - spot.y) * uy
          const aside = Math.abs(-(node.x - spot.x) * uy + (node.y - spot.y) * ux)
          const room = length / 2 + 5 + 4
          if (aside < 14 && Math.abs(along) < room) {
            const shift = along > 0 ? along - room : along + room
            spot.x += ux * shift
            spot.y += uy * shift
          }
        }
      }
      return { ...spot, length }
    })

    // bays in the middle of the station complex: rows of cars side by side, in line with the walls of the building
    const stationMain = largest(station)
    const stationCentre: [number, number] = stationMain ? ringCentre(stationMain) : [215, -60]
    this.stationLabel = [stationCentre[0], stationCentre[1] + 30]
    if (stationMain) this.stationSlots = slotsIn([stationMain], 18, 7, 12)
    // bays inside the house Liechtensteinstraße 87–89, along its longest wall
    const garageSlots = slotsIn(garage, 10, 4.2, 8.4)
    const garageMain = largest(garage)
    const garageCentre: [number, number] = garageMain ? ringCentre(garageMain) : GARAGE

    // --- who goes where: the cars nearest to each garage move there, some make room for car sharing and loading
    const free = homes.map((home) => ({ home }))
    const take = (count: number, x: number, y: number, within = Infinity) => {
      free.sort((a, b) => Math.hypot(a.home.x - x, a.home.y - y) - Math.hypot(b.home.x - x, b.home.y - y))
      let n = 0
      while (n < Math.min(count, free.length) && Math.hypot(free[n].home.x - x, free[n].home.y - y) <= within) n++
      return free.splice(0, n).map((entry) => entry.home)
    }
    const toStation = take(this.stationSlots.length, 150, -20)
    const toGarage = take(garageSlots.length, garageCentre[0] + 30, garageCentre[1])
    const replaced = this.sharingSpots.flatMap((spot, i) => take(i === 0 ? 3 : 2, spot.x, spot.y, 45))
    const cleared = this.loadingSpots.flatMap((spot) => take(2, spot.x, spot.y, 13))

    let colour = 0
    const queue = new Map<number, number>()
    // the cars that stay put share their materials (there are many of them); the others fade on their own
    const shared = new Map<string, THREE.Material[]>()
    const addCar = (home: Spot, target: Spot | null, stage: number, vanish: Car['vanish']) => {
      const tint = CAR_COLOURS[colour++ % CAR_COLOURS.length]
      const object = makeCar(geometries, tint, false, stage === 0 ? shared : undefined)
      const order = queue.get(stage) ?? 0
      queue.set(stage, order + 1)
      this.root.add(object)
      this.cars.push({ object, home, target, stage, order, vanish, placed: 'home', anim: null, fadeIn: null })
    }
    toStation.forEach((home, i) => addCar(home, this.stationSlots[i], STAGE_INDEX.station, null))
    toGarage.forEach((home, i) => addCar(home, garageSlots[i], STAGE_INDEX.garage, null))
    replaced.forEach((home) => addCar(home, home, STAGE_INDEX.sharing, 'fade'))
    cleared.forEach((home) => addCar(home, home, STAGE_INDEX.loading, 'fade'))
    free.forEach(({ home }) => addCar(home, null, 0, null))

    // --- 1 Bahnhof: the station complex in a calm blue, with its outline
    this.addFootprint('station', station)
    this.addMark('station', 'parking', 'Garage nutzen', this.stationLabel[0], this.stationLabel[1], 4)

    // --- 2 Garage Liechtensteinstraße: the house in the same blue, the cars park inside
    this.addFootprint('garage', garage)
    const garageTop = garage.length ? Math.max(...garage.flatMap((ring) => ring.map((p) => p[1]))) : GARAGE[1]
    this.addMark('garage', 'parking', 'Garage nutzen', garageCentre[0], garageTop - 3, 4)

    // --- 3 Car sharing: three cars on marked spots
    const padGeometry = this.keep(new THREE.PlaneGeometry(6.4, 3))
    const padMaterial = this.keep(new THREE.MeshBasicMaterial({ color: '#14a89a', transparent: true, opacity: 0.35, depthWrite: false }))
    this.sharingSpots.forEach((spot) => {
      const pad = new THREE.Mesh(padGeometry, padMaterial)
      pad.rotation.set(-Math.PI / 2, 0, spot.angle)
      pad.position.copy(world(spot.x, spot.y, 0.75))
      pad.renderOrder = 22
      this.addToStage('sharing', pad)
      const car = makeCar(geometries, '#14a89a', true)
      car.position.copy(world(spot.x, spot.y))
      car.rotation.y = spot.angle
      car.scale.setScalar(CAR_SCALE)
      this.addToStage('sharing', car)
      this.sharingCars.push(car)
      this.addMark('sharing', 'sharing', 'Carsharing', spot.x, spot.y, 3)
    })

    // --- 4 Loading zones of the traffic concept: laid onto the nearest street (kerb side)
    const loading = this.keep(new THREE.MeshBasicMaterial({ map: this.keep(loadingTexture()), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }))
    const zoneGeometry = this.keep(new THREE.PlaneGeometry(20, 3.6))
    this.loadingSpots.forEach((zone) => {
      const mesh = new THREE.Mesh(zoneGeometry, loading)
      mesh.scale.x = zone.length / 20
      mesh.rotation.set(-Math.PI / 2, 0, zone.angle)
      mesh.position.copy(world(zone.x, zone.y, 0.8))
      mesh.renderOrder = 22
      this.addToStage('loading', mesh)
      this.addMark('loading', 'loading', 'Ladezone', zone.x, zone.y, 2)
    })
  }

  /** Nearest point on a street of the Grätzl, moved `kerb` metres towards the given point's side, with the street direction */
  private onStreet(x: number, y: number, kerb: number): Spot {
    let best = { distance: Infinity, x, y, angle: 0, side: 1 }
    for (const [x1, y1, x2, y2] of this.input.streets) {
      const dx = x2 - x1, dy = y2 - y1
      const length = Math.hypot(dx, dy) || 1
      const t = Math.min(1, Math.max(0, ((x - x1) * dx + (y - y1) * dy) / (length * length)))
      const px = x1 + dx * t, py = y1 + dy * t
      const distance = Math.hypot(x - px, y - py)
      if (distance < best.distance) {
        const cross = dx * (y - py) - dy * (x - px)
        best = { distance, x: px, y: py, angle: Math.atan2(dy, dx), side: cross >= 0 ? 1 : -1 }
      }
    }
    return { x: best.x - Math.sin(best.angle) * kerb * best.side, y: best.y + Math.cos(best.angle) * kerb * best.side, angle: best.angle }
  }

  /** Is something of a stage on the map? At the Ladezonen step only the loading zones show (the rest comes back with Neu) */
  private shows(index: number, objectStage: number) {
    if (index === STAGE_INDEX.loading) return objectStage === STAGE_INDEX.loading
    return index >= objectStage
  }

  /**
   * Show the scene up to a stage (start = Bestand, all = Neu).
   * glide: the tour, the cars of the step just reached glide over one by one; otherwise (Bestand / Neu) everything just fades in at its place.
   */
  setStage(stage: GarageStage, glide = true) {
    const index = STAGE_INDEX[stage]
    const previous = this.stage
    this.stage = index
    const now = performance.now()
    const appearing: THREE.Object3D[] = []
    this.stageGroups.forEach((objects, objectStage) => objects.forEach((object) => {
      const visible = this.shows(index, objectStage)
      if (visible && !object.visible && !glide) appearing.push(object)
      object.visible = visible
    }))
    this.fadeObjects = appearing.length ? { objects: appearing, start: now } : null
    if (appearing.length) this.applyFade(appearing, 0)
    for (const car of this.cars) {
      const leaves = car.stage > 0 && index >= car.stage
      const before = car.placed
      if (!leaves) {
        this.placeCar(car, 'home')
        if (!glide && before !== 'home') { car.fadeIn = now; setOpacity(car.object, 0) }
        continue
      }
      if (previous >= 0 && previous < car.stage) {
        this.placeCar(car, 'home')
        // tour: first a moment on the street, so you see where they come from; Bestand / Neu: no trip, they are just there
        if (glide) car.anim = { start: now, delay: 700 + car.order * STAGGER }
        else if (car.vanish) car.anim = { start: now, delay: 0, quick: true }
        else { this.placeCar(car, 'target'); car.fadeIn = now; setOpacity(car.object, 0) }
      } else if (!car.anim) this.placeCar(car, 'target')
      // the cars parked in the garages stay out of the Ladezonen step
      if (car.stage < STAGE_INDEX.loading && car.placed === 'target' && !car.vanish) car.object.visible = this.shows(index, car.stage)
    }
    // the car-sharing cars pop up when their step is reached on the tour
    if (index < STAGE_INDEX.sharing || !glide) this.sharingAnim = null
    else if (previous >= 0 && previous < STAGE_INDEX.sharing) this.sharingAnim = now
    if (this.sharingAnim === now) this.sharingCars.forEach((car) => car.scale.setScalar(0.0001))
    else if (this.sharingAnim === null) this.sharingCars.forEach((car) => car.scale.setScalar(CAR_SCALE))
    this.marks.forEach((mark) => {
      mark.element.classList.toggle('is-current', glide && mark.stage === index)
      mark.element.classList.remove('is-hover')
    })
  }

  private placeCar(car: Car, where: 'home' | 'target') {
    const spot = where === 'home' || !car.target ? car.home : car.target
    car.object.position.copy(world(spot.x, spot.y))
    car.object.rotation.y = spot.angle
    car.object.scale.setScalar(CAR_SCALE)
    car.object.visible = where === 'home' || !car.vanish
    setOpacity(car.object, 1)
    car.placed = where
    car.anim = null
    car.fadeIn = null
  }

  private fadeObjects: { objects: THREE.Object3D[]; start: number } | null = null

  /** Fade objects towards their own opacity (k = 0 … 1) */
  private applyFade(objects: THREE.Object3D[], k: number) {
    objects.forEach((object) => object.traverse((child) => {
      const material = (child as THREE.Mesh).material as THREE.Material | undefined
      if (!material) return
      if (material.userData.base === undefined) material.userData.base = material.opacity
      material.opacity = material.userData.base * k
    }))
  }

  /** One frame: cars glide (lifted on an arc) into their garage, the sharing cars pop in; symbols follow the camera */
  update(camera: THREE.Camera, width: number, height: number) {
    const now = performance.now()
    if (this.fadeObjects) {
      const k = Math.min(1, (now - this.fadeObjects.start) / 450)
      this.applyFade(this.fadeObjects.objects, k)
      if (k >= 1) this.fadeObjects = null
    }
    for (const car of this.cars) {
      if (car.fadeIn !== null) {
        const k = Math.min(1, (now - car.fadeIn) / 450)
        setOpacity(car.object, k)
        if (k >= 1) car.fadeIn = null
      }
      if (!car.anim || !car.target) continue
      const duration = car.anim.quick ? 450 : car.vanish === 'fade' ? 1100 : GLIDE
      const t = Math.min(1, Math.max(0, (now - car.anim.start - car.anim.delay) / duration))
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      if (car.vanish === 'fade') {
        setOpacity(car.object, 1 - eased)
      } else {
        const { home, target } = car
        const distance = Math.hypot(target.x - home.x, target.y - home.y)
        const position = world(home.x + (target.x - home.x) * eased, home.y + (target.y - home.y) * eased, Math.sin(Math.PI * t) * Math.min(40, 8 + distance * 0.12))
        car.object.position.copy(position)
        let turn = target.angle - home.angle
        while (turn > Math.PI) turn -= Math.PI * 2
        while (turn < -Math.PI) turn += Math.PI * 2
        car.object.rotation.y = home.angle + turn * eased
      }
      if (t >= 1) this.placeCar(car, 'target')
    }
    if (this.sharingAnim !== null) {
      const start = this.sharingAnim
      let done = true
      this.sharingCars.forEach((car, i) => {
        const t = Math.min(1, Math.max(0, (now - start - 600 - i * 350) / 600))
        if (t < 1) done = false
        const c1 = 1.70158, c3 = c1 + 1
        car.scale.setScalar(CAR_SCALE * (t === 0 ? 0.0001 : 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)))
      })
      if (done) this.sharingAnim = null
    }
    const projected = new THREE.Vector3()
    // the tour card lies over the map on wide screens: captions that would run into it open to the left instead
    const cardRect = this.layer.parentElement?.closest('.map-stage')?.querySelector('.tour-card')?.getBoundingClientRect()
    const layerRect = cardRect ? this.layer.getBoundingClientRect() : null
    const card = cardRect && layerRect ? { left: cardRect.left - layerRect.left, right: cardRect.right - layerRect.left, top: cardRect.top - layerRect.top, bottom: cardRect.bottom - layerRect.top } : null
    for (const mark of this.marks) {
      const shown = this.shows(this.stage, mark.stage)
      projected.copy(mark.position).project(camera)
      const onScreen = projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1
      mark.element.style.display = shown && onScreen ? '' : 'none'
      if (!shown || !onScreen) continue
      // the symbol's tip sits on its place, the caption runs to the right of it (or to the left when there is no room)
      // the width the symbol has once its caption is open (not the width while it animates), so the side does not flicker
      const open = mark.element.classList.contains('is-current') || mark.element.classList.contains('is-hover')
      const caption = mark.element.querySelector('.mark-caption') as HTMLElement | null
      const bodyWidth = open && caption ? 26 + 6 + Math.min(250, caption.scrollWidth + (caption.offsetWidth > 1 ? 0 : 20)) : 26
      const anchor = (projected.x * 0.5 + 0.5) * width
      const y = (-projected.y * 0.5 + 0.5) * height
      const right = anchor - 13 + bodyWidth
      const intoCard = card !== null && anchor < card.left && right > card.left - 8 && y > card.top && y - 40 < card.bottom
      const flip = bodyWidth > 40 && (right > width - 10 || intoCard)
      mark.element.classList.toggle('is-flipped', flip)
      const x = flip ? Math.min(width - 23, Math.max(bodyWidth - 13 + 10, anchor)) : Math.min(width - bodyWidth + 13 - 10, Math.max(23, anchor))
      mark.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    }
  }

  /**
   * Rectangle (local metres, y north) the camera should frame for a stage.
   * close: for the Bahnhof, the tighter view the camera moves into while the cars arrive.
   */
  focus(stage: GarageStage, close = false): { x: number; y: number; width: number; height: number } {
    const points: [number, number][] = []
    let margin = { start: 12, station: 30, garage: 22, sharing: 0, loading: 26, all: 12 }[stage]
    const homesOf = (index: number) => this.cars.filter((car) => car.stage === index).forEach((car) => points.push([car.home.x, car.home.y]))
    if (stage === 'start' || stage === 'all') {
      this.input.focus.forEach((p) => points.push(p))
      this.input.station.forEach((ring) => ring.forEach((p) => points.push(p)))
    } else if (stage === 'station' && close && this.stationSlots.length) {
      this.stationSlots.forEach((slot) => points.push([slot.x, slot.y]))
      points.push([this.stationLabel[0], this.stationLabel[1] + 8])
      margin = 45
    } else if (stage === 'station') {
      this.input.station.forEach((ring) => ring.forEach((p) => points.push(p)))
      homesOf(STAGE_INDEX.station)
    } else if (stage === 'garage' && close && this.input.garage.length) {
      this.input.garage.forEach((ring) => ring.forEach((p) => points.push(p)))
      margin = 32
    } else if (stage === 'garage') {
      if (this.input.garage.length) this.input.garage.forEach((ring) => ring.forEach((p) => points.push(p)))
      else points.push(GARAGE)
      homesOf(STAGE_INDEX.garage)
    } else if (stage === 'sharing') {
      const spot = this.sharingSpots[0] ?? { x: SHARING_SPOTS[0][0], y: SHARING_SPOTS[0][1] }
      return { x: spot.x + 6, y: spot.y + 8, width: 100, height: 85 }
    } else {
      this.loadingSpots.forEach((zone) => points.push([zone.x, zone.y]))
    }
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1])
    const minX = Math.min(...xs) - margin, maxX = Math.max(...xs) + margin, minY = Math.min(...ys) - margin, maxY = Math.max(...ys) + margin
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, width: maxX - minX, height: maxY - minY }
  }

  dispose() {
    this.scene.remove(this.root)
    this.root.traverse((child) => {
      const material = (child as THREE.Mesh).material as THREE.Material | undefined
      if (material && (child as THREE.Mesh).isMesh && (child as THREE.Mesh).geometry) material.dispose()
    })
    this.disposables.forEach((item) => item.dispose())
    this.layer.remove()
  }
}

/**
 * Parking bays inside a footprint: rows along its main wall direction, cars side by side with the nose to the wall.
 * Every car (6.5 × 2.8 m as drawn) stands wholly inside the house.
 */
function slotsIn(rings: Ring[], count: number, across: number, along: number): Spot[] {
  const main = largest(rings)
  if (!main || count <= 0) return []
  // the direction most walls follow (edges folded onto a quarter turn, weighted by their length)
  let wall = 0, longest = 0
  for (let i = 0, j = main.length - 1; i < main.length; j = i++) {
    const dx = main[i][0] - main[j][0], dy = main[i][1] - main[j][1]
    const candidate = Math.atan2(dy, dx)
    let support = 0
    for (let k = 0, l = main.length - 1; k < main.length; l = k++) {
      const ex = main[k][0] - main[l][0], ey = main[k][1] - main[l][1]
      let diff = Math.abs(Math.atan2(ey, ex) - candidate) % (Math.PI / 2)
      diff = Math.min(diff, Math.PI / 2 - diff)
      if (diff < 0.06) support += Math.hypot(ex, ey)
    }
    if (support > longest) { longest = support; wall = candidate }
  }
  const ux = Math.cos(wall), uy = Math.sin(wall), vx = -uy, vy = ux
  const [cx, cy] = ringCentre(main)
  const inHouse = (x: number, y: number) => rings.some((ring) => pointInRing(ring, x, y))
  const corners = [[-1.6, -3.4], [1.6, -3.4], [-1.6, 3.4], [1.6, 3.4]]
  let best: (Spot & { i: number; j: number })[] = []
  for (const shiftU of [0, 0.5]) {
    for (const shiftV of [0, 0.5]) {
      const slots: (Spot & { i: number; j: number })[] = []
      for (let j = -8; j <= 8; j++) {
        for (let i = -12; i <= 12; i++) {
          const a = (i + shiftU) * across, b = (j + shiftV) * along
          const x = cx + ux * a + vx * b, y = cy + uy * a + vy * b
          if (corners.every(([p, q]) => inHouse(x + ux * p + vx * q, y + uy * p + vy * q))) slots.push({ x, y, angle: wall + Math.PI / 2, i, j })
        }
      }
      if (slots.length > best.length) best = slots
    }
  }
  // the bays nearest to the middle, filled row by row
  const mx = best.reduce((sum, slot) => sum + slot.x, 0) / (best.length || 1), my = best.reduce((sum, slot) => sum + slot.y, 0) / (best.length || 1)
  return best
    .sort((a, b) => Math.hypot(a.x - mx, a.y - my) - Math.hypot(b.x - mx, b.y - my))
    .slice(0, count)
    .sort((a, b) => b.j - a.j || a.i - b.i)
    .map(({ x, y, angle }) => ({ x, y, angle }))
}

/** A footprint ready to be filled: no repeated closing point, no points almost on top of each other, no points on a straight edge */
function cleanRing(ring: Ring): Ring {
  let points = ring.filter((p, i) => i === 0 || Math.hypot(p[0] - ring[i - 1][0], p[1] - ring[i - 1][1]) > 0.25)
  if (points.length > 1 && Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]) <= 0.25) points = points.slice(0, -1)
  return points.filter((p, i) => {
    const a = points[(i - 1 + points.length) % points.length], b = points[(i + 1) % points.length]
    return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 0.05
  })
}

function largest(rings: Ring[]) {
  return [...rings].sort((a, b) => ringSize(b) - ringSize(a))[0] as Ring | undefined
}

function ringSize(ring: Ring) {
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  return Math.abs(area) / 2
}

function ringCentre(ring: Ring): [number, number] {
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}
