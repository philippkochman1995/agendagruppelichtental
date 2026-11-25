import type mapboxgl from 'mapbox-gl'
import type { FeatureCollection, GeoJsonFeatureCollection, MapCategory, MapLayer } from './types'
import { addCluster, addMarker } from './cleanMarkers'

interface AddGraetzlLayerOptions {
  map: mapboxgl.Map
  layer: MapLayer
  category: MapCategory
  geojson: GeoJsonFeatureCollection
  visible: boolean
  revealed?: boolean
}

export function graetzlLayerIds(layer: MapLayer) {
  const id = `graetzl-layer-${layer.id}`
  if (layer.geometry === 'point') return [id, `${id}-cluster`]
  if (layer.geometry === 'polygon') return [id, `${id}-highlight`]
  return [id]
}

export function addGraetzlLayer({ map, layer, category, geojson, visible, revealed = true }: AddGraetzlLayerOptions) {
  const sourceId = `graetzl-source-${layer.id}`
  const displayLayerId = `graetzl-layer-${layer.id}`
  const layoutVisibility = visible ? 'visible' : 'none'
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: 'geojson',
      data: geojson as FeatureCollection,
      ...(layer.geometry === 'point' ? { cluster: true, clusterRadius: 62, clusterMaxZoom: 17 } : {}),
    })
  }

  if (layer.geometry === 'point') {
    map.addLayer({
      id: displayLayerId,
      type: 'symbol',
      source: sourceId,
      filter: ['!', ['has', 'point_count']],
      layout: {
        visibility: layoutVisibility,
        'icon-image': addMarker(map, category),
        'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.75, 18, 1.15],
        'icon-allow-overlap': false,
      },
      paint: {
        'icon-opacity': revealed ? 1 : 0,
        'icon-opacity-transition': { duration: 800, delay: 0 },
      },
    })
    const clusterLayerId = `${displayLayerId}-cluster`
    map.addLayer({
      id: clusterLayerId,
      type: 'symbol',
      source: sourceId,
      filter: ['has', 'point_count'],
      layout: {
        visibility: layoutVisibility,
        'icon-image': addCluster(map, category),
        'icon-size': ['interpolate', ['linear'], ['get', 'point_count'], 2, 0.85, 12, 1.2],
        'icon-allow-overlap': false,
        'symbol-sort-key': ['-', ['get', 'point_count']],
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
        'text-size': 15,
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#2b2b27',
        'icon-opacity': revealed ? 1 : 0,
        'text-opacity': revealed ? 1 : 0,
        'icon-opacity-transition': { duration: 800, delay: 0 },
        'text-opacity-transition': { duration: 800, delay: 0 },
      },
    })
    map.on('mouseenter', clusterLayerId, () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', clusterLayerId, () => { map.getCanvas().style.cursor = '' })
    map.on('click', clusterLayerId, (event) => {
      const feature = event.features?.[0] as unknown as { properties?: Record<string, unknown>; geometry: { type: string; coordinates: unknown } } | undefined
      const clusterId = feature?.properties?.cluster_id as number | undefined
      const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
      if (clusterId === undefined || !source || feature?.geometry.type !== 'Point') return
      const center = feature.geometry.coordinates as [number, number]
      source.getClusterExpansionZoom(clusterId, (error, zoom) => {
        if (error || zoom == null) return
        map.easeTo({ center, zoom: Math.min(zoom + 0.3, 19), duration: 700 })
      })
    })
  } else if (layer.geometry === 'line') {
    map.addLayer({
      id: displayLayerId,
      type: 'line',
      source: sourceId,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: layoutVisibility,
      },
      paint: {
        'line-color': category.color,
        'line-width': ['interpolate', ['linear'], ['zoom'], 15, 3, 20, 8],
        'line-opacity': 0.62,
      },
    })
  } else {
    const firstLabel = map.getStyle().layers?.find((styleLayer) => styleLayer.type === 'symbol')?.id
    map.addLayer({
      id: displayLayerId,
      type: 'fill',
      source: sourceId,
      layout: { visibility: layoutVisibility },
      paint: {
        'fill-color': category.color,
        'fill-opacity': 0.2,
        'fill-outline-color': 'rgba(0,0,0,0)',
      },
    }, firstLabel)
    if (layer.id === 'stay') {
      map.addLayer({
        id: `${displayLayerId}-highlight`,
        type: 'line',
        source: sourceId,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: layoutVisibility,
        },
        paint: {
          'line-color': '#67c96a',
          'line-opacity': 0,
          'line-width': 0,
          'line-blur': 5,
        },
      }, firstLabel)
    }
  }

  return displayLayerId
}
