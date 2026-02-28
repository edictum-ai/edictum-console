import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { getHealth, type HealthResponse } from "@/lib/api"
import { SettingsSidebar } from "./settings/settings-sidebar"
import { SystemSection } from "./settings/system-section"
import { NotificationsSection } from "./settings/notifications-section"
import { DangerZoneSection } from "./settings/danger-zone-section"

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSection = searchParams.get("section") || "system"

  // Default to ?section=system if no param
  useEffect(() => {
    if (!searchParams.get("section")) {
      setSearchParams({ section: "system" }, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  function setSection(section: string) {
    setSearchParams({ section }, { replace: true })
  }

  const fetchHealth = useCallback(async () => {
    try {
      const data = await getHealth()
      setHealth(data)
      setLastChecked(new Date())
    } catch {
      toast.error("Failed to load system health")
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    void fetchHealth()
  }, [fetchHealth])

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      void fetchHealth()
    }, 30_000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Sidebar: horizontal on mobile, vertical on desktop */}
      <div className="shrink-0 border-b border-border p-4 md:w-48 md:border-b-0 md:border-r">
        <SettingsSidebar
          activeSection={activeSection}
          onSectionChange={setSection}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {activeSection === "system" && (
            <SystemSection
              health={health}
              loading={loading}
              lastChecked={lastChecked}
              onRefresh={fetchHealth}
            />
          )}
          {activeSection === "notifications" && <NotificationsSection />}
          {activeSection === "danger" && <DangerZoneSection />}
        </div>
      </div>
    </div>
  )
}
