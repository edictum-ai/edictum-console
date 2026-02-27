import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, X, XCircle } from "lucide-react"

interface DenyButtonProps {
  onDeny: (reason: string) => void
  disabled?: boolean
  size?: "sm" | "xs"
  fullWidth?: boolean
}

export function DenyButton({ onDeny, disabled, size = "sm", fullWidth }: DenyButtonProps) {
  const [showInput, setShowInput] = useState(false)
  const [reason, setReason] = useState("")

  if (!showInput) {
    return (
      <Button
        size={size}
        variant="outline"
        className={`border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400${fullWidth ? " w-full" : ""}`}
        onClick={() => setShowInput(true)}
        disabled={disabled}
      >
        <XCircle className="size-3.5" />
        Deny
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for denial..."
        className="h-7 w-48 text-xs"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && reason.trim()) {
            onDeny(reason)
            setShowInput(false)
            setReason("")
          }
          if (e.key === "Escape") {
            setShowInput(false)
            setReason("")
          }
        }}
      />
      <Button
        size="xs"
        variant="destructive"
        disabled={!reason.trim()}
        onClick={() => {
          onDeny(reason)
          setShowInput(false)
          setReason("")
        }}
      >
        <Check className="size-3" />
      </Button>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => {
          setShowInput(false)
          setReason("")
        }}
      >
        <X className="size-3" />
      </Button>
    </div>
  )
}
