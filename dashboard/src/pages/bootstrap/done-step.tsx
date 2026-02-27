import { Button } from "@/components/ui/button"
import { CardContent, CardHeader } from "@/components/ui/card"
import { CheckCircle, ArrowRight } from "lucide-react"

export function DoneStep({ onFinish }: { onFinish: () => void }) {
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
