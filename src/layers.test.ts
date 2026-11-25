import { describe, expect, it } from 'vitest'
import { categories, initialVisibleCategoryIds, mapLayers } from './layers'

describe('layer configuration', () => {
  it('groups 19 unique layers into seven categories', () => {
    expect(categories).toHaveLength(7)
    expect(mapLayers).toHaveLength(19)
    expect(new Set(mapLayers.map((layer) => layer.id)).size).toBe(19)
    expect(mapLayers.every((layer) => categories.some((category) => category.id === layer.categoryId))).toBe(true)
  })

  it('shows every category from the start (the filter is gone, so nothing may stay hidden)', () => {
    expect([...initialVisibleCategoryIds]).toEqual(categories.map((category) => category.id))
  })

  it('uses only the preferred source for duplicated themes', () => {
    const preferred = ['stay', 'parking-space', 'parking-extension', 'loading', 'bike-parking']
    expect(mapLayers.filter((layer) => preferred.includes(layer.id)).every((layer) => layer.url.includes('LITA_shapes'))).toBe(true)
  })

  it('assigns a fitting emoji to every point layer and category', () => {
    expect(mapLayers.filter((layer) => layer.geometry === 'point').every((layer) => Boolean(layer.emoji))).toBe(true)
    expect(categories.every((category) => Boolean(category.emoji))).toBe(true)
  })
})
