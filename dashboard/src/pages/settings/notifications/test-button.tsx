import { useState, useRef, useCallback, useEffect } from "react"
import { Zap, Loader2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { testChannel } from "@/lib/api"
import { toast } from "sonner"

interface TestButtonProps {
  channelId: string
  onTested?: () => void
}

type TestState = "idle" | "testing" | "passed" | "failed"

export function TestButton({ channelId, onTested }: TestButtonProps) {
  const [state, setState] = useState<TestState>("idle")
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleTest = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setState("testing")
    try {
      const result = await testChannel(channelId)
      const next = result.success ? "passed" : "failed"
      setState(next)
      if (result.success) {
        toast.success("Test notification sent")
      } else {
        toast.error(result.message || "Test failed")
      }
      onTested?.()
      timerRef.current = setTimeout(() => setState("idle"), 3000)
    } catch {
      setState("failed")
      toast.error("Failed to send test")
      timerRef.current = setTimeout(() => setState("idle"), 3000)
    }
  }, [channelId, onTested])

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={state === "testing"}
      onClick={handleTest}
      className="h-8 gap-1.5 px-2"
    >
      {state === "idle" && <><Zap className="size-3.5" />Test</>}
      {state === "testing" && <><Loader2 className="size-3.5 animate-spin" />Testing...</>}
      {state === "passed" && <><Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />Passed</>}
      {state === "failed" && <><X className="size-3.5 text-red-600 dark:text-red-400" />Failed</>}
    </Button>
  )
}
