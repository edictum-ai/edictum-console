import { Outlet, useNavigate } from "react-router"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sidebar } from "@/components/sidebar"
import { MobileHeader } from "@/components/mobile-header"
import { useAuth } from "@/hooks/use-auth"
import { useStats } from "@/hooks/use-stats"
import { useIsMobile } from "@/hooks/use-mobile"

export function DashboardLayout() {
  const { user, loading } = useAuth()
  const { data: stats } = useStats()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

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

  const handleLogout = () => void navigate("/dashboard/login")

  return (
    <div className={cn("flex h-screen", isMobile ? "flex-col" : "flex-row")}>
      {!isMobile && (
        <Sidebar
          user={user}
          pendingApprovals={stats?.pending_approvals}
          onLogout={handleLogout}
        />
      )}
      {isMobile && (
        <MobileHeader
          user={user}
          pendingApprovals={stats?.pending_approvals}
          onLogout={handleLogout}
        />
      )}

      <main className="flex-1 overflow-auto bg-ambient-glow">
        <Outlet />
      </main>
    </div>
  )
}
