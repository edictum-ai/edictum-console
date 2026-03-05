// Single cohesive component — brand header, nav sections, user footer.
// Intentionally over 200 lines. Do not split.

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
  Bot,
} from "lucide-react"
import { EdictumLogo } from "@/components/edictum-logo"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/hooks/use-auth"
import type { UserInfo } from "@/lib/api"
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
  /** When true, render expanded and hide the collapse toggle (used inside mobile Sheet). */
  forceExpanded?: boolean
}

const navMonitor = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { to: "/dashboard/agents", icon: Bot, label: "Agents" },
  { to: "/dashboard/events", icon: Activity, label: "Events" },
  { to: "/dashboard/approvals", icon: CheckCircle, label: "Approvals", hasBadge: true },
]

const navManage = [
  { to: "/dashboard/contracts", icon: FileText, label: "Contracts" },
  { to: "/dashboard/keys", icon: KeyRound, label: "API Keys" },
]

export function Sidebar({ user, pendingApprovals, forceExpanded }: SidebarProps) {
  const { logout } = useAuth()
  const [collapsed, setCollapsed] = useState(() => {
    if (forceExpanded) return false
    try {
      return localStorage.getItem(STORAGE_KEY) === "true"
    } catch {
      return false
    }
  })

  const isCollapsed = forceExpanded ? false : collapsed

  useEffect(() => {
    if (forceExpanded) return
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed))
    } catch {
      // localStorage unavailable
    }
  }, [collapsed, forceExpanded])

  function handleLogout() {
    void logout()
  }

  const initials = user.email?.charAt(0).toUpperCase() ?? "U"

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
          forceExpanded ? "h-full w-[230px]" : "h-screen",
          !forceExpanded && (isCollapsed ? "w-14" : "w-[230px]"),
        )}
      >
        {/* Brand header */}
        <div
          className={cn(
            "flex items-center border-b border-sidebar-border",
            isCollapsed ? "flex-col gap-2 px-2 py-3" : "gap-3 px-4 py-3.5",
          )}
        >
          {/* Logo */}
          <EdictumLogo size={32} />

          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold leading-none text-sidebar-foreground">
                Edictum
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-widest text-sidebar-muted">
                Console
              </div>
            </div>
          )}

          {/* Collapse toggle — hidden when inside mobile Sheet */}
          {!forceExpanded && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCollapsed((p) => !p)}
                  className="h-6 w-6 shrink-0 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {isCollapsed
                    ? <PanelLeftOpen className="h-4 w-4" />
                    : <PanelLeftClose className="h-4 w-4" />
                  }
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 pt-4">
          {/* Monitor section */}
          {!isCollapsed && (
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-section-label">
              Monitor
            </div>
          )}
          <div className="space-y-0.5">
            {navMonitor.map((item) => (
              <SidebarNavItem
                key={item.to}
                item={item}
                collapsed={isCollapsed}
                pendingApprovals={pendingApprovals}
              />
            ))}
          </div>

          {/* Manage section */}
          {!isCollapsed && (
            <div className="mb-2 mt-5 px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-section-label">
              Manage
            </div>
          )}
          {isCollapsed && <div className="my-2" />}
          <div className="space-y-0.5">
            {navManage.map((item) => (
              <SidebarNavItem
                key={item.to}
                item={item}
                collapsed={isCollapsed}
              />
            ))}
          </div>
        </nav>

        {/* Footer — Settings + user */}
        <div className="border-t border-sidebar-border px-3 py-2.5">
          <SidebarNavItem
            item={{ to: "/dashboard/settings", icon: Settings, label: "Settings" }}
            collapsed={isCollapsed}
          />

          {/* User row */}
          <div
            className={cn(
              "mt-1.5 flex items-center rounded-md transition-colors hover:bg-sidebar-accent",
              isCollapsed ? "justify-center px-1 py-1.5" : "gap-2.5 px-2 py-1.5",
            )}
          >
            {isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-[10px] font-bold text-white shadow-sm">
                    {initials}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">{user.email}</TooltipContent>
              </Tooltip>
            ) : (
              <>
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-[10px] font-bold text-white shadow-sm">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-sidebar-foreground">
                    {user.email?.split("@")[0] ?? "User"}
                  </div>
                  <div className="truncate text-[10px] text-sidebar-muted">
                    {user.email}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <ThemeToggle />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleLogout}
                        aria-label="Sign out"
                        className="h-7 w-7 text-sidebar-muted hover:text-sidebar-foreground"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Sign out</TooltipContent>
                  </Tooltip>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}

// ─── NavItem subcomponent ──────────────────────────────────────
interface NavItemConfig {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  hasBadge?: boolean
}

function SidebarNavItem({
  item,
  collapsed,
  pendingApprovals,
}: {
  item: NavItemConfig
  collapsed: boolean
  pendingApprovals?: number
}) {
  const showBadge =
    item.hasBadge &&
    pendingApprovals !== undefined &&
    pendingApprovals > 0

  const link = (
    <NavLink
      to={item.to}
      end={item.to === "/dashboard"}
      className={({ isActive }) =>
        cn(
          "flex items-center rounded-md text-[13px] font-medium transition-all",
          collapsed ? "justify-center px-2 py-2" : "gap-2.5 px-2 py-[7px]",
          isActive
            ? "bg-sidebar-accent text-sidebar-foreground shadow-sm ring-1 ring-sidebar-border"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon
            className={cn(
              "h-4 w-4 shrink-0 transition-colors",
              isActive ? "text-primary" : "",
            )}
          />
          {!collapsed && (
            <>
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  <span className="text-[11px] font-semibold tabular-nums text-primary">
                    {pendingApprovals}
                  </span>
                </div>
              )}
            </>
          )}
          {collapsed && showBadge && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {pendingApprovals}
            </span>
          )}
        </>
      )}
    </NavLink>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative">{link}</div>
        </TooltipTrigger>
        <TooltipContent side="right">
          {item.label}
          {showBadge && ` (${pendingApprovals})`}
        </TooltipContent>
      </Tooltip>
    )
  }

  return link
}
