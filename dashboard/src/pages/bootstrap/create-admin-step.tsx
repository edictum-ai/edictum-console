import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CardContent, CardHeader } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft } from "lucide-react"

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

export function CreateAdminStep({
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
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
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
