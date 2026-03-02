import { lazy, Suspense } from "react"
import { Loader2 } from "lucide-react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { AuthGuard } from "@/components/auth-guard"
import { DashboardLayout } from "@/components/dashboard-layout"
import { LoginPage } from "@/pages/login"
import { BootstrapPage } from "@/pages/bootstrap"
import { DashboardHome } from "@/pages/dashboard-home"
import { EventsFeed } from "@/pages/events-feed"
import { ApprovalsQueue } from "@/pages/approvals-queue"
import { ContractsPage } from "@/pages/contracts"

// Lazy-load page views
const AgentsPage = lazy(() => import("@/pages/agents/agents-page"))
const AgentDetailPage = lazy(() => import("@/pages/agents/agent-detail"))
const ApiKeysPage = lazy(() => import("@/pages/api-keys"))
const SettingsPage = lazy(() => import("@/pages/settings"))

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  )
}

export function App() {
  return (
    <TooltipProvider>
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/dashboard/login" element={<LoginPage />} />
          <Route path="/dashboard/setup" element={<BootstrapPage />} />


          <Route
            path="/dashboard"
            element={
              <AuthGuard>
                <DashboardLayout />
              </AuthGuard>
            }
          >
            <Route index element={<DashboardHome />} />
            <Route path="agents" element={<Suspense fallback={<PageFallback />}><AgentsPage /></Suspense>} />
            <Route path="agents/:agentId" element={<Suspense fallback={<PageFallback />}><AgentDetailPage /></Suspense>} />
            <Route path="events" element={<EventsFeed />} />
            <Route path="approvals" element={<ApprovalsQueue />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route path="keys" element={<Suspense fallback={<PageFallback />}><ApiKeysPage /></Suspense>} />
            <Route path="settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}
