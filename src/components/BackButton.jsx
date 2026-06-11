import { useNavigate } from 'react-router-dom'

// Goes back in history; falls back to the dashboard if there's nowhere to go.
export default function BackButton() {
  const navigate = useNavigate()
  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/dashboard')
  }
  return (
    <button onClick={goBack} title="Back" aria-label="Back"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
    </button>
  )
}
