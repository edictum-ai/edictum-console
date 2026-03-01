import { useState, useCallback, useRef, type DragEvent } from "react"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, Upload } from "lucide-react"
import { toast } from "sonner"
import { uploadBundle } from "@/lib/api"
import { validateBundle } from "./yaml-parser"
import { DEVOPS_AGENT_TEMPLATE, GOVERNANCE_V5_TEMPLATE } from "./templates"

interface UploadSheetProps {
  onRefresh: () => void
}

export function UploadSheet({ onRefresh }: UploadSheetProps) {
  const [open, setOpen] = useState(false)
  const [yaml, setYaml] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const validation = yaml.trim() ? validateBundle(yaml) : null

  const handleTemplateSelect = useCallback(
    (value: string) => {
      const tpl = value === "devops" ? DEVOPS_AGENT_TEMPLATE : GOVERNANCE_V5_TEMPLATE
      if (yaml.trim() && !confirm("Replace current content with template?")) return
      setYaml(tpl)
      setServerError(null)
    },
    [yaml],
  )

  const handleChange = useCallback((value: string) => {
    setYaml(value)
    setServerError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  const handleDragOver = (e: DragEvent) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = () => setDragging(false)

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!["yaml", "yml", "txt", "md"].includes(ext ?? "")) {
      toast.error("Only YAML files are supported (.yaml, .yml, .txt, .md)")
      return
    }
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === "string") setYaml(reader.result) }
    reader.readAsText(file)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setServerError(null)
    try {
      await uploadBundle(yaml)
      toast.success("Bundle uploaded")
      setYaml("")
      setOpen(false)
      onRefresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed"
      setServerError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!yaml.trim() && validation?.valid && !submitting

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setYaml(""); setServerError(null) } }}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="mr-1.5 size-3.5" />Upload
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-[500px] flex-col sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle>Upload Contract Bundle</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-hidden pt-4">
          <Select onValueChange={handleTemplateSelect}>
            <SelectTrigger><SelectValue placeholder="Select a template..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="devops">DevOps Agent (starter)</SelectItem>
              <SelectItem value="governance">Production Governance (advanced)</SelectItem>
            </SelectContent>
          </Select>

          <p className="text-xs text-muted-foreground">Paste YAML or drag a .yaml file</p>

          <Textarea
            value={yaml}
            onChange={(e) => handleChange(e.target.value)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            placeholder="apiVersion: edictum/v1&#10;kind: ContractBundle&#10;..."
            className={`flex-1 resize-none font-mono text-xs ${dragging ? "border-primary ring-1 ring-primary" : ""}`}
          />

          {validation && (
            <div className="flex items-center gap-2">
              {validation.valid ? (
                <>
                  <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                    Valid
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {validation.contractCount} contract{validation.contractCount !== 1 ? "s" : ""} found
                  </span>
                </>
              ) : (
                <>
                  <Badge variant="destructive">Invalid</Badge>
                  <span className="text-xs text-destructive">{validation.error}</span>
                </>
              )}
            </div>
          )}

          {serverError && (
            <p className="text-xs text-destructive">{serverError}</p>
          )}
        </div>

        <SheetFooter className="pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            {submitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Upload Bundle
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
