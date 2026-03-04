import { useState, useCallback, useRef, useEffect } from "react"
import * as yaml from "js-yaml"
import { toast } from "sonner"
import { Loader2, Upload, Check } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { YamlEditor } from "@/components/yaml-editor"
import { importContracts, type ImportResult } from "@/lib/api/contracts"

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

interface ParsedPreview { count: number; ids: string[] }

export function ImportDialog({ open, onOpenChange, onImported }: ImportDialogProps) {
  const [yamlContent, setYamlContent] = useState("")
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ParsedPreview | null>(null)
  const [validation, setValidation] = useState<{ valid: boolean; error?: string; line?: number }>({ valid: true })
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!open) return
    setYamlContent(""); setResult(null); setError(null)
    setPreview(null); setValidation({ valid: true }); setImporting(false)
  }, [open])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const parseContent = useCallback((val: string) => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (!val.trim()) { setValidation({ valid: true }); setPreview(null); return }
      try {
        const doc = yaml.load(val) as Record<string, unknown> | null
        if (!doc || typeof doc !== "object") {
          setValidation({ valid: false, error: "Expected a YAML mapping" }); setPreview(null); return
        }
        const contracts = doc.contracts
        if (!Array.isArray(contracts)) {
          setValidation({ valid: false, error: "Missing 'contracts' array" }); setPreview(null); return
        }
        const ids = contracts.map((c: Record<string, unknown>) =>
          String(c?.id ?? c?.contract_id ?? "unknown"))
        setPreview({ count: contracts.length, ids })
        setValidation({ valid: true })
      } catch (e) {
        const msg = e instanceof yaml.YAMLException ? e.message : "Invalid YAML"
        const line = e instanceof yaml.YAMLException ? (e.mark?.line ?? 0) + 1 : undefined
        setValidation({ valid: false, error: msg, line }); setPreview(null)
      }
    }, 300)
  }, [])

  const handleChange = (val: string) => {
    setYamlContent(val); setResult(null); setError(null); parseContent(val)
  }

  const handleImport = async () => {
    if (!yamlContent.trim()) return
    setImporting(true); setError(null)
    try {
      const res = await importContracts(yamlContent)
      setResult(res)
      const total = res.contracts_created.length + res.contracts_updated.length
      toast.success(`Imported ${total} contract${total !== 1 ? "s" : ""}`)
      onImported()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.")
    } finally { setImporting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Contracts</DialogTitle>
          <DialogDescription>Paste a contract bundle YAML to import contracts into the library.</DialogDescription>
        </DialogHeader>

        <YamlEditor value={yamlContent} onChange={handleChange} validation={validation} height="220px" placeholder="# Paste contract bundle YAML here..." />

        {preview && !result && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span>{preview.count} contract{preview.count !== 1 ? "s" : ""} detected:</span>
            {preview.ids.map((id) => <Badge key={id} variant="outline" className="text-xs">{id}</Badge>)}
          </div>
        )}

        {result && (
          <>
            <Separator />
            <div className="space-y-2 text-sm">
              {result.contracts_created.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Created:</span>
                  {result.contracts_created.map((id) => <Badge key={id} variant="outline" className="text-xs">{id}</Badge>)}
                </div>
              )}
              {result.contracts_updated.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Check className="size-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-blue-600 dark:text-blue-400 font-medium">Updated:</span>
                  {result.contracts_updated.map((id) => <Badge key={id} variant="outline" className="text-xs">{id}</Badge>)}
                </div>
              )}
            </div>
          </>
        )}

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{result ? "Done" : "Cancel"}</Button>
          {!result && (
            <Button onClick={handleImport} disabled={importing || !validation.valid || !yamlContent.trim()}>
              {importing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
              Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
