import { useState, useRef, useEffect, useCallback } from "react"
import * as yamlParser from "js-yaml"
import { Sparkles, Send, Copy, ArrowDownToLine, Loader2, Settings, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { API_BASE } from "@/lib/api/client"

interface AiChatPanelProps {
  onApplyYaml: (yaml: string) => void
  currentYaml?: string
  initialMessage?: string
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

const YAML_BLOCK_RE = /```ya?ml\n([\s\S]*?)```/g

function extractYamlBlocks(content: string): string[] {
  return [...content.matchAll(YAML_BLOCK_RE)].map((m) => m[1]!)
}

export function AiChatPanel({ onApplyYaml, currentYaml, initialMessage }: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentInitial = useRef(false)

  // Check if AI is configured
  useEffect(() => {
    fetch(`${API_BASE}/settings/ai`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setConfigured(d.configured ?? false))
      .catch(() => setConfigured(false))
  }, [])

  // Auto-send initial message once configured
  useEffect(() => {
    if (configured && initialMessage && !sentInitial.current) {
      sentInitial.current = true
      void sendMessage(initialMessage)
    }
  }, [configured, initialMessage]) // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(scrollToBottom, [messages, scrollToBottom])

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming) return
    setError(null)
    const userMsg: ChatMessage = { role: "user", content: text }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setInput("")
    setStreaming(true)

    try {
      const res = await fetch(`${API_BASE}/contracts/assist`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updated.map((m) => ({ role: m.role, content: m.content })),
          current_yaml: currentYaml || null,
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(res.status === 503 ? "AI assistant not configured" : body)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response stream")

      const decoder = new TextDecoder()
      let assistantContent = ""
      setMessages((prev) => [...prev, { role: "assistant", content: "" }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue
          const payload = line.slice(6)
          if (payload === "[DONE]") break
          try {
            const parsed = JSON.parse(payload) as { content?: string; error?: string }
            if (parsed.error) { setError(parsed.error); break }
            if (parsed.content) {
              assistantContent += parsed.content
              setMessages((prev) => {
                const copy = [...prev]
                copy[copy.length - 1] = { role: "assistant", content: assistantContent }
                return copy
              })
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stream failed")
    } finally {
      setStreaming(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void sendMessage(input)
  }

  if (configured === null) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
  }

  if (configured === false) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Alert>
          <Settings className="size-4" />
          <AlertDescription>
            AI assistant not configured.{" "}
            <a href="/dashboard/settings?section=ai" className="font-medium underline text-blue-600 dark:text-blue-400">
              Configure in Settings
            </a>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col border-l border-border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Sparkles className="size-4 text-violet-600 dark:text-violet-400" />
        <span className="text-sm font-medium">AI Assistant</span>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} onApply={onApplyYaml} />
          ))}
          {streaming && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Generating...
            </div>
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-3">
        <Input
          value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Describe the contract you need..."
          disabled={streaming} className="flex-1 text-sm"
        />
        <Button type="submit" size="icon" disabled={streaming || !input.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  )
}

/** Validate YAML is parseable and looks like a contract (has tool/when/effect keys). */
function validateYamlBlock(raw: string): { valid: boolean; error?: string } {
  try {
    const parsed = yamlParser.load(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { valid: false, error: "Not a YAML mapping" }
    }
    const keys = Object.keys(parsed as Record<string, unknown>)
    const hasContractShape = keys.some((k) => ["tool", "when", "effect"].includes(k))
    if (!hasContractShape) {
      return { valid: false, error: "Missing tool/when/effect — may not be a valid contract" }
    }
    return { valid: true }
  } catch {
    return { valid: false, error: "Invalid YAML syntax" }
  }
}

function MessageBubble({ message, onApply }: { message: ChatMessage; onApply: (yaml: string) => void }) {
  const isUser = message.role === "user"
  const yamlBlocks = isUser ? [] : extractYamlBlocks(message.content)
  const textWithoutYaml = message.content.replace(YAML_BLOCK_RE, "").trim()

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-foreground"
      }`}>
        {textWithoutYaml && <p className="whitespace-pre-wrap">{textWithoutYaml}</p>}
        {yamlBlocks.map((raw, i) => {
          const check = validateYamlBlock(raw)
          return (
            <div key={i} className="mt-2 rounded border border-border bg-background/50 p-2">
              <pre className="overflow-x-auto text-xs font-mono whitespace-pre-wrap">{raw}</pre>
              {!check.valid && (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-3" /> {check.error}
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" variant="outline" className="h-6 text-xs"
                        disabled={!check.valid}
                        onClick={() => { onApply(raw); toast.success("Applied to editor") }}>
                        <ArrowDownToLine className="mr-1 size-3" /> Apply
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!check.valid && <TooltipContent>{check.error}</TooltipContent>}
                </Tooltip>
                <Button size="sm" variant="ghost" className="h-6 text-xs"
                  onClick={() => { void navigator.clipboard.writeText(raw); toast.success("Copied") }}>
                  <Copy className="mr-1 size-3" /> Copy
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
