import { useState, useCallback, useRef, type DragEvent } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { yaml as yamlLanguage } from "@codemirror/lang-yaml"
import { oneDark } from "@codemirror/theme-one-dark"
import { useTheme } from "@/hooks/use-theme"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter,
} from "@/components/ui/sheet"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, Upload } from "lucide-react"
import { toast } from "sonner"
import { uploadBundle } from "@/lib/api"
import { validateBundle } from "./yaml-parser"
import { STARTER_PACKS } from "./templates"

interface UploadSheetProps {
  onRefresh: () => void
}

export function UploadSheet({ onRefresh }: UploadSheetProps) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const [yaml, setYaml] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingContent, setPendingContent] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validation = yaml.trim() ? validateBundle(yaml) : null

  const applyContent = useCallback((content: string) => {
    setYaml(content)
    setServerError(null)
  }, [])

  const confirmReplace = useCallback(() => {
    if (pendingContent) applyContent(pendingContent)
    setPendingContent(null)
    setConfirmOpen(false)
  }, [pendingContent, applyContent])

  const handleTemplateSelect = useCallback(
    (value: string) => {
      const tpl = value === "devops" ? STARTER_PACKS[1]?.yamlContent ?? "" : STARTER_PACKS[2]?.yamlContent ?? ""
      if (yaml.trim()) {
        setPendingContent(tpl)
        setConfirmOpen(true)
      } else {
        applyContent(tpl)
      }
    },
    [yaml, applyContent],
  )

  const handleFile = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!["yaml", "yml"].includes(ext ?? "")) {
      toast.error("Please drop a .yaml or .yml file")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== "string") return
      if (yaml.trim()) {
        setPendingContent(reader.result)
        setConfirmOpen(true)
      } else {
        applyContent(reader.result)
      }
    }
    reader.readAsText(file)
  }, [yaml, applyContent])

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
    if (file) handleFile(file)
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
      <SheetContent className="flex w-[500px] flex-col sm:max-w-[500px] px-6 pb-6">
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

          <div
            className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-border"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <p className="text-sm text-muted-foreground">
              Drop a .yaml file here or{" "}
              <Button variant="link" className="h-auto px-0" onClick={() => fileInputRef.current?.click()}>
                browse
              </Button>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".yaml,.yml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.target.value = ""
              }}
            />
          </div>

          <div
            className="resize-y overflow-auto rounded-md border text-xs"
            style={{ minHeight: "200px", height: "380px" }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          >
            <CodeMirror
              value={yaml}
              onChange={handleChange}
              extensions={[yamlLanguage()]}
              theme={theme === "dark" ? oneDark : "light"}
              placeholder={"apiVersion: edictum/v1\nkind: ContractBundle\n..."}
              minHeight="200px"
              basicSetup={{ lineNumbers: true, foldGutter: true }}
            />
          </div>

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

      <AlertDialog open={confirmOpen} onOpenChange={(v) => { setConfirmOpen(v); if (!v) setPendingContent(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace current content?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the YAML you've written. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingContent(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReplace}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}
