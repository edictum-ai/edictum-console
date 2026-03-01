import { KeyRound, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  onCreateClick: () => void
}

export function EmptyState({ onCreateClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <KeyRound className="mb-3 size-10 text-muted-foreground" />
      <p className="text-sm font-medium">No API keys yet</p>
      <p className="text-xs text-muted-foreground mt-1">
        Create your first key to connect an agent to the server.
      </p>
      <Button className="mt-4" onClick={onCreateClick}>
        <Plus className="mr-2 size-4" />
        Create Key
      </Button>
    </div>
  )
}
