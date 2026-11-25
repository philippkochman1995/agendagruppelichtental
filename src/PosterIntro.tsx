import { useEffect, useRef } from 'react'
import { IntroClouds } from './IntroClouds'

interface PosterIntroProps {
  onEnter(): void
  waiting: boolean
  leaving: boolean
}

export function PosterBackdrop() {
  return (
    <div className="poster-art" aria-hidden="true">
      <IntroClouds variant="poster" />
    </div>
  )
}

export function PosterBrand() {
  return <div className="poster-brand">Entdecke das</div>
}

export function PosterStatement() {
  return <h1 id="intro-title" className="poster-statement"><span>Supergrätzl</span><strong>LICHTENTAL</strong></h1>
}

export function PosterCopy() {
  return <p id="intro-description" className="poster-copy">Im Herbst 2023 haben wir unsere Nachbar:innen eingeladen, gemeinsam mit uns dieses Supergrätzl zu planen. In je einem Workshop pro Gasse haben insgesamt 250 Personen mit ihren Ideen, Wünschen und Erfahrungen mitgemacht.</p>
}

export function PosterUnicorn() {
  // On hover the unicorn opens its eye: the closed eye of the drawing is covered and an open one drawn on top
  // (coordinates in the pixel space of intro-unicorn-danube.png, 1402 × 1122).
  return (
    <div className="poster-unicorn-stage" aria-hidden="true">
      <img className="poster-unicorn" src="intro-unicorn-danube.png" alt="" draggable={false} />
      <svg className="poster-unicorn-eye" viewBox="0 0 1402 1122" aria-hidden="true">
        <ellipse cx="987" cy="742" rx="96" ry="52" fill="#f7f2eb" />
        <g className="poster-unicorn-eye-open">
          <path d="M912 744Q984 668 1062 736Q988 806 912 744Z" fill="#fff" stroke="#033d1e" strokeWidth="22" strokeLinejoin="round" />
          <circle cx="1000" cy="738" r="28" fill="#033d1e" />
          <circle cx="1010" cy="728" r="8" fill="#fff" />
        </g>
      </svg>
    </div>
  )
}

/**
 * The start button fills like a loading bar while the map loads behind it: smoothly towards the end while waiting,
 * then quickly to full once everything is there. Ready, it gives a small nudge now and then.
 */
export function PosterButton({ onEnter, waiting, leaving }: PosterIntroProps) {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = button.current
    if (!element) return
    let progress = Number(element.style.getPropertyValue('--load')) || 0
    let last = performance.now()
    let frame = 0
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      // waiting: ease towards 94 % (never quite there); ready: glide to full in about half a second
      progress = waiting ? progress + (0.94 - progress) * (1 - Math.exp(-dt / 2.4)) : Math.min(1, progress + dt * 2.2)
      element.style.setProperty('--load', progress.toFixed(4))
      if (waiting || progress < 1) frame = requestAnimationFrame(step)
      else element.classList.add('is-ready')
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [waiting])
  return (
    <button ref={button} className="intro-button poster-button" type="button" aria-label="Supergrätzl entdecken" onClick={onEnter} disabled={waiting || leaving} data-wait={waiting ? '' : undefined} autoFocus>
      <span>Supergrätzl entdecken</span><span aria-hidden="true">→</span>
    </button>
  )
}

export function PosterIntro(props: PosterIntroProps) {
  return (
    <div className="intro-panel poster-panel">
      <div className="poster-emblem">
        <PosterBrand />
        <PosterStatement />
        <div className="poster-story">
          <PosterUnicorn />
          <PosterCopy />
        </div>
      </div>
      <div className="poster-action">
        <PosterButton {...props} />
      </div>
    </div>
  )
}
