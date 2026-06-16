import { useEffect } from 'react'

export function useTheme(theme: 'dark' | 'light'): void {
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('arsa_theme', theme)
    } catch {
      /* ignore */
    }
  }, [theme])
}
