import { useEffect, useRef, useState } from 'react'

export default function Dropdown({ trigger, align = 'left', menuClassName = '', children, onPick }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('click', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const handlePick = (val, label) => { onPick?.(val, label); setOpen(false) }

  return (
    <div ref={ref} data-dropdown data-open={open || undefined}>
      <span onClick={() => setOpen((x) => !x)}>{trigger}</span>
      <div data-dropdown-menu data-align={align === 'right' ? 'right' : undefined} className={`mt-1 ${menuClassName}`}>
        {typeof children === 'function' ? children(handlePick) : children}
      </div>
    </div>
  )
}
