import { createContext, useContext, useEffect, useState } from "react"

/**
 * Tema claro / oscuro / sistema. Implementación propia (en lugar de
 * next-themes) porque next-themes inyecta un script inline que la CSP estricta
 * de la SPA bloquea. El primer pintado lo resuelve public/theme-init.js.
 */
export type Theme = "light" | "dark" | "system"

const STORAGE_KEY = "medilu-theme"
const DARK_QUERY = "(prefers-color-scheme: dark)"

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: "light" | "dark"
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStored(): Theme {
  try {
    const t = localStorage.getItem(STORAGE_KEY)
    return t === "light" || t === "dark" ? t : "system"
  } catch {
    return "system"
  }
}

function systemPrefersDark() {
  return window.matchMedia(DARK_QUERY).matches
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // Sigue los cambios del sistema (p. ej. modo oscuro automático al anochecer).
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY)
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", resolvedTheme === "dark")
    root.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  function setTheme(t: Theme) {
    setThemeState(t)
    try {
      if (t === "system") localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, t)
    } catch {
      /* sin localStorage: el tema dura solo esta sesión */
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>")
  return ctx
}
