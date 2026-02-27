import { useState, useEffect } from "react"
import { NavLink } from "react-router"
import {
  LayoutDashboard,
  Activity,
  CheckCircle,
  FileText,
  KeyRound,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { logout } from "@/lib/api"
import type { UserInfo } from "@/lib/api"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const STORAGE_KEY = "edictum-sidebar-collapsed"

interface SidebarProps {
  user: UserInfo
  pendingApprovals?: number
  onLogout: () => void
}

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/dashboard/events", icon: Activity, label: "Events" },
  {
    to: "/dashboard/approvals",
    icon: CheckCircle,
    label: "Approvals",
    badge: "pendingApprovals" as const,
  },
  { to: "/dashboard/contracts", icon: FileText, label: "Contracts" },
  { to: "/dashboard/keys", icon: KeyRound, label: "API Keys" },
  { to: "/dashboard/settings", icon: Settings, label: "Settings" },
]

export function Sidebar({ user, pendingApprovals, onLogout }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true"
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed))
    } catch {
      // localStorage unavailable
    }
  }, [collapsed])

  async function handleLogout() {
    try {
      await logout()
    } finally {
      onLogout()
    }
  }

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
          collapsed ? "w-14" : "w-56",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          {!collapsed && (
            <h1 className="text-sm font-semibold tracking-tight text-sidebar-foreground">
              Edictum Console
            </h1>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed((p) => !p)}
            className={cn(
              "h-7 w-7 shrink-0 text-muted-foreground hover:text-sidebar-foreground",
              collapsed && "mx-auto",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2">
          {navItems.map((item) => {
            const link = (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/dashboard"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-md text-sm font-medium transition-colors",
                    collapsed
                      ? "justify-center px-2 py-2"
                      : "gap-2 px-3 py-2",
                    isActive
                      ? "bg-sidebar-accent text-primary"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {item.badge === "pendingApprovals" &&
                      pendingApprovals !== undefined &&
                      pendingApprovals > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                          {pendingApprovals}
                        </span>
                      )}
                  </>
                )}
                {collapsed &&
                  item.badge === "pendingApprovals" &&
                  pendingApprovals !== undefined &&
                  pendingApprovals > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                      {pendingApprovals}
                    </span>
                  )}
              </NavLink>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>
                    <div className="relative">{link}</div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {item.label}
                    {item.badge === "pendingApprovals" &&
                      pendingApprovals !== undefined &&
                      pendingApprovals > 0 &&
                      ` (${pendingApprovals})`}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return link
          })}
        </nav>

        {/* Footer */}
        <div className="p-3">
          <Separator className="mb-3" />
          {!collapsed && (
            <p className="truncate px-2 text-xs text-muted-foreground">
              {user.email}
            </p>
          )}
          <div
            className={cn(
              "mt-2 flex items-center",
              collapsed ? "flex-col gap-1 px-0" : "gap-1 px-1",
            )}
          >
            <ThemeToggle />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Sign out</TooltipContent>
              )}
            </Tooltip>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}
