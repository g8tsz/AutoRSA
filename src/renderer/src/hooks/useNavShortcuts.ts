import { useEffect } from 'react'

type NavId = 'dashboard' | 'tasks' | 'settings'

export function useNavShortcuts(setNav: (id: NavId) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        setNav('dashboard')
      }
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        setNav('tasks')
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        setNav('settings')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setNav])
}
