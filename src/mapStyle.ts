import type mapboxgl from 'mapbox-gl'
import { MAP_LOOK } from './mapConfig'

// Isometric look: pale lavender buildings, white streets, soft mint greens, lavender water
const ISO_COLORS: Record<string, string> = {
  colorLand: '#f5f5f9',
  colorBuildings: '#dedcf1',
  colorRoads: '#ffffff',
  colorMotorways: '#ffffff',
  colorTrunks: '#ffffff',
  colorWater: '#d6d7f2',
  colorGreenspace: '#d5ebd2',
  colorPlaceLabels: '#5d5f78',
  colorRoadLabels: '#7a7c94',
  colorPointOfInterestLabels: '#7a7c94',
}

export function applyWarm3DStyle(map: mapboxgl.Map) {
  try {
    map.setConfigProperty('basemap', 'lightPreset', 'day')
    map.setConfigProperty('basemap', 'show3dObjects', true)
    const google: Record<string, string> = {
      colorLand: '#f7f7f6',
      colorBuildings: '#f3dcb4',
      colorRoads: '#fafbfb',
      colorMotorways: '#ffd98a',
      colorTrunks: '#ffe3a6',
      colorWater: '#93cfe8',
      colorGreenspace: '#a2cf86',
      colorPlaceLabels: '#4a4036',
      colorRoadLabels: '#6b5f52',
      colorPointOfInterestLabels: '#6b5f52',
    }
    Object.entries(MAP_LOOK === 'iso' ? ISO_COLORS : google).forEach(([key, value]) => {
      try { map.setConfigProperty('basemap', key, value) } catch { /* option not available in this style version */ }
    })
  } catch {
    // The Mapbox Standard basemap exposes this config; custom styles may not.
  }
  // isometric: no vanishing point
  if (MAP_LOOK === 'iso') {
    try { map.setCamera({ 'camera-projection': 'orthographic' }) } catch { /* older style spec */ }
  }
  const style = map.getStyle()
  style.layers?.forEach((layer) => {
    if (layer.id.startsWith('graetzl-') || layer.id.startsWith('liechtenthal-')) return
    const sourceLayer = 'source-layer' in layer ? String(layer['source-layer'] ?? '') : ''
    const identity = `${layer.id} ${sourceLayer}`.toLowerCase()
    try {
      const iso = MAP_LOOK === 'iso'
      if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', iso ? '#f5f5f9' : '#f2efe9')
      if (layer.type === 'fill' && /water/.test(identity)) map.setPaintProperty(layer.id, 'fill-color', iso ? '#d6d7f2' : '#aadaff')
      if (layer.type === 'fill' && /park|grass|wood|forest|vegetation/.test(identity)) {
        map.setPaintProperty(layer.id, 'fill-color', iso ? '#d5ebd2' : '#c8e8b4')
        map.setPaintProperty(layer.id, 'fill-opacity', 0.76)
      }
      if (layer.type === 'line' && /road|street|transportation/.test(identity)) {
        map.setPaintProperty(layer.id, 'line-color', '#ffffff')
        map.setPaintProperty(layer.id, 'line-opacity', 0.72)
      }
      if (layer.type === 'symbol') {
        map.setPaintProperty(layer.id, 'text-color', MAP_LOOK === 'iso' ? '#6d6f86' : '#5f6368')
        map.setPaintProperty(layer.id, 'text-halo-color', '#ffffff')
      }
    } catch {
      // Some style layers intentionally do not expose every generic paint property.
    }
  })
}
