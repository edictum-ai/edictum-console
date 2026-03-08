import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Circle, Copy, Check, X } from "lucide-react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

interface GettingStartedProps {
  hasKeys: boolean
  hasContracts: boolean
  consoleUrl: string
  onDismiss: () => void
}

export function GettingStarted({ hasKeys, hasContracts, consoleUrl, onDismiss }: GettingStartedProps) {
  const navigate = useNavigate()
  const [contractsDone, setContractsDone] = useState(hasContracts)
  const [copied, setCopied] = useState(false)

  const steps = [
    { label: "Set up admin account", done: true },
    {
      label: "Create an API key",
      done: hasKeys,
      action: hasKeys ? undefined : () => void navigate("/dashboard/keys"),
      actionLabel: "Create Key",
    },
    {
      label: "Set up contracts",
      done: contractsDone,
      action: contractsDone
        ? undefined
        : hasContracts
          ? () => setContractsDone(true)
          : () => void navigate("/dashboard/contracts"),
      actionLabel: hasContracts ? "Use Existing" : "Browse Contracts",
    },
    {
      label: "Connect an agent",
      done: false,
      expandable: hasKeys,
    },
    { label: "See your first events", done: false },
  ]

  const testScript = `import edictum

e = edictum.Edictum.from_server(
    server_url="${consoleUrl}",
    api_key="YOUR_API_KEY",
    bundle_name="my-bundle",
    env="production",
)
print("Connected! Bundle:", e.bundle.name)`

  function handleCopy() {
    void navigator.clipboard.writeText(testScript).then(() => {
      setCopied(true)
      toast.success("Copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Card className="max-w-xl mx-auto mt-8">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-lg">Getting Started</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Your console is ready. Complete these steps to start governing your agents.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {steps.map((step) => (
            <div key={step.label}>
              <div className="flex items-center gap-3">
                {step.done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
                <span className={`text-sm flex-1 ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {step.label}
                </span>
                {step.action && (
                  <Button size="sm" variant="outline" onClick={step.action}>
                    {step.actionLabel}
                  </Button>
                )}
              </div>
              {"expandable" in step && step.expandable && !step.done && (
                <div className="ml-8 mt-2 rounded-md border border-border bg-muted/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground">
                      Test your API key with this script:
                    </p>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                  <pre className="text-xs font-mono whitespace-pre overflow-x-auto text-foreground">
                    {testScript}
                  </pre>
                  <p className="text-xs text-muted-foreground mt-2">
                    Install: <code className="bg-muted px-1 rounded text-foreground">pip install edictum[server]</code>
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="link" size="sm" className="text-xs text-muted-foreground" onClick={onDismiss}>
            Skip getting started
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
