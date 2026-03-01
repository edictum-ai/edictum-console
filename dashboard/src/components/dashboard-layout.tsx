import { Outlet, useNavigate } from "react-router"
import { Loader2 } from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { useAuth } from "@/hooks/use-auth"
import { useStats } from "@/hooks/use-stats"

export function DashboardLayout() {
  const { user, loading } = useAuth()
  const { data: stats } = useStats()
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        user={user}
        pendingApprovals={stats?.pending_approvals}
        onLogout={() => void navigate("/dashboard/login")}
      />
      <main className="flex-1 overflow-auto bg-ambient-glow">
        <Outlet />
      </main>
    </div>
  )
}
