import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Users } from "lucide-react"
import type { DeploymentResponse } from "@/lib/api/bundles"
import { ENV_COLORS } from "@/lib/env-colors"
import { formatRelativeTime } from "@/lib/format"

interface EnvStatusCardsProps {
  deployments: DeploymentResponse[]
  agentCountByEnv: Record<string, number>
  agentBundlesByEnv?: Record<string, Record<string, number>>
  loading: boolean
}

/** Derive the latest deployment per environment and render status cards. */
export function EnvStatusCards({ deployments, agentCountByEnv, agentBundlesByEnv, loading }: EnvStatusCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    )
  }

  // Group by env → keep only the most recent deployment per env
  const byEnv = new Map<string, DeploymentResponse>()
  for (const d of deployments) {
    const existing = byEnv.get(d.env)
    if (!existing || new Date(d.created_at) > new Date(existing.created_at)) {
      byEnv.set(d.env, d)
    }
  }

  // Sort: production → staging → development → everything else
  const ENV_ORDER = ["production", "staging", "development"]
  const envs = Array.from(byEnv.entries()).sort(([a], [b]) => {
    const ai = ENV_ORDER.indexOf(a)
    const bi = ENV_ORDER.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  if (envs.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">
          No active deployments. Deploy a bundle from the Bundles tab.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {envs.map(([env, deployment]) => {
        const agentCount = agentCountByEnv[env] ?? 0
        const envColor = ENV_COLORS[env]
        const headingColor = envColor
          ? envColor.split(" ").filter((c) => c.startsWith("text-")).join(" ")
          : "text-zinc-600 dark:text-zinc-400"

        return (
          <Card key={env}>
            <CardContent className="space-y-1.5 p-4">
              <div className={`text-sm font-semibold capitalize ${headingColor}`}>
                {env}
              </div>
              <div className="text-sm font-medium text-foreground">
                {deployment.bundle_name}{" "}
                <span className="text-muted-foreground">v{deployment.bundle_version}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Deployed {formatRelativeTime(deployment.created_at)} by {deployment.deployed_by}
              </div>
              {agentCount > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="size-3" />
                  <span>
                    {agentCount} agent{agentCount !== 1 ? "s" : ""} connected
                    {agentBundlesByEnv?.[env] && Object.keys(agentBundlesByEnv[env]!).length > 1 && (
                      <span className="ml-1 text-muted-foreground/70">
                        ({Object.entries(agentBundlesByEnv[env]!)
                          .sort(([, a], [, b]) => b - a)
                          .map(([name, count]) => `${name} (${count})`)
                          .join(", ")})
                      </span>
                    )}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
