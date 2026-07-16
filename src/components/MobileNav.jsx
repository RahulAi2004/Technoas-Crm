import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// The drawer is driven by body[data-nav]; CSS in index.css does the sliding.
export const openNav = () => { document.body.dataset.nav = 'open' }
export const closeNav = () => { document.body.dataset.nav = 'closed' }

// Fixed mobile header (hamburger + logo) + the tap-to-close overlay.
// Hidden on lg+ via CSS. Render once inside any page shell.
export default function MobileNav() {
  const loc = useLocation()

  // close the drawer whenever the route changes
  useEffect(() => { closeNav() }, [loc.pathname])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeNav() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); closeNav() }
  }, [])

  return (
    <>
      <header className="crm-mobile-header">
        <button
          type="button"
          onClick={openNav}
          aria-label="Open menu"
          className="grid h-9 w-9 place-items-center rounded-lg text-white hover:bg-white/10 active:bg-white/20"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <img src="/logo.jpg" alt="Decoinks" className="h-6 rounded bg-white px-1" />
      </header>
      <div className="crm-nav-overlay" onClick={closeNav} aria-hidden="true" />
    </>
  )
}
