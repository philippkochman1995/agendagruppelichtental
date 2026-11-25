import { useEffect, useState } from 'react'

// Workshop photos for the start screen. Add more pictures to public/workshop/ and list them here;
// with more than one photo the frame turns into a slideshow.
const PHOTOS = [
  { src: 'intro-workshop.png', alt: 'Workshop im Innenhof: Nachbar:innen sitzen an Tischen im Grünen und planen gemeinsam' },
]

export function IntroPhotos() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    if (PHOTOS.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setActive((index) => (index + 1) % PHOTOS.length), 3800)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <div className="intro-photos" aria-roledescription={PHOTOS.length > 1 ? 'Diashow' : undefined}>
      {PHOTOS.map((photo, index) => (
        <figure
          key={photo.src}
          className={`intro-photo ${index === active ? 'is-active' : ''} ${index === (active + 1) % PHOTOS.length && PHOTOS.length > 1 ? 'is-next' : ''}`}
          style={{ '--tilt': `${index % 2 ? 2.5 : -3}deg` } as React.CSSProperties}
          aria-hidden={index !== active}
        >
          <img src={photo.src} alt={photo.alt} />
        </figure>
      ))}
    </div>
  )
}
