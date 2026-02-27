import { lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthGuard } from "@/components/auth-guard"
import { DashboardLayout } from "@/components/dashboard-layout"
import { LoginPage } from "@/pages/login"
import { BootstrapPage } from "@/pages/bootstrap"
import { PlaceholderPage } from "@/pages/placeholder"
import { DashboardHome } from "@/pages/dashboard-home"
import { EventsFeed } from "@/pages/events-feed"
import { ApprovalsQueue } from "@/pages/approvals-queue"
import { MockupGallery } from "@/pages/mockups/index"

// Lazy-load mockup variations — View 3: Dashboard Home
const DashboardV1 = lazy(() => import("@/pages/mockups/dashboard-v1"))
const DashboardV2 = lazy(() => import("@/pages/mockups/dashboard-v2"))
const DashboardV3 = lazy(() => import("@/pages/mockups/dashboard-v3"))
const DashboardV4 = lazy(() => import("@/pages/mockups/dashboard-v4"))
const DashboardV5 = lazy(() => import("@/pages/mockups/dashboard-v5"))

// View 4: Events Feed
const EventsV1 = lazy(() => import("@/pages/mockups/events-v1"))
const EventsV2 = lazy(() => import("@/pages/mockups/events-v2"))
const EventsV3 = lazy(() => import("@/pages/mockups/events-v3"))
const EventsV4 = lazy(() => import("@/pages/mockups/events-v4"))
const EventsV5 = lazy(() => import("@/pages/mockups/events-v5"))

// View 5: Approvals Queue
const ApprovalsV1 = lazy(() => import("@/pages/mockups/approvals-v1"))
const ApprovalsV2 = lazy(() => import("@/pages/mockups/approvals-v2"))
const ApprovalsV3 = lazy(() => import("@/pages/mockups/approvals-v3"))
const ApprovalsV4 = lazy(() => import("@/pages/mockups/approvals-v4"))
const ApprovalsV5 = lazy(() => import("@/pages/mockups/approvals-v5"))

// View 6: Contracts
const ContractsV1 = lazy(() => import("@/pages/mockups/contracts-v1"))
const ContractsV2 = lazy(() => import("@/pages/mockups/contracts-v2"))
const ContractsV3 = lazy(() => import("@/pages/mockups/contracts-v3"))
const ContractsV4 = lazy(() => import("@/pages/mockups/contracts-v4"))
const ContractsV5 = lazy(() => import("@/pages/mockups/contracts-v5"))

function MockupFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

function L({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<MockupFallback />}>{children}</Suspense>
}

export function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/dashboard/login" element={<LoginPage />} />
          <Route path="/dashboard/setup" element={<BootstrapPage />} />

          {/* Mockup gallery — no auth required */}
          <Route path="/dashboard/mockups" element={<MockupGallery />}>
            <Route
              index
              element={
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Select a mockup from the sidebar
                </div>
              }
            />
            {/* View 3: Dashboard Home */}
            <Route path="dashboard-v1" element={<L><DashboardV1 /></L>} />
            <Route path="dashboard-v2" element={<L><DashboardV2 /></L>} />
            <Route path="dashboard-v3" element={<L><DashboardV3 /></L>} />
            <Route path="dashboard-v4" element={<L><DashboardV4 /></L>} />
            <Route path="dashboard-v5" element={<L><DashboardV5 /></L>} />
            {/* View 4: Events Feed */}
            <Route path="events-v1" element={<L><EventsV1 /></L>} />
            <Route path="events-v2" element={<L><EventsV2 /></L>} />
            <Route path="events-v3" element={<L><EventsV3 /></L>} />
            <Route path="events-v4" element={<L><EventsV4 /></L>} />
            <Route path="events-v5" element={<L><EventsV5 /></L>} />
            {/* View 5: Approvals Queue */}
            <Route path="approvals-v1" element={<L><ApprovalsV1 /></L>} />
            <Route path="approvals-v2" element={<L><ApprovalsV2 /></L>} />
            <Route path="approvals-v3" element={<L><ApprovalsV3 /></L>} />
            <Route path="approvals-v4" element={<L><ApprovalsV4 /></L>} />
            <Route path="approvals-v5" element={<L><ApprovalsV5 /></L>} />
            {/* View 6: Contracts */}
            <Route path="contracts-v1" element={<L><ContractsV1 /></L>} />
            <Route path="contracts-v2" element={<L><ContractsV2 /></L>} />
            <Route path="contracts-v3" element={<L><ContractsV3 /></L>} />
            <Route path="contracts-v4" element={<L><ContractsV4 /></L>} />
            <Route path="contracts-v5" element={<L><ContractsV5 /></L>} />
          </Route>

          <Route
            path="/dashboard"
            element={
              <AuthGuard>
                <DashboardLayout />
              </AuthGuard>
            }
          >
            <Route index element={<DashboardHome />} />
            <Route path="events" element={<EventsFeed />} />
            <Route path="approvals" element={<ApprovalsQueue />} />
            <Route path="contracts" element={<PlaceholderPage title="Contracts" />} />
            <Route path="keys" element={<PlaceholderPage title="API Keys" />} />
            <Route path="settings" element={<PlaceholderPage title="Settings" />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}
