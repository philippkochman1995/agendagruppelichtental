import type { GeoJsonFeatureCollection } from './types'
import { polygonAround, rectangleAround } from './mapGeometry'

interface ObjectPart {
  part: string
  color: string
  length?: number
  width?: number
  radius?: number
  along?: number
  across?: number
  base: number
  height: number
}

const pointObjectParts: Record<string, ObjectPart[]> = {
  shade: [
    { part: 'pole', color: '#756c61', length: 0.16, width: 0.16, base: 0, height: 2.15 },
    { part: 'canopy', color: '#e7b555', radius: 1.45, base: 2.05, height: 2.22 },
    { part: 'cap', color: '#b96945', radius: 0.16, base: 2.2, height: 2.38 },
  ],
  'bike-parking': [
    { part: 'rail', color: '#668384', length: 0.13, width: 0.18, along: -0.62, base: 0, height: 0.95 },
    { part: 'rail', color: '#668384', length: 0.13, width: 0.18, along: 0.62, base: 0, height: 0.95 },
    { part: 'rail', color: '#8ca3a0', length: 1.38, width: 0.16, base: 0.84, height: 1.02 },
    { part: 'base', color: '#566d70', length: 1.75, width: 0.12, across: -0.45, base: 0, height: 0.12 },
  ],
  'traffic-calming': [
    { part: 'pole', color: '#6c7475', length: 0.15, width: 0.15, base: 0, height: 2.25 },
    { part: 'sign', color: '#e8b841', length: 0.82, width: 0.18, base: 1.35, height: 2.25 },
    { part: 'mark', color: '#343b3d', length: 0.24, width: 0.21, across: -0.02, base: 1.57, height: 2.04 },
  ],
  'play-sport': [
    { part: 'post', color: '#f0eee7', length: 0.16, width: 0.18, along: -1.05, base: 0, height: 1.9 },
    { part: 'post', color: '#f0eee7', length: 0.16, width: 0.18, along: 1.05, base: 0, height: 1.9 },
    { part: 'bar', color: '#f0eee7', length: 2.25, width: 0.18, base: 1.78, height: 1.96 },
    { part: 'ball', color: '#d49b31', radius: 0.34, across: -0.72, base: 0, height: 0.55 },
  ],
  drinking: [
    { part: 'body', color: '#4f91a2', length: 0.58, width: 0.58, base: 0, height: 1.05 },
    { part: 'basin', color: '#83b8c1', length: 0.88, width: 0.72, across: 0.12, base: 0.92, height: 1.16 },
    { part: 'tap', color: '#d9e1dc', length: 0.18, width: 0.3, across: -0.34, base: 1.02, height: 1.34 },
  ],
  waste: [
    { part: 'bin', color: '#54715f', length: 0.78, width: 0.68, base: 0, height: 1.12 },
    { part: 'lid', color: '#334c42', length: 0.92, width: 0.82, base: 1.06, height: 1.26 },
    { part: 'opening', color: '#172923', length: 0.46, width: 0.14, across: -0.38, base: 0.83, height: 1.03 },
  ],
  'culture-place': [
    { part: 'stage', color: '#bd5367', length: 1.9, width: 1.25, base: 0, height: 0.28 },
    { part: 'column', color: '#f0c7bd', length: 0.22, width: 0.22, along: -0.68, base: 0.26, height: 1.9 },
    { part: 'column', color: '#f0c7bd', length: 0.22, width: 0.22, along: 0.68, base: 0.26, height: 1.9 },
    { part: 'roof', color: '#8e4054', length: 1.75, width: 0.42, base: 1.78, height: 2.06 },
  ],
  quote: [
    { part: 'pole', color: '#735c67', length: 0.15, width: 0.15, base: 0, height: 1.42 },
    { part: 'bubble', color: '#f0c5cf', length: 1.45, width: 0.22, base: 1.08, height: 2.05 },
    { part: 'tail', color: '#bd5367', length: 0.28, width: 0.3, along: -0.42, base: 0.9, height: 1.28 },
  ],
  unicorn: [
    { part: 'base', color: '#d9b3d3', radius: 0.78, base: 0, height: 0.34 },
    { part: 'body', color: '#eee1ec', radius: 0.5, base: 0.3, height: 1.25 },
    { part: 'horn', color: '#b76ab3', radius: 0.28, base: 1.2, height: 1.72 },
    { part: 'horn', color: '#e0a951', radius: 0.14, base: 1.68, height: 2.04 },
  ],
  'ground-use': [
    { part: 'shop', color: '#a7825e', length: 1.85, width: 1.3, base: 0, height: 2.05 },
    { part: 'window', color: '#8db6bb', length: 1.25, width: 0.16, across: -0.66, base: 0.55, height: 1.55 },
    { part: 'awning', color: '#d68164', length: 2.15, width: 0.52, across: -0.78, base: 1.68, height: 1.9 },
    { part: 'sign', color: '#f1d6a2', length: 1.1, width: 0.2, across: -0.67, base: 2.0, height: 2.35 },
  ],
}

export function createTreeCanopies(geojson: GeoJsonFeatureCollection): GeoJsonFeatureCollection {
  const features: GeoJsonFeatureCollection['features'] = []
  geojson.features.forEach((feature, treeIndex) => {
    if (!feature.geometry || feature.geometry.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) return
    const [lng, lat] = feature.geometry.coordinates as number[]
    const original = feature.properties ?? {}
    const longitudeMetre = 1 / (111_320 * Math.cos((lat * Math.PI) / 180))
    const latitudeMetre = 1 / 111_320
    const tiers = [
      { part: 'trunk', radius: 0.38, base: 0, height: 5.1, east: 0, north: 0 },
      { part: 'lower', radius: 1.25, base: 4.2, height: 7.7, east: -0.8, north: -0.3 },
      { part: 'middle', radius: 1.35, base: 4.4, height: 8.3, east: 0.7, north: -0.2 },
      { part: 'upper', radius: 1.18, base: 5.1, height: 9.2, east: 0, north: 0.75 },
      { part: 'middle', radius: 1.05, base: 4.7, height: 8.4, east: 0.15, north: -1 },
    ]
    tiers.forEach((tier) => features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [polygonAround(
          lng + tier.east * longitudeMetre,
          lat + tier.north * latitudeMetre,
          tier.radius,
          tier.part === 'trunk' ? 7 : 9,
        )],
      },
      properties: { ...original, treeIndex, treePart: tier.part, base: tier.base, height: tier.height },
    }))
  })
  return { type: 'FeatureCollection', features }
}

export function create3DBenches(geojson: GeoJsonFeatureCollection): GeoJsonFeatureCollection {
  const features: GeoJsonFeatureCollection['features'] = []
  geojson.features.forEach((feature, benchIndex) => {
    if (!feature.geometry || feature.geometry.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) return
    const [lng, lat] = feature.geometry.coordinates as number[]
    const original = feature.properties ?? {}
    const angle = ((benchIndex * 47) % 180) * Math.PI / 180
    const parts = [
      { part: 'seat', length: 2.15, width: 0.52, along: 0, across: 0, base: 0.48, height: 0.68 },
      { part: 'back', length: 2.15, width: 0.13, along: 0, across: 0.28, base: 0.62, height: 1.22 },
      { part: 'frame', length: 0.16, width: 0.46, along: -0.72, across: 0, base: 0, height: 0.52 },
      { part: 'frame', length: 0.16, width: 0.46, along: 0.72, across: 0, base: 0, height: 0.52 },
      { part: 'frame', length: 0.12, width: 0.52, along: -0.92, across: 0, base: 0.55, height: 0.82 },
      { part: 'frame', length: 0.12, width: 0.52, along: 0.92, across: 0, base: 0.55, height: 0.82 },
    ]
    parts.forEach((part) => features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [rectangleAround(
          lng,
          lat,
          part.length,
          part.width,
          angle,
          part.along,
          part.across,
        )],
      },
      properties: { ...original, benchIndex, benchPart: part.part, base: part.base, height: part.height },
    }))
  })
  return { type: 'FeatureCollection', features }
}

export function create3DPointObjects(geojson: GeoJsonFeatureCollection, layerId: string): GeoJsonFeatureCollection {
  const parts = pointObjectParts[layerId] ?? pointObjectParts['traffic-calming']
  const features: GeoJsonFeatureCollection['features'] = []
  geojson.features.forEach((feature, objectIndex) => {
    if (!feature.geometry || feature.geometry.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) return
    const [lng, lat] = feature.geometry.coordinates as number[]
    const original = feature.properties ?? {}
    const angle = ((objectIndex * 37 + layerId.length * 11) % 180) * Math.PI / 180
    parts.forEach((part) => {
      let coordinates: number[][]
      if (part.radius) {
        const along = part.along ?? 0
        const across = part.across ?? 0
        const longitudeMetre = 1 / (111_320 * Math.cos((lat * Math.PI) / 180))
        const latitudeMetre = 1 / 111_320
        const x = along * Math.cos(angle) - across * Math.sin(angle)
        const y = along * Math.sin(angle) + across * Math.cos(angle)
        coordinates = polygonAround(lng + x * longitudeMetre, lat + y * latitudeMetre, part.radius, 9)
      } else {
        coordinates = rectangleAround(
          lng,
          lat,
          part.length ?? 0.4,
          part.width ?? 0.4,
          angle,
          part.along,
          part.across,
        )
      }
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coordinates] },
        properties: {
          ...original,
          objectIndex,
          objectPart: part.part,
          objectColor: part.color,
          base: part.base,
          height: part.height,
        },
      })
    })
  })
  return { type: 'FeatureCollection', features }
}
