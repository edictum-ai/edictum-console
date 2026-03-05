import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { getMe, logout as apiLogout, type UserInfo, ApiError } from "@/lib/api"

interface AuthContextValue {
  user: UserInfo | null
  loading: boolean
  error: string | null
  /** Re-check auth status from server */
  refresh: () => Promise<void>
  /** Clear user state immediately and call logout API */
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const checkAuth = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const u = await getMe()
      setUser(u)
    } catch (err) {
      setUser(null)
      if (!(err instanceof ApiError && err.status === 401)) {
        setError("Failed to check authentication")
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    // Clear local state immediately — no bounce-back even if API fails
    setUser(null)
    setLoading(false)
    setError(null)
    try {
      await apiLogout()
    } catch {
      // Cookie may already be invalid — that's fine
    }
  }, [])

  useEffect(() => {
    void checkAuth()
  }, [checkAuth])

  return (
    <AuthContext value={{ user, loading, error, refresh: checkAuth, logout }}>
      {children}
    </AuthContext>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return ctx
}
