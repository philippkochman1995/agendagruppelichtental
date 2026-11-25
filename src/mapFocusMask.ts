import type mapboxgl from 'mapbox-gl'
import { MAP_LOOK, focusAreaGeometry, focusAreaRing } from './mapConfig'

const iso = MAP_LOOK === 'iso'

const maskLayerId = 'lichtental-outside-mask'
const edgeLayerId = 'lichtental-edge-blur'
const waterLayerId = 'lichtental-outer-water'
const parkLayerId = 'lichtental-outer-parks'

export function addFocusMask(map: mapboxgl.Map) {
  if (map.getLayer(maskLayerId)) return

  // large enough to grey out all of Vienna (the intro flight starts high above the city)
  const outerRing = [
    [15.9, 47.95],
    [16.85, 47.95],
    [16.85, 48.45],
    [15.9, 48.45],
    [15.9, 47.95],
  ]

  map.addSource('lichtental-outside-mask-source', {
    type: 'geojson',
    tolerance: 0,
    attribution: '<a href="https://data.wien.gv.at/">Straßengraph: Stadt Wien</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)',
    data: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [outerRing, [...focusAreaRing].reverse()],
        },
      }],
    },
  })
  map.addLayer({
    id: 'lichtental-outside-clip',
    type: 'clip',
    source: 'lichtental-outside-mask-source',
    layout: {
      'clip-layer-types': ['model', 'symbol'],
      'clip-layer-scope': ['basemap'],
    },
  })
  map.addLayer({
    id: maskLayerId,
    type: 'fill',
    source: 'lichtental-outside-mask-source',
    paint: {
      'fill-color': iso ? '#f5f5f9' : '#f7f7f6',
      'fill-opacity': iso ? 0.45 : 0.5,
      'fill-antialias': true,
    },
  })
  map.addLayer({
    id: edgeLayerId,
    type: 'line',
    source: 'lichtental-outside-mask-source',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': iso ? '#f5f5f9' : '#f7f7f6',
      'line-width': 16,
      'line-blur': 12,
      'line-opacity': 0.7,
    },
  })
  map.addSource('lichtental-streets', {
    type: 'vector',
    url: 'mapbox://mapbox.mapbox-streets-v8',
  })
  // Standard's road labels follow lines that can extend across the clip boundary.
  map.setConfigProperty('basemap', 'showRoadLabels', false)
  map.addLayer({
    id: 'lichtental-street-names',
    type: 'symbol',
    source: 'lichtental-streets',
    'source-layer': 'road',
    filter: ['all', ['has', 'name'], ['within', focusAreaGeometry]],
    layout: {
      'symbol-placement': 'line',
      'text-field': ['get', 'name'],
      'text-size': 12,
      'text-max-angle': 30,
    },
    paint: {
      'text-color': iso ? '#6d6f86' : '#555b59',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1,
    },
  })
  // Outside the Grätzl the base map is washed out; repaint water and parks on top with their own tints.
  map.addLayer({
    id: parkLayerId,
    type: 'fill',
    source: 'lichtental-streets',
    'source-layer': 'landuse',
    filter: ['all',
      ['in', ['get', 'class'], ['literal', ['park', 'wood', 'scrub', 'cemetery', 'pitch', 'grass']]],
      ['>', ['distance', focusAreaGeometry], 0],
    ],
    paint: { 'fill-color': iso ? '#e1efde' : '#dcebd4', 'fill-opacity': 0.9, 'fill-antialias': true },
  })
  map.addLayer({
    id: waterLayerId,
    type: 'fill',
    source: 'lichtental-streets',
    'source-layer': 'water',
    filter: ['>', ['distance', focusAreaGeometry], 0],
    paint: { 'fill-color': iso ? '#dcdcf3' : '#6fbfec', 'fill-opacity': 0.95, 'fill-antialias': true },
  })
  map.addLayer({
    id: 'lichtental-white-buildings',
    type: 'fill-extrusion',
    source: 'lichtental-streets',
    'source-layer': 'building',
    filter: ['>', ['distance', focusAreaGeometry], 0],
    paint: {
      'fill-extrusion-color': iso ? '#ebeaf6' : '#f2e2cf',
      'fill-extrusion-height': ['coalesce', ['get', 'height'], 8],
      'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
      'fill-extrusion-vertical-gradient': iso,
      'fill-extrusion-opacity': iso ? 0.9 : 0.7,
    },
  })
}

export function bringFocusMaskToFront(map: mapboxgl.Map) {
  map.moveLayer(maskLayerId)
  map.moveLayer(edgeLayerId)
  map.moveLayer(parkLayerId)
  map.moveLayer(waterLayerId)
  map.moveLayer('lichtental-white-buildings')
}
