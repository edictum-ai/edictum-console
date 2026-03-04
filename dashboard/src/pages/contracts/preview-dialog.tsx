import { useState, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle, Copy, Check, Rocket } from "lucide-react"
import { previewComposition, type PreviewResponse } from "@/lib/api/compositions"
import { YamlEditor } from "@/components/yaml-editor"

interface PreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  compositionName: string
  onDeploy: () => void
}

export function PreviewDialog({
  open,
  onOpenChange,
  compositionName,
  onDeploy,
}: PreviewDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Clean up copy timer on unmount
  useEffect(() => () => clearTimeout(copyTimerRef.current), [])

  useEffect(() => {
    if (!open || !compositionName) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setPreview(null)

    previewComposition(compositionName)
      .then((data) => {
        if (!cancelled) setPreview(data)
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to preview")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [open, compositionName])

  const handleCopy = async () => {
    if (!preview) return
    await navigator.clipboard.writeText(preview.yaml_content)
    setCopied(true)
    clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview — {compositionName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-64 rounded-md" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : preview ? (
          <div className="space-y-3">
            {preview.validation_errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>
                  {preview.validation_errors.join("; ")}
                </AlertDescription>
              </Alert>
            )}

            <YamlEditor
              value={preview.yaml_content}
              readOnly
              height="360px"
            />

            <p className="text-xs text-muted-foreground">
              {preview.contracts_count} contract
              {preview.contracts_count !== 1 ? "s" : ""} assembled
            </p>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={!preview}
          >
            {copied ? <Check className="size-4 mr-1.5" /> : <Copy className="size-4 mr-1.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onOpenChange(false)
              onDeploy()
            }}
            disabled={!preview || preview.validation_errors.length > 0}
          >
            <Rocket className="size-4 mr-1.5" />
            Deploy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
