import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  onCreateClick: () => void
}

export function EmptyState({ onCreateClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <KeyRound className="mb-3 size-12 text-muted-foreground" />
      <h3 className="text-lg font-semibold">No API keys yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Create your first API key to connect an agent.
      </p>
      <Button className="mt-4" onClick={onCreateClick}>
        Create Key
      </Button>
    </div>
  )
}
