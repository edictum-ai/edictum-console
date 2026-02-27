import { Button } from "@/components/ui/button"
import { CardContent, CardHeader } from "@/components/ui/card"
import { ArrowRight } from "lucide-react"

export function WelcomeStep({ onNext }: { onNext: () => void }) {
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
