import type { DemoDetail, FeatureSummary } from './types'

const quoteMarks = /^[„“"']|[„“"']$/g

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null
  const text = String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text || text === '[object Object]') return null
  return text
}

function propertyText(properties: Record<string, unknown>, names: string[]) {
  const wanted = new Set(names.map((name) => name.toLowerCase()))
  const match = Object.entries(properties).find(([key, value]) => wanted.has(key.toLowerCase()) && cleanText(value))
  return match ? cleanText(match[1]) : null
}

function propertyTextByPrefix(properties: Record<string, unknown>, prefixes: string[]) {
  const normalizedPrefixes = prefixes.map((prefix) => prefix.toLowerCase())
  const match = Object.entries(properties).find(([key, value]) => {
    const normalizedKey = key.toLowerCase()
    return normalizedPrefixes.some((prefix) => normalizedKey.startsWith(prefix)) && cleanText(value)
  })
  return match ? cleanText(match[1]) : null
}

function formatQuote(text: string) {
  const stripped = text.replace(quoteMarks, '').trim()
  return `„${stripped}“`
}

export function annotationText(properties: Record<string, unknown>) {
  return propertyText(properties, ['Anmerkungen', 'Anmerkung', 'Anmerkunge']) ?? propertyTextByPrefix(properties, ['anmerk'])
}

export function kindText(properties: Record<string, unknown>) {
  return propertyText(properties, ['Art']) ?? propertyTextByPrefix(properties, ['art'])
}

export function featureHasDetail(properties: Record<string, unknown>) {
  return Boolean(annotationText(properties) || kindText(properties))
}

export function getDemoDetail(feature: FeatureSummary): DemoDetail | null {
  const annotation = annotationText(feature.properties)
  const kind = kindText(feature.properties)
  if (!annotation && !kind) return null

  const author = propertyText(feature.properties, ['Autor', 'Author', 'Person', 'Von', 'Name'])
  const source = propertyText(feature.properties, ['Quelle', 'Source', 'Ort', 'Kontext'])
  const description = annotation ? [kind, author, source].filter(Boolean).join(' · ') : [author, source].filter(Boolean).join(' · ')
  const title = annotation ?? kind

  return {
    title: feature.layerId === 'quote' && annotation ? formatQuote(annotation) : title!,
    description,
  }
}
