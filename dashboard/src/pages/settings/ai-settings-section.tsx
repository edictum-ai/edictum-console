import { useState, useEffect, useCallback } from "react"
import { CheckCircle, XCircle, Loader2, Trash2, Zap } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { getAiConfig, updateAiConfig, deleteAiConfig, testAiConnection } from "@/lib/api"
import type { AiConfigResponse, TestAiResult } from "@/lib/api"

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic", placeholder: "claude-haiku-4-5-20251001" },
  { value: "openai", label: "OpenAI", placeholder: "gpt-5-mini" },
  { value: "openrouter", label: "OpenRouter", placeholder: "qwen/qwen3-4b:free" },
  { value: "ollama", label: "Ollama", placeholder: "llama3" },
] as const

function providerMeta(p: string) {
  return PROVIDERS.find((x) => x.value === p) ?? PROVIDERS[0]
}

const needsBaseUrl = (p: string) => p === "openrouter" || p === "ollama"
const needsApiKey = (p: string) => p !== "ollama"
const defaultBaseUrl = (p: string) =>
  p === "ollama" ? "http://localhost:11434" : p === "openrouter" ? "https://openrouter.ai/api/v1" : ""

export function AiSettingsSection() {
  const [config, setConfig] = useState<AiConfigResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [provider, setProvider] = useState("anthropic")
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [changingKey, setChangingKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestAiResult | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const fetchConfig = useCallback(async () => {
    try {
      const data = await getAiConfig()
      setConfig(data)
      setProvider(data.provider || "anthropic")
      setModel(data.model ?? "")
      setBaseUrl(data.base_url ?? "")
      setChangingKey(false)
    } catch {
      // Not configured yet — that's fine
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchConfig() }, [fetchConfig])

  async function handleSave() {
    setSaving(true)
    setTestResult(null)
    try {
      await updateAiConfig({
        provider,
        ...(apiKey ? { api_key: apiKey } : {}),
        model: model || null,
        base_url: needsBaseUrl(provider) ? (baseUrl || defaultBaseUrl(provider)) : null,
      })
      toast.success("AI configuration saved")
      setApiKey("")
      void fetchConfig()
    } catch {
      toast.error("Failed to save AI configuration")
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testAiConnection()
      setTestResult(result)
    } catch {
      setTestResult({ ok: false, error: "Connection failed" })
    } finally {
      setTesting(false)
    }
  }

  async function handleRemove() {
    try {
      await deleteAiConfig()
      toast.success("AI configuration removed")
      setConfig(null)
      setProvider("anthropic")
      setApiKey("")
      setModel("")
      setBaseUrl("")
      setTestResult(null)
    } catch {
      toast.error("Failed to remove AI configuration")
    } finally {
      setConfirmRemove(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const meta = providerMeta(provider)
  const isConfigured = config?.configured ?? false
  const showKeyInput = !isConfigured || changingKey || !needsApiKey(provider)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">AI Provider</h2>
        <p className="text-sm text-muted-foreground">
          Configure an LLM for contract evaluation playground and AI-assisted features.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">Configuration</CardTitle>
              {isConfigured && (
                <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-600/30 dark:border-emerald-400/30">
                  Active
                </Badge>
              )}
            </div>
            {isConfigured && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmRemove(true)}>
                <Trash2 className="mr-1.5 size-3.5" />Remove
              </Button>
            )}
          </div>
          <CardDescription>
            {isConfigured
              ? `Using ${config?.provider} ${config?.api_key_masked ? `(${config.api_key_masked})` : ""}`
              : "No AI provider configured"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v) => { setProvider(v); setTestResult(null) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsApiKey(provider) && (
            <div className="space-y-2">
              <Label>API Key</Label>
              {showKeyInput ? (
                <Input
                  type="password"
                  placeholder={`Enter ${meta.label} API key`}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <Input disabled value={config?.api_key_masked ?? "********"} className="font-mono" />
                  <Button variant="outline" size="sm" onClick={() => setChangingKey(true)}>
                    Change
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Model <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              placeholder={meta.placeholder}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>

          {needsBaseUrl(provider) && (
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                placeholder={defaultBaseUrl(provider)}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          )}

          <Separator />

          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving || (needsApiKey(provider) && !isConfigured && !apiKey)}>
              {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Save
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testing || !isConfigured}>
              {testing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Zap className="mr-1.5 size-3.5" />}
              Test Connection
            </Button>
          </div>

          {testResult && (
            <Alert variant={testResult.ok ? "default" : "destructive"}>
              {testResult.ok
                ? <CheckCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
                : <XCircle className="size-4" />}
              <AlertDescription>
                {testResult.ok
                  ? <>Connected to <strong>{testResult.model}</strong> in {testResult.latency_ms}ms</>
                  : <>{testResult.error}</>}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove AI configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the API key and disable AI-powered features like the evaluation playground.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
