import { Key } from "lucide-react"
import { EmptyState } from "@/components/empty-state"

interface ApiKeysEmptyStateProps {
  onCreateClick: () => void
}

export function ApiKeysEmptyState({ onCreateClick }: ApiKeysEmptyStateProps) {
  return (
    <EmptyState
      icon={<Key className="h-10 w-10" />}
      title="No API keys yet"
      description="API keys authenticate your agents when they connect to the server. Each key is scoped to an environment (production, staging, etc.). Create a key, then set it as EDICTUM_API_KEY in your agent's config."
      action={{ label: "Create Key", onClick: onCreateClick }}
    />
  )
}
