import { useState } from "react"
import { useNavigate } from "react-router"
import { setup, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Shield,
  FileText,
  CheckCircle,
  Activity,
  ArrowRight,
  ArrowLeft,
} from "lucide-react"

type Step = "welcome" | "create-admin" | "capabilities" | "done"

const STEPS: Step[] = ["welcome", "create-admin", "capabilities", "done"]

export function BootstrapPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>("welcome")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function currentIndex() {
    return STEPS.indexOf(step)
  }

  function next() {
    const idx = currentIndex()
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1]!)
    }
  }

  function prev() {
    const idx = currentIndex()
    if (idx > 0) {
      setStep(STEPS[idx - 1]!)
    }
  }

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 12) {
      setError("Password must be at least 12 characters")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match")
      return
    }

    setSubmitting(true)
    try {
      await setup(email, password)
      next()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError("Server is already set up. Redirecting to login...")
          setTimeout(
            () => void navigate("/dashboard/login", { replace: true }),
            2000,
          )
        } else {
          setError("Setup failed. Please try again.")
        }
      } else {
        setError("Cannot connect to server")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <StepIndicator current={currentIndex()} total={STEPS.length} />

        {step === "welcome" && <WelcomeStep onNext={next} />}

        {step === "create-admin" && (
          <CreateAdminStep
            email={email}
            password={password}
            confirmPassword={confirmPassword}
            error={error}
            submitting={submitting}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirmPassword}
            onSubmit={handleCreateAdmin}
            onBack={prev}
          />
        )}

        {step === "capabilities" && (
          <CapabilitiesStep onNext={next} onBack={prev} />
        )}

        {step === "done" && (
          <DoneStep
            onFinish={() =>
              void navigate("/dashboard/login", { replace: true })
            }
          />
        )}
      </Card>
    </div>
  )
}

function StepIndicator({
  current,
  total,
}: {
  current: number
  total: number
}) {
  return (
    <div className="flex justify-center gap-2 px-6 pt-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 w-8 rounded-full transition-colors ${
            i <= current ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </div>
  )
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <>
      <CardHeader className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to Edictum Console
        </h1>
        <p className="text-sm text-muted-foreground">
          Runtime governance for AI agents. Define what your agents can
          do, approve sensitive actions, and see everything in real time.
        </p>
      </CardHeader>
      <CardContent className="flex justify-center pb-8">
        <Button onClick={onNext}>
          Get Started
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </>
  )
}

interface CreateAdminStepProps {
  email: string
  password: string
  confirmPassword: string
  error: string | null
  submitting: boolean
  onEmailChange: (v: string) => void
  onPasswordChange: (v: string) => void
  onConfirmPasswordChange: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  onBack: () => void
}

function CreateAdminStep({
  email,
  password,
  confirmPassword,
  error,
  submitting,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  onBack,
}: CreateAdminStepProps) {
  return (
    <>
      <CardHeader className="space-y-1 text-center">
        <h2 className="text-lg font-semibold">Create Admin Account</h2>
        <p className="text-sm text-muted-foreground">
          This will be the first user with full access.
        </p>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="setup-email">Email</Label>
            <Input
              id="setup-email"
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-password">Password</Label>
            <Input
              id="setup-password"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              required
              minLength={12}
            />
            <p className="text-xs text-muted-foreground">
              Minimum 12 characters
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-confirm">Confirm Password</Label>
            <Input
              id="setup-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => onConfirmPasswordChange(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-between pt-2">
            <Button type="button" variant="ghost" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Admin"}
            </Button>
          </div>
        </CardContent>
      </form>
    </>
  )
}

function CapabilitiesStep({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack: () => void
}) {
  const capabilities = [
    {
      icon: FileText,
      title: "Contract Management",
      description: "Push governance rules to your agents. Hot reload.",
    },
    {
      icon: Shield,
      title: "HITL Approvals",
      description:
        "Approve or deny agent actions in real time.",
    },
    {
      icon: Activity,
      title: "Audit Event Feed",
      description:
        "See what your agents are doing. Every tool call logged.",
    },
    {
      icon: CheckCircle,
      title: "Fleet Monitoring",
      description: "Track which agents are connected and healthy.",
    },
  ]

  return (
    <>
      <CardHeader className="text-center">
        <h2 className="text-lg font-semibold">What You Can Do</h2>
      </CardHeader>
      <CardContent className="space-y-3 pb-6">
        {capabilities.map((cap) => (
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

function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <>
      <CardHeader className="space-y-2 text-center">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
            <CheckCircle className="h-6 w-6 text-success" />
          </div>
        </div>
        <h2 className="text-lg font-semibold">You&apos;re all set</h2>
        <p className="text-sm text-muted-foreground">
          Your admin account has been created. Sign in to get started.
        </p>
      </CardHeader>
      <CardContent className="flex justify-center pb-8">
        <Button onClick={onFinish}>
          Go to Sign In
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </>
  )
}
