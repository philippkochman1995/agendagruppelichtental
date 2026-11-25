// Intro for the Mapbox map: the start shows the whole of Vienna from above, the camera zooms straight down
// onto the Grätzl and only then tilts into the start camera.
import type mapboxgl from 'mapbox-gl'
import { startCamera } from './mapConfig'

export const viennaCamera = {
  center: [16.3592, 48.2255] as [number, number],
  zoom: 14.8,
  pitch: 0,
  bearing: 0,
}

/** Zoom from Vienna straight down onto the Grätzl (still from above), then tilt into the start camera */
export function zoomIntoGraetzl(map: mapboxgl.Map, zoomDuration = 4000, tiltDuration = 1600) {
  return new Promise<void>((resolve) => {
    map.once('moveend', () => {
      map.once('moveend', () => resolve())
      map.easeTo({ ...startCamera, duration: tiltDuration, essential: true })
    })
    map.flyTo({ center: startCamera.center, zoom: startCamera.zoom, pitch: 0, bearing: 0, duration: zoomDuration, curve: 1.2, essential: true })
  })
}
