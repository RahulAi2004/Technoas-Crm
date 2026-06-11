import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(null)

let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const toast = useCallback((msg, kind = 'info') => {
    const id = nextId++
    setToasts((t) => [...t, { id, msg, kind, leaving: false }])
    timers.current[id] = setTimeout(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)))
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 220)
    }, 2200)
  }, [])

  const colors = {
    success: 'bg-emerald-600 text-white',
    info:    'bg-slate-800 text-white',
    error:   'bg-rose-600 text-white',
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col items-end gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-lg ${colors[t.kind] || colors.info} px-3 py-2 text-sm font-semibold shadow-lg transition-all duration-200 ${t.leaving ? 'translate-y-2 opacity-0' : ''}`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
