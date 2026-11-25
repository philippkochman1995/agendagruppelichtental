import type { MapCategory, MapLayer } from './types'

const LITA = 'https://services-eu1.arcgis.com/bzJgidEyiimiAx34/arcgis/rest/services/LITA_shapes/FeatureServer'
const DRIVE = 'https://services-eu1.arcgis.com/bzJgidEyiimiAx34/arcgis/rest/services/drive_download_20240428T114703Z_001/FeatureServer'

export const categories: MapCategory[] = [
  { id: 'green', label: 'Grün & Klima', shortLabel: 'Grün', description: 'Bäume, Schatten und kühlende Oberflächen', color: '#31a846', glyph: 'leaf', emoji: '🌳', initiallyVisible: true },
  { id: 'active-mobility', label: 'Rad & Fuß', shortLabel: 'Mobil', description: 'Radwege, Abstellplätze und sichere Querungen', color: '#4b7bd8', glyph: 'bike', emoji: '🚲', initiallyVisible: true },
  { id: 'leisure', label: 'Aufenthalt & Freizeit', shortLabel: 'Freiraum', description: 'Sitzen, Spielen und gemeinsam draußen sein', color: '#f28c23', glyph: 'bench', emoji: '🛝', initiallyVisible: true },
  { id: 'water-cleanliness', label: 'Wasser & Sauberkeit', shortLabel: 'Wasser', description: 'Trinkwasser, Abkühlung und Müll', color: '#4aa8ca', glyph: 'drop', emoji: '🚰', initiallyVisible: true },
  { id: 'parking', label: 'Parken & Laden', shortLabel: 'Parken', description: 'Parkflächen und Ladezonen', color: '#7e72e8', glyph: 'parking', emoji: '🅿️', initiallyVisible: true },
  { id: 'culture', label: 'Kultur & Identität', shortLabel: 'Kultur', description: 'Geschichten, Kulturorte und Besonderheiten', color: '#ff55b8', glyph: 'star', emoji: '🎭', initiallyVisible: true },
  { id: 'ground-floor', label: 'Erdgeschoß & Nutzung', shortLabel: 'Nutzung', description: 'Aktive Erdgeschoßzonen und lokale Angebote', color: '#8c6a4d', glyph: 'shop', emoji: '🏪', initiallyVisible: true },
]

export const mapLayers: MapLayer[] = [
  { id: 'greening', label: 'Begrünung', categoryId: 'green', url: `${LITA}/13`, geometry: 'point', emoji: '🌳' },
  { id: 'shade', label: 'Schattenplatz', categoryId: 'green', url: `${LITA}/6`, geometry: 'point', emoji: '⛱️' },
  { id: 'surface', label: 'Oberfläche', categoryId: 'green', url: `${LITA}/19`, geometry: 'polygon' },
  { id: 'bike-parking', label: 'Radabstellplatz', categoryId: 'active-mobility', url: `${LITA}/1`, geometry: 'point', emoji: '🚲' },
  { id: 'bike-link', label: 'Radverbindung', categoryId: 'active-mobility', url: `${LITA}/17`, geometry: 'line' },
  { id: 'walking-link', label: 'Querung / Gehweg', categoryId: 'active-mobility', url: `${LITA}/16`, geometry: 'line' },
  { id: 'traffic-calming', label: 'Verkehrsberuhigung', categoryId: 'active-mobility', url: `${DRIVE}/10`, geometry: 'point', emoji: '🚸' },
  { id: 'stay', label: 'Aufenthaltsbereich', categoryId: 'leisure', url: `${LITA}/22`, geometry: 'polygon' },
  { id: 'seat', label: 'Sitzgelegenheit', categoryId: 'leisure', url: `${LITA}/15`, geometry: 'point', emoji: '🪑' },
  { id: 'play-sport', label: 'Spiel & Sport', categoryId: 'leisure', url: `${DRIVE}/9`, geometry: 'point', emoji: '⚽' },
  { id: 'drinking', label: 'Trinkbrunnen / Abkühlung', categoryId: 'water-cleanliness', url: `${DRIVE}/8`, geometry: 'point', emoji: '🚰' },
  { id: 'waste', label: 'Müllsammelstelle', categoryId: 'water-cleanliness', url: `${DRIVE}/7`, geometry: 'point', emoji: '🗑️' },
  { id: 'parking-space', label: 'Parkplatz', categoryId: 'parking', url: `${LITA}/21`, geometry: 'polygon' },
  { id: 'parking-extension', label: 'Parkerweiterung', categoryId: 'parking', url: `${LITA}/18`, geometry: 'polygon' },
  { id: 'loading', label: 'Ladezone', categoryId: 'parking', url: `${LITA}/20`, geometry: 'polygon' },
  { id: 'culture-place', label: 'Kulturort', categoryId: 'culture', url: `${LITA}/14`, geometry: 'point', emoji: '🎭' },
  { id: 'quote', label: 'Grätzl-Zitat', categoryId: 'culture', url: `${DRIVE}/0`, geometry: 'point', emoji: '💬' },
  { id: 'unicorn', label: 'Besonderer Ort', categoryId: 'culture', url: `${LITA}/11`, geometry: 'point', emoji: '🦄' },
  { id: 'ground-use', label: 'Erdgeschoßnutzung', categoryId: 'ground-floor', url: `${LITA}/12`, geometry: 'point', emoji: '🏪' },
]

export const initialVisibleCategoryIds = new Set(
  categories.filter((category) => category.initiallyVisible).map((category) => category.id),
)
