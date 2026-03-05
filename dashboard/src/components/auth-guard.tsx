import { Navigate } from "react-router"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { useHealth } from "@/hooks/use-health"

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading: authLoading } = useAuth()
  const { health, loading: healthLoading } = useHealth()

  // Wait for both auth and health before making redirect decisions
  if (authLoading || healthLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    // No admin exists yet — go straight to setup wizard
    if (health && !health.bootstrap_complete) {
      return <Navigate to="/dashboard/setup" replace />
    }
    return <Navigate to="/dashboard/login" replace />
  }

  return <>{children}</>
}
