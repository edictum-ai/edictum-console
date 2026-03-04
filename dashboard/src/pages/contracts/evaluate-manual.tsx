import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertTriangle, Loader2, Play } from "lucide-react"
import { evaluateBundle, getBundleYaml } from "@/lib/api"
import type { BundleWithDeployments, EvaluateResponse } from "@/lib/api"
import { validateBundle } from "./yaml-parser"
import { EvaluateResult } from "./evaluate-result"
import { ToolCallBuilder, type ToolCallFields } from "./tool-call-builder"
import { CompositionSourceSelector } from "./composition-source-selector"

/** Extract and pretty-format API error details from raw error messages. */
function formatEvalError(raw: string): string {
  // Try to extract JSON from "API Error NNN: {...}" pattern
  const jsonMatch = raw.match(/API Error \d+:\s*(.+)$/s)
  if (jsonMatch?.[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1])
      if (parsed.detail) return String(parsed.detail)
    } catch { /* not JSON, fall through */ }
    // Might be a raw string after the colon
    return jsonMatch[1]
  }
  return raw
}

interface EvaluateManualProps {
  bundles: BundleWithDeployments[]
  selectedBundle: string | null
  bundleNames?: string[]
  onBundleChange?: (name: string) => void
}

type EvalState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: EvaluateResponse }
  | { status: "error"; message: string }

const DEFAULT_FIELDS: ToolCallFields = {
  toolName: "", toolArgsStr: "{}", argsError: null,
  environment: "production", agentId: "test-agent",
  showAdvanced: false, principalUserId: "", principalRole: "", principalClaimsStr: "{}",
}

export function EvaluateManual({ bundles, selectedBundle, bundleNames, onBundleChange }: EvaluateManualProps) {
  const sorted = [...bundles].sort((a, b) => b.version - a.version)

  const [sourceMode, setSourceMode] = useState<"deployed" | "custom" | "composition">("deployed")
  const [sourceVersion, setSourceVersion] = useState(sorted[0]?.version ? String(sorted[0].version) : "")
  const [yamlContent, setYamlContent] = useState("")
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [loadingYaml, setLoadingYaml] = useState(false)
  const [fields, setFields] = useState<ToolCallFields>(DEFAULT_FIELDS)
  const [state, setState] = useState<EvalState>({ status: "idle" })

  const loadYaml = useCallback(async (bundleName: string, version: string) => {
    setLoadingYaml(true)
    try {
      const yaml = await getBundleYaml(bundleName, Number(version))
      setYamlContent(yaml)
      setYamlError(null)
    } catch (e) {
      setYamlError(e instanceof Error ? e.message : "Failed to load YAML")
    } finally {
      setLoadingYaml(false)
    }
  }, [])

  // Reset sourceVersion when selected bundle changes
  useEffect(() => {
    const latest = [...bundles].sort((a, b) => b.version - a.version)
    if (latest.length > 0) {
      setSourceVersion(String(latest[0]!.version))
    } else {
      setSourceVersion("")
      setYamlContent("")
    }
  }, [selectedBundle, bundles])

  // Auto-load YAML when source version or bundle changes in deployed mode
  useEffect(() => {
    if (sourceMode === "deployed" && sourceVersion && selectedBundle) {
      void loadYaml(selectedBundle, sourceVersion)
    }
  }, [selectedBundle, sourceVersion, sourceMode, loadYaml])

  const handleVersionChange = useCallback((version: string) => {
    setSourceVersion(version)
    if (!selectedBundle) return
    void loadYaml(selectedBundle, version)
  }, [selectedBundle, loadYaml])

  const handleCustomYamlChange = useCallback((val: string) => {
    setYamlContent(val)
    if (!val.trim()) { setYamlError(null); return }
    const result = validateBundle(val)
    setYamlError(result.valid ? null : result.error ?? "Invalid YAML")
  }, [])

  const handleFieldChange = useCallback((patch: Partial<ToolCallFields>) => {
    setFields((prev) => ({ ...prev, ...patch }))
  }, [])

  const handleEvaluate = useCallback(async () => {
    let toolArgs: Record<string, unknown>
    try { toolArgs = JSON.parse(fields.toolArgsStr) as Record<string, unknown> }
    catch { setFields((p) => ({ ...p, argsError: "Invalid JSON" })); return }

    const principal: { user_id?: string; role?: string; claims?: Record<string, unknown> } = {}
    if (fields.principalUserId) principal.user_id = fields.principalUserId
    if (fields.principalRole) principal.role = fields.principalRole
    try {
      const c = JSON.parse(fields.principalClaimsStr) as Record<string, unknown>
      if (Object.keys(c).length > 0) principal.claims = c
    } catch { /* ignore */ }

    setState({ status: "running" })
    try {
      const result = await evaluateBundle({
        yaml_content: yamlContent, tool_name: fields.toolName, tool_args: toolArgs,
        environment: fields.environment, agent_id: fields.agentId,
        ...(Object.keys(principal).length > 0 ? { principal } : {}),
      })
      setState({ status: "done", result })
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : String(e) })
    }
  }, [yamlContent, fields])

  const canEvaluate = yamlContent.trim() && fields.toolName.trim() && !fields.argsError && !yamlError && state.status !== "running"

  return (
    <div className="space-y-6">
      {/* Contract Source */}
      <div className="space-y-3">
        <Label className="text-xs font-medium text-muted-foreground">Contract Source</Label>
        <Tabs value={sourceMode} onValueChange={(v) => {
          const mode = v as "deployed" | "custom" | "composition"
          setSourceMode(mode)
          if (mode === "custom") { setYamlContent(""); setYamlError(null) }
          if (mode === "composition") { setYamlContent(""); setYamlError(null) }
        }}>
          <TabsList className="h-8">
            <TabsTrigger value="deployed" className="text-xs">Use deployed version</TabsTrigger>
            <TabsTrigger value="composition" className="text-xs">Load from composition</TabsTrigger>
            <TabsTrigger value="custom" className="text-xs">Paste custom YAML</TabsTrigger>
          </TabsList>
          <TabsContent value="deployed" className="mt-2">
            <div className="flex items-center gap-2">
              {bundleNames && bundleNames.length > 1 && onBundleChange && (
                <Select value={selectedBundle ?? ""} onValueChange={onBundleChange}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Select bundle..." /></SelectTrigger>
                  <SelectContent>
                    {bundleNames.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {bundleNames && bundleNames.length === 1 && selectedBundle && (
                <span className="text-sm font-medium text-foreground">{selectedBundle}</span>
              )}
              <Select value={sourceVersion} onValueChange={(v) => void handleVersionChange(v)}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Select version..." /></SelectTrigger>
                <SelectContent>
                  {sorted.map((b) => (
                    <SelectItem key={b.version} value={String(b.version)}>
                      v{b.version}{b.deployed_envs.length > 0 ? ` (${b.deployed_envs.join(", ")})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {loadingYaml && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </div>
          </TabsContent>
          <TabsContent value="composition" className="mt-2">
            <CompositionSourceSelector
              onYamlLoaded={(yaml) => { setYamlContent(yaml); setYamlError(null) }}
              onError={setYamlError}
            />
          </TabsContent>
          <TabsContent value="custom" className="mt-2">
            <Textarea className="font-mono text-xs" rows={8} placeholder="Paste contract bundle YAML..."
              value={yamlContent} onChange={(e) => handleCustomYamlChange(e.target.value)} />
          </TabsContent>
        </Tabs>
        {yamlError && <p className="text-xs text-red-600 dark:text-red-400">{yamlError}</p>}
      </div>

      <ToolCallBuilder fields={fields} onChange={handleFieldChange} />

      <Button onClick={handleEvaluate} disabled={!canEvaluate}>
        {state.status === "running"
          ? <><Loader2 className="size-4 animate-spin" /> Evaluating...</>
          : <><Play className="size-4" /> Evaluate</>}
      </Button>

      {state.status === "done" && <EvaluateResult result={state.result} />}

      {state.status === "error" && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">Evaluation failed</p>
              <pre className="mt-1 text-xs text-destructive/80 whitespace-pre-wrap break-words font-mono">
                {formatEvalError(state.message)}
              </pre>
            </div>
            <Button variant="outline" size="sm" className="shrink-0" onClick={handleEvaluate}>Retry</Button>
          </div>
        </div>
      )}
    </div>
  )
}
