import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { ArrowRight } from "lucide-react"
import { EdictumLogo } from "@/components/edictum-logo"

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <>
      <CardHeader className="space-y-3 text-center">
        <div className="flex justify-center">
          <EdictumLogo size={56} />
        </div>
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
      <CardFooter className="justify-center pb-6">
        <Link
          to="/dashboard/login"
          replace
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Already configured via environment variables? Skip to login
        </Link>
      </CardFooter>
    </>
  )
}
