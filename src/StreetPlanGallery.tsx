import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { plansForZone } from './streetPlans'

const chevron = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>

export function StreetPlanGallery({ zoneName, onSelectPlan }: {
  zoneName: string
  onSelectPlan?: (planId: string) => void
}) {
  const [active, setActive] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const previewRef = useRef<HTMLButtonElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; left: number } | null>(null)
  const available = useMemo(() => plansForZone(zoneName), [zoneName])
  const plan = available[Math.min(active, available.length - 1)]

  const select = (index: number) => {
    const next = (index + available.length) % available.length
    setActive(next)
    onSelectPlan?.(available[next].id)
  }

  const closeLightbox = () => {
    setLightboxOpen(false)
    previewRef.current?.focus()
  }

  useEffect(() => {
    if (!lightboxOpen) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeLightbox()
      } else if (event.key === 'ArrowLeft' && available.length > 1) {
        event.preventDefault()
        select(active - 1)
      } else if (event.key === 'ArrowRight' && available.length > 1) {
        event.preventDefault()
        select(active + 1)
      }
    }
    document.addEventListener('keydown', handleKey, true)
    return () => document.removeEventListener('keydown', handleKey, true)
  }, [active, available, lightboxOpen])

  if (!plan) return null

  return (
    <section className="street-plans" aria-label={`Straßenpläne für ${zoneName}`}>
      <div className="street-plan-slide">
        <button ref={previewRef} className="street-plan-preview" type="button" onClick={() => setLightboxOpen(true)} aria-label={`${plan.name} vergrößern`}>
          <img src={plan.image} alt={`Gescannten Straßenplan für ${plan.name} vergrößern`} loading="lazy" />
        </button>
        {available.length > 1 && (
          <>
            <button className="street-plan-arrow is-prev" type="button" onClick={() => select(active - 1)} aria-label="Vorheriger Straßenplan">{chevron}</button>
            <button className="street-plan-arrow is-next" type="button" onClick={() => select(active + 1)} aria-label="Nächster Straßenplan">{chevron}</button>
          </>
        )}
      </div>
      <div className="street-plan-meta"><span>{plan.name}</span>{available.length > 1 && <span>{active + 1} / {available.length}</span>}</div>

      {lightboxOpen && createPortal(
        <div className="plan-lightbox" role="dialog" aria-modal="true" aria-label={`${plan.name} als Großansicht`} onClick={(event) => { if (event.target === event.currentTarget) closeLightbox() }}>
          <div className="plan-lightbox-content">
            <div className="plan-lightbox-header">
              <strong>{plan.name}</strong>
              <div className="plan-lightbox-controls">
                {available.length > 1 && (
                  <>
                    <button type="button" onClick={() => select(active - 1)} aria-label="Vorheriger Straßenplan">{chevron}</button>
                    <span>{active + 1} / {available.length}</span>
                    <button className="is-next" type="button" onClick={() => select(active + 1)} aria-label="Nächster Straßenplan">{chevron}</button>
                  </>
                )}
                <button className="plan-lightbox-close" type="button" onClick={closeLightbox} aria-label="Großansicht schließen" autoFocus><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
              </div>
            </div>
            <div ref={viewportRef} className="plan-lightbox-viewport" onPointerDown={(event) => { if (event.pointerType !== 'mouse') return; dragRef.current = { x: event.clientX, left: event.currentTarget.scrollLeft }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={(event) => { if (dragRef.current) event.currentTarget.scrollLeft = dragRef.current.left - (event.clientX - dragRef.current.x) }} onPointerUp={() => { dragRef.current = null }} onPointerCancel={() => { dragRef.current = null }}>
              <img src={plan.image} alt={`Vollständiger gescannter Straßenplan für ${plan.name}`} draggable="false" onLoad={() => { if (viewportRef.current) viewportRef.current.scrollLeft = (viewportRef.current.scrollWidth - viewportRef.current.clientWidth) / 2 }} />
            </div>
          </div>
        </div>, document.body,
      )}
    </section>
  )
}
