import { useState, useEffect, useCallback } from "react"

type Theme = "light" | "dark"

const STORAGE_KEY = "edictum_theme"

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === "light" || stored === "dark") return stored
  return "dark"
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggle = useCallback(() => {
    setThemeState((t) => (t === "dark" ? "light" : "dark"))
  }, [])

  return { theme, toggle }
}
