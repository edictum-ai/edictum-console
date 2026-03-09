import { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Code2,
} from "lucide-react"
import { toast } from "sonner"
import type { EventResponse } from "@/lib/api"

interface EventRowActionsProps {
  event: EventResponse
  toolArgs: Record<string, unknown> | null
}

export function EventRowActions({ event, toolArgs }: EventRowActionsProps) {
  const navigate = useNavigate()
  const [jsonOpen, setJsonOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )

  useEffect(() => {
    return () => clearTimeout(copyTimerRef.current)
  }, [])

  const handleCopyEventId = async () => {
    try {
      await navigator.clipboard.writeText(event.id)
      setCopied(true)
      toast.success("Event ID copied to clipboard")
    } catch {
      toast.error("Failed to copy to clipboard")
      return
    }
    clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void navigate(
            `/dashboard/contracts?tab=library&new=true&from_tool=${encodeURIComponent(event.tool_name)}&from_verdict=${encodeURIComponent(event.verdict)}`,
            { state: { fromArgs: toolArgs } },
          )
        }}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Create Contract
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => void handleCopyEventId()}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {copied ? "Copied" : "Copy Event ID"}
      </Button>

      <Collapsible open={jsonOpen} onOpenChange={setJsonOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm">
            {jsonOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <Code2 className="h-3.5 w-3.5" />
            View Raw JSON
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-2 max-h-[300px] overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
            {JSON.stringify(event, null, 2)}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
