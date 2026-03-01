import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "lucide-react"
import { toast } from "sonner"

interface ToolArgsCardProps {
  toolArgs: Record<string, unknown>
}

export function ToolArgsCard({ toolArgs }: ToolArgsCardProps) {
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => clearTimeout(copyTimerRef.current)
  }, [])

  if (Object.keys(toolArgs).length === 0) return null

  const handleCopyArgs = async () => {
    const text = JSON.stringify(toolArgs, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      toast.error("Failed to copy to clipboard")
      return
    }
    clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card className="border-border bg-background/50 p-0">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-foreground">
          Tool Arguments
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleCopyArgs()}
          className="h-5 px-1.5 text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <Check className="mr-1 h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="mr-1 h-3 w-3" />
          )}
          <span className="text-[10px]">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      <div className="space-y-1.5 p-3">
        {Object.entries(toolArgs).map(([key, value]) => (
          <div key={key} className="flex gap-2">
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {key}:
            </span>
            <span className="min-w-0 break-all font-mono text-[11px] text-foreground">
              {typeof value === "object"
                ? JSON.stringify(value)
                : String(value)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}
