import { useState, useEffect } from "react"
import { useLocation } from "react-router"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Sidebar } from "./sidebar"
import type { UserInfo } from "@/lib/api"

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/events": "Events",
  "/dashboard/approvals": "Approvals",
  "/dashboard/contracts": "Contracts",
  "/dashboard/agents": "Agents",
  "/dashboard/keys": "API Keys",
  "/dashboard/settings": "Settings",
}

function resolveTitle(pathname: string): string {
  // Exact match first
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname]

  // Longest prefix match for dynamic routes (e.g. /dashboard/agents/my-agent)
  let best = ""
  for (const route of Object.keys(ROUTE_TITLES)) {
    if (pathname.startsWith(route + "/") && route.length > best.length) {
      best = route
    }
  }
  return best ? (ROUTE_TITLES[best] ?? "Edictum") : "Edictum"
}

interface MobileHeaderProps {
  user: UserInfo
  pendingApprovals?: number
  onLogout: () => void
}

export function MobileHeader({
  user,
  pendingApprovals,
  onLogout,
}: MobileHeaderProps) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  // Close sheet on navigation
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const title = resolveTitle(pathname)

  return (
    <div className="flex items-center border-b border-border bg-background px-4 py-3">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[230px] gap-0 p-0"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar
            user={user}
            pendingApprovals={pendingApprovals}
            onLogout={onLogout}
            forceExpanded
          />
        </SheetContent>
      </Sheet>

      <span className="flex-1 text-center text-sm font-semibold">
        {title}
      </span>

      {/* Right zone — balances the hamburger button width */}
      <div className="w-8" />
    </div>
  )
}
