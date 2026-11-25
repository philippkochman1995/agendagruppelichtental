export type CategoryId =
  | 'green'
  | 'active-mobility'
  | 'leisure'
  | 'water-cleanliness'
  | 'parking'
  | 'culture'
  | 'ground-floor'

export type GeometryKind = 'point' | 'line' | 'polygon'

export interface MapCategory {
  id: CategoryId
  label: string
  shortLabel: string
  description: string
  color: string
  glyph: string
  emoji: string
  initiallyVisible: boolean
}

export interface MapLayer {
  id: string
  label: string
  categoryId: CategoryId
  url: string
  geometry: GeometryKind
  emoji?: string
}

export interface FeatureSummary {
  layerId: string
  layerLabel: string
  categoryId: CategoryId
  featureId: string
  properties: Record<string, unknown>
  zoneName?: string
}

export interface DemoDetail {
  title: string
  description: string
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    id?: string | number
    geometry: { type: string; coordinates: unknown } | null
    properties?: Record<string, unknown>
  }>
}

export type Geometry = { type: string; coordinates?: unknown }
export type FeatureCollection = GeoJsonFeatureCollection
export type RenderedFeature = { id?: string | number; properties?: Record<string, unknown>; geometry: Geometry }
