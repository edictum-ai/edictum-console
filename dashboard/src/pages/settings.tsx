import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { Settings2, Monitor, Bell, AlertTriangle, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getHealth, type HealthResponse } from "@/lib/api"
import { useDashboardSSE } from "@/hooks/use-dashboard-sse"
import { SystemSection } from "./settings/system-section"
import { NotificationsSection } from "./settings/notifications-section"
import { DangerZoneSection } from "./settings/danger-zone-section"
import { AiSettingsSection } from "./settings/ai-settings-section"

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSection = searchParams.get("section") || "system"
  const setSection = (s: string) => setSearchParams({ section: s }, { replace: true })

  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [channelCount, setChannelCount] = useState(0)

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

  useEffect(() => { void fetchHealth() }, [fetchHealth])

  // Silent auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => { void fetchHealth() }, 30_000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  // SSE subscription
  useDashboardSSE({
    signing_key_rotated: () => { void fetchHealth() },
  })

  function subtitleForSection(section: string): string {
    switch (section) {
      case "system": return "Server health and configuration"
      case "notifications": return channelCount > 0
        ? `${channelCount} channel${channelCount !== 1 ? "s" : ""} configured`
        : "No channels configured"
      case "ai": return "LLM provider for evaluation playground"
      case "danger": return "Irreversible administrative actions"
      default: return ""
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Settings2 className="size-5 text-amber-600 dark:text-amber-400" />
            Settings
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {subtitleForSection(activeSection)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeSection} onValueChange={setSection}>
        <TabsList variant="line">
          <TabsTrigger value="system">
            <Monitor className="mr-2 size-4" />
            System
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="mr-2 size-4" />
            Notifications
            {channelCount > 0 && (
              <Badge variant="outline" className="ml-1.5 h-4 px-1.5 text-[10px]">
                {channelCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Sparkles className="mr-2 size-4" />
            AI
          </TabsTrigger>
          <TabsTrigger value="danger">
            <AlertTriangle className="mr-2 size-4" />
            Danger Zone
          </TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="mt-4">
          <SystemSection health={health} loading={loading} lastChecked={lastChecked} onRefresh={fetchHealth} />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <NotificationsSection onChannelCountChange={setChannelCount} />
        </TabsContent>
        <TabsContent value="ai" className="mt-4">
          <AiSettingsSection />
        </TabsContent>
        <TabsContent value="danger" className="mt-4">
          <DangerZoneSection />
        </TabsContent>
      </Tabs>
    </div>
  )
}
