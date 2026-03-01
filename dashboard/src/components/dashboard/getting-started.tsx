import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Circle } from "lucide-react"
import { useNavigate } from "react-router"

interface GettingStartedProps {
  hasKeys: boolean
  hasBundles: boolean
}

export function GettingStarted({ hasKeys, hasBundles }: GettingStartedProps) {
  const navigate = useNavigate()

  const steps = [
    { label: "Set up admin account", done: true },
    {
      label: "Create an API key",
      done: hasKeys,
      action: hasKeys ? undefined : () => void navigate("/dashboard/keys"),
      actionLabel: "Create Key",
    },
    {
      label: "Upload a contract bundle",
      done: hasBundles,
      action: hasBundles ? undefined : () => void navigate("/dashboard/contracts"),
      actionLabel: "Upload Bundle",
    },
    { label: "Connect an agent", done: false },
    { label: "See your first events", done: false },
  ]

  return (
    <Card className="max-w-xl mx-auto mt-8">
      <CardHeader>
        <CardTitle className="text-lg">Getting Started</CardTitle>
        <p className="text-sm text-muted-foreground">
          Your console is ready. Complete these steps to start governing your agents.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {steps.map((step) => (
            <div key={step.label} className="flex items-center gap-3">
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
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
