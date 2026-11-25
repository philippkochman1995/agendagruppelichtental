import type mapboxgl from 'mapbox-gl'

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
export const STYLE_URL = 'mapbox://styles/mapbox/standard'

// Map engine: 'iso' renders the Grätzl in 3D with three.js from Stadt Wien open data (src/iso), 'mapbox' uses Mapbox GL
export const MAP_ENGINE = 'iso' as 'mapbox' | 'iso'

// Map look: 'warm' (perspective 3D, warm daylight colours) or 'iso' (isometric: orthographic camera, pale lavender city)
export const MAP_LOOK = 'warm' as 'warm' | 'iso'

export const startCamera = MAP_LOOK === 'iso'
  ? {
      center: [16.358175, 48.227104] as [number, number],
      zoom: 15.9,
      pitch: 55,
      bearing: 32,
    }
  : {
      center: [16.358175, 48.227104] as [number, number],
      zoom: 15.78,
      pitch: 40,
      bearing: 0,
    }

// Camera start behind the intro: a little higher and turned, then it flies down to startCamera.
export const introCamera = {
  center: startCamera.center,
  zoom: startCamera.zoom - 1.8,
  pitch: 64,
  bearing: -16,
}
export const neighbourhoodMinZoom = 15.5

export const neighbourhoodBounds: mapboxgl.LngLatBoundsLike = [
  [16.3445, 48.2178],
  [16.3725, 48.234],
]

// Straßenachsen: Stadt Wien, STRASSENGRAPHOGD (GIP), CC BY 4.0.
// https://data.wien.gv.at/daten/geo (Stand des Abrufs: 2026-11-18)
export const focusAreaRing = [
  [16.35701536, 48.22491368],
  // Alserbachstraße
  [16.35720588, 48.22489637],
  [16.35730419, 48.22489206],
  [16.35841519, 48.22493611],
  [16.3585562, 48.22495183],
  [16.35862339, 48.22496003],
  [16.35963257, 48.22513695],
  [16.35969167, 48.22514861],
  [16.35975581, 48.22516173],
  [16.36062873, 48.22535286],
  // Julius-Tandler-Platz
  [16.36047084, 48.22587563],
  // Althanstraße
  [16.3604511, 48.22593556],
  [16.3603411, 48.22636417],
  [16.36024444, 48.2267405],
  [16.36003686, 48.22761428],
  [16.35997147, 48.22788655],
  [16.35994303, 48.22800839],
  [16.35990041, 48.22815306],
  [16.35970769, 48.22868257],
  [16.35962735, 48.22890328],
  [16.35889985, 48.22904563],
  [16.35854845, 48.22911926],
  [16.35817666, 48.22921495],
  [16.35803072, 48.22925496],
  [16.3579485, 48.22928357],
  [16.35783096, 48.22933713],
  [16.35754573, 48.22948135],
  [16.35741315, 48.22953969],
  [16.35734492, 48.22955973],
  [16.35674997, 48.22989364],
  [16.35665598, 48.22994656],
  [16.3566114, 48.22996624],
  [16.35659615, 48.22996983],
  [16.35658301, 48.22997292],
  [16.35654737, 48.22997771],
  [16.35650604, 48.22997673],
  [16.35622821, 48.22996441],
  [16.35611517, 48.22998108],
  // Liechtensteinstraße
  [16.35611376, 48.22988399],
  [16.35610433, 48.22913924],
  [16.35611023, 48.22808668],
  [16.35611609, 48.22803209],
  [16.35627687, 48.22750069],
  [16.35633557, 48.22729658],
  [16.35635585, 48.22724655],
  [16.35647434, 48.2269532],
  [16.35671449, 48.22637302],
  [16.35699634, 48.22572757],
  [16.35701882, 48.22567164],
  [16.35702227, 48.2253696],
  [16.35701536, 48.22491368],
]

export const focusAreaGeometry = {
  type: 'Polygon',
  coordinates: [focusAreaRing],
} as const
