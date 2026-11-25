import mapboxgl from 'mapbox-gl'
import { focusAreaRing } from './mapConfig'
import type { Geometry } from './types'

// Even-odd rule also handles the indentations along curved streets.
export function isInsideFocusArea({ lng, lat }: Pick<mapboxgl.LngLat, 'lng' | 'lat'>) {
  let inside = false
  for (let i = 1; i < focusAreaRing.length; i++) {
    const [ax, ay] = focusAreaRing[i - 1]
    const [bx, by] = focusAreaRing[i]
    const cross = (lng - ax) * (by - ay) - (lat - ay) * (bx - ax)
    if (Math.abs(cross) < 1e-15 && lng >= Math.min(ax, bx) && lng <= Math.max(ax, bx)
      && lat >= Math.min(ay, by) && lat <= Math.max(ay, by)) return true
    if ((ay > lat) !== (by > lat) && lng < ax + (lat - ay) * (bx - ax) / (by - ay)) {
      inside = !inside
    }
  }
  return inside
}

export function geometryBounds(geometry: Geometry) {
  const bounds = new mapboxgl.LngLatBounds()
  const visit = (coordinates: unknown) => {
    if (!Array.isArray(coordinates)) return
    if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
      bounds.extend(coordinates as [number, number])
      return
    }
    coordinates.forEach(visit)
  }
  if ('coordinates' in geometry) visit(geometry.coordinates)
  return bounds
}

export function polygonAround(lng: number, lat: number, radiusMetres: number, sides = 9) {
  const latitudeStep = radiusMetres / 111_320
  const longitudeStep = radiusMetres / (111_320 * Math.cos((lat * Math.PI) / 180))
  const coordinates: number[][] = []
  for (let index = 0; index <= sides; index += 1) {
    const angle = (index / sides) * Math.PI * 2
    coordinates.push([
      lng + Math.cos(angle) * longitudeStep,
      lat + Math.sin(angle) * latitudeStep,
    ])
  }
  return coordinates
}

export function rectangleAround(
  lng: number,
  lat: number,
  lengthMetres: number,
  widthMetres: number,
  angle: number,
  offsetAlong = 0,
  offsetAcross = 0,
) {
  const longitudeMetre = 1 / (111_320 * Math.cos((lat * Math.PI) / 180))
  const latitudeMetre = 1 / 111_320
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const points = [
    [-lengthMetres / 2, -widthMetres / 2],
    [lengthMetres / 2, -widthMetres / 2],
    [lengthMetres / 2, widthMetres / 2],
    [-lengthMetres / 2, widthMetres / 2],
  ]
  const coordinates = points.map(([along, across]) => {
    const x = along + offsetAlong
    const y = across + offsetAcross
    return [lng + (x * cos - y * sin) * longitudeMetre, lat + (x * sin + y * cos) * latitudeMetre]
  })
  coordinates.push(coordinates[0])
  return coordinates
}
