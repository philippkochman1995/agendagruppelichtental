import { focusAreaRing } from './mapConfig'
import type { MapLayer } from './types'

export function featureId(properties: Record<string, unknown>) {
  return String(properties.OBJECTID ?? properties.FID ?? properties.id ?? 'demo')
}

export function queryUrl(layer: MapLayer) {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: JSON.stringify({ rings: [[...focusAreaRing].reverse()] }),
    geometryType: 'esriGeometryPolygon',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  })
  return `${layer.url}/query?${params}`
}
