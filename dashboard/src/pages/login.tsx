import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router"
import { login, ApiError } from "@/lib/api"
import { useHealth } from "@/hooks/use-health"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EdictumLogo } from "@/components/edictum-logo"

export function LoginPage() {
  const navigate = useNavigate()
  const { health } = useHealth()
  const { user, loading: authLoading, refresh } = useAuth()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [retryAfter, setRetryAfter] = useState(0)

  const showSetupHint = health != null && !health.bootstrap_complete

  useEffect(() => {
    if (!authLoading && user) {
      void navigate("/dashboard", { replace: true })
    }
  }, [user, authLoading, navigate])

  // No admin exists — go straight to the setup wizard
  useEffect(() => {
    if (health && !health.bootstrap_complete) {
      void navigate("/dashboard/setup", { replace: true })
    }
  }, [health, navigate])

  useEffect(() => {
    if (retryAfter <= 0) return
    const timer = setInterval(() => {
      setRetryAfter((t) => Math.max(0, t - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [retryAfter])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (retryAfter > 0) return

    setError(null)
    setSubmitting(true)

    try {
      await login(email, password)
      await refresh()
      void navigate("/dashboard", { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          const seconds = err.retryAfter ?? 60
          setRetryAfter(seconds)
          setError(`Too many attempts. Try again in ${seconds}s.`)
        } else if (err.status === 401) {
          setError("Invalid email or password")
        } else {
          setError("Something went wrong. Please try again.")
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
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center">
            <EdictumLogo size={48} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Edictum Console
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to manage your agents
          </p>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {showSetupHint && (
              <Alert>
                <AlertDescription>
                  No admin account found.{" "}
                  <Link to="/dashboard/setup" className="underline font-medium">
                    Run the setup wizard
                  </Link>{" "}
                  or set <code className="text-xs">EDICTUM_ADMIN_EMAIL</code> and{" "}
                  <code className="text-xs">EDICTUM_ADMIN_PASSWORD</code> environment
                  variables and restart.
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {retryAfter > 0
                    ? `Too many attempts. Try again in ${retryAfter}s.`
                    : error}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="pt-2">
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || retryAfter > 0}
            >
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </CardFooter>
        </form>

        {health && (
          <p className="pb-4 text-center text-xs text-muted-foreground">
            v{health.version}
          </p>
        )}
      </Card>
    </div>
  )
}
