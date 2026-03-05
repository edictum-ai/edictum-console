import { useState, useEffect, useCallback } from "react"

type Theme = "light" | "dark"

const STORAGE_KEY = "edictum_theme"

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "light" || stored === "dark") return stored
  } catch {
    // localStorage unavailable (private browsing, hardened browser)
  }
  return "dark"
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // localStorage unavailable
    }
  }, [theme])

  const toggle = useCallback(() => {
    setThemeState((t) => (t === "dark" ? "light" : "dark"))
  }, [])

  return { theme, toggle }
}
