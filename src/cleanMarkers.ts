import type { CategoryId, MapCategory } from './types'

function drawGlyph(ctx: CanvasRenderingContext2D, id: CategoryId, color: string, scale = 1.55) {
  ctx.save()
  ctx.translate(40, 40)
  ctx.scale(scale, scale)
  ctx.translate(-12, -12)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  switch (id) {
    case 'green':
      ctx.moveTo(4, 20)
      ctx.bezierCurveTo(3, 10, 9, 4, 21, 3)
      ctx.bezierCurveTo(21, 14, 16, 20, 5, 20)
      ctx.moveTo(5, 20)
      ctx.quadraticCurveTo(11, 13, 18, 8)
      break
    case 'active-mobility':
      ctx.arc(5, 17, 3, 0, Math.PI * 2)
      ctx.moveTo(22, 17)
      ctx.arc(19, 17, 3, 0, Math.PI * 2)
      ctx.moveTo(5, 17)
      ctx.lineTo(9, 8)
      ctx.lineTo(14, 17)
      ctx.lineTo(5, 17)
      ctx.moveTo(14, 17)
      ctx.lineTo(19, 17)
      ctx.lineTo(16, 8)
      ctx.lineTo(19, 8)
      ctx.moveTo(8, 8)
      ctx.lineTo(11, 8)
      break
    case 'leisure':
      ctx.moveTo(4, 9)
      ctx.lineTo(20, 9)
      ctx.moveTo(4, 14)
      ctx.lineTo(20, 14)
      ctx.moveTo(6, 14)
      ctx.lineTo(5, 20)
      ctx.moveTo(18, 14)
      ctx.lineTo(19, 20)
      ctx.moveTo(6, 6)
      ctx.lineTo(6, 9)
      ctx.moveTo(18, 6)
      ctx.lineTo(18, 9)
      break
    case 'water-cleanliness':
      ctx.moveTo(12, 3)
      ctx.bezierCurveTo(9, 8, 5, 12, 5, 16)
      ctx.arc(12, 16, 7, Math.PI, 0, true)
      ctx.bezierCurveTo(19, 12, 15, 8, 12, 3)
      break
    case 'parking':
      ctx.moveTo(7, 20)
      ctx.lineTo(7, 4)
      ctx.lineTo(14, 4)
      ctx.bezierCurveTo(20, 4, 20, 12, 14, 12)
      ctx.lineTo(7, 12)
      break
    case 'culture':
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 5
        const radius = i % 2 === 0 ? 9 : 4
        const x = 12 + Math.cos(angle) * radius
        const y = 12 + Math.sin(angle) * radius
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      break
    case 'ground-floor':
      ctx.moveTo(4, 10)
      ctx.lineTo(6, 5)
      ctx.lineTo(18, 5)
      ctx.lineTo(20, 10)
      ctx.moveTo(5, 10)
      ctx.lineTo(5, 20)
      ctx.lineTo(19, 20)
      ctx.lineTo(19, 10)
      ctx.moveTo(10, 20)
      ctx.lineTo(10, 13)
      ctx.lineTo(15, 13)
      ctx.lineTo(15, 20)
  }
  ctx.stroke()
  ctx.restore()
}

function canvas() {
  const element = document.createElement('canvas')
  element.width = element.height = 80
  return element
}

function paintMarker(category: MapCategory, cluster: boolean) {
  const element = canvas()
  const ctx = element.getContext('2d')!
  ctx.shadowColor = 'rgba(0, 60, 43, .18)'
  ctx.shadowBlur = 7
  ctx.shadowOffsetY = 3
  ctx.fillStyle = cluster ? '#fffaf1' : category.color
  ctx.beginPath()
  ctx.arc(40, 38, 29, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.strokeStyle = cluster ? category.color : '#fffaf1'
  ctx.lineWidth = cluster ? 5 : 3
  ctx.stroke()
  if (!cluster) drawGlyph(ctx, category.id, '#fff', 1.55)
  return element
}

const glyphCache = new Map<CategoryId, string>()
export function glyphDataUrl(categoryId: CategoryId) {
  const cached = glyphCache.get(categoryId)
  if (cached) return cached
  const element = canvas()
  drawGlyph(element.getContext('2d')!, categoryId, '#003c2b', 1.8)
  const url = element.toDataURL()
  glyphCache.set(categoryId, url)
  return url
}

const markerCache = new Map<string, string>()
export function markerUrl(category: MapCategory, cluster = false) {
  const key = `${category.id}:${cluster}`
  const cached = markerCache.get(key)
  if (cached) return cached
  const url = paintMarker(category, cluster).toDataURL()
  markerCache.set(key, url)
  return url
}

/** A round marker in its own colour with a white line glyph (drawn in a 24 × 24 box), like the category markers */
function specialMarker(color: string, glyph: (ctx: CanvasRenderingContext2D) => void) {
  const element = canvas()
  const ctx = element.getContext('2d')!
  ctx.shadowColor = 'rgba(0, 60, 43, .18)'
  ctx.shadowBlur = 7
  ctx.shadowOffsetY = 3
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(40, 38, 29, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.strokeStyle = '#fffaf1'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.save()
  ctx.translate(40, 39)
  ctx.scale(1.6, 1.6)
  ctx.translate(-12, -12)
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'
  ctx.lineWidth = 1.9
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  glyph(ctx)
  ctx.restore()
  return element.toDataURL()
}

/** the blue unicorn of the Lichtental: a unicorn head (horn, ear, mane), looking left */
export const UNICORN_BLUE = '#3f86d6'
let unicornUrl: string | null = null
export function unicornMarkerUrl() {
  unicornUrl ??= specialMarker(UNICORN_BLUE, (ctx) => {
    ctx.beginPath()
    ctx.moveTo(9, 21)
    ctx.lineTo(9.5, 15.5)
    ctx.lineTo(4.5, 14)
    ctx.quadraticCurveTo(3.2, 12.6, 4.6, 11)
    ctx.lineTo(9.5, 7.2)
    ctx.quadraticCurveTo(12.5, 5.6, 14.8, 6.6)
    ctx.quadraticCurveTo(18.6, 9.5, 18.4, 21)
    ctx.moveTo(9.6, 7.4)
    ctx.lineTo(6.6, 1.8)
    ctx.lineTo(11.6, 6.4)
    ctx.moveTo(13.2, 6.1)
    ctx.lineTo(14.6, 3)
    ctx.lineTo(15.4, 7.2)
    ctx.moveTo(15.4, 7.2)
    ctx.quadraticCurveTo(20.8, 9.5, 20.2, 15.5)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(9.4, 10.4, 1, 0, Math.PI * 2)
    ctx.fill()
  })
  return unicornUrl
}

/** quotes of the neighbours: a plain speech bubble with a bold line, in a WhatsApp-like green of its own */
export const QUOTE_COLOR = '#32c669'
let quoteUrl: string | null = null
export function quoteMarkerUrl() {
  quoteUrl ??= specialMarker(QUOTE_COLOR, (ctx) => {
    ctx.lineWidth = 2.6
    ctx.beginPath()
    ctx.moveTo(7, 4.5)
    ctx.lineTo(17, 4.5)
    ctx.quadraticCurveTo(20.5, 4.5, 20.5, 8)
    ctx.lineTo(20.5, 12.5)
    ctx.quadraticCurveTo(20.5, 16, 17, 16)
    ctx.lineTo(11.5, 16)
    ctx.lineTo(6.5, 20)
    ctx.lineTo(7.3, 16)
    ctx.quadraticCurveTo(3.5, 16, 3.5, 12.5)
    ctx.lineTo(3.5, 8)
    ctx.quadraticCurveTo(3.5, 4.5, 7, 4.5)
    ctx.closePath()
    ctx.stroke()
  })
  return quoteUrl
}
