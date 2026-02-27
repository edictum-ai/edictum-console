import { useState, useEffect, useCallback } from "react"
import { getMe, type UserInfo, ApiError } from "@/lib/api"

interface AuthState {
  user: UserInfo | null
  loading: boolean
  error: string | null
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  })

  const checkAuth = useCallback(async () => {
    try {
      setState((s) => ({ ...s, loading: true, error: null }))
      const user = await getMe()
      setState({ user, loading: false, error: null })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setState({ user: null, loading: false, error: null })
      } else {
        setState({
          user: null,
          loading: false,
          error: "Failed to check authentication",
        })
      }
    }
  }, [])

  useEffect(() => {
    void checkAuth()
  }, [checkAuth])

  return { ...state, refresh: checkAuth }
}
