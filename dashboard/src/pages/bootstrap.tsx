import { useState } from "react"
import { useNavigate } from "react-router"
import { setup, ApiError } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { StepIndicator } from "./bootstrap/step-indicator"
import { WelcomeStep } from "./bootstrap/welcome-step"
import { CreateAdminStep } from "./bootstrap/create-admin-step"
import { CapabilitiesStep } from "./bootstrap/capabilities-step"
import { DoneStep } from "./bootstrap/done-step"

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
