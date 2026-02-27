import { Button } from "@/components/ui/button"
import { CardContent, CardHeader } from "@/components/ui/card"
import {
  Shield,
  FileText,
  CheckCircle,
  Activity,
  ArrowRight,
  ArrowLeft,
} from "lucide-react"

const CAPABILITIES = [
  {
    icon: FileText,
    title: "Contract Management",
    description: "Push governance rules to your agents. Hot reload.",
  },
  {
    icon: Shield,
    title: "HITL Approvals",
    description: "Approve or deny agent actions in real time.",
  },
  {
    icon: Activity,
    title: "Audit Event Feed",
    description: "See what your agents are doing. Every tool call logged.",
  },
  {
    icon: CheckCircle,
    title: "Fleet Monitoring",
    description: "Track which agents are connected and healthy.",
  },
]

export function CapabilitiesStep({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack: () => void
}) {
  return (
    <>
      <CardHeader className="text-center">
        <h2 className="text-lg font-semibold">What You Can Do</h2>
      </CardHeader>
      <CardContent className="space-y-3 pb-6">
        {CAPABILITIES.map((cap) => (
          <div key={cap.title} className="flex gap-3 rounded-lg p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <cap.icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{cap.title}</p>
              <p className="text-xs text-muted-foreground">
                {cap.description}
              </p>
            </div>
          </div>
        ))}
        <div className="flex justify-between pt-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button onClick={onNext}>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </>
  )
}
