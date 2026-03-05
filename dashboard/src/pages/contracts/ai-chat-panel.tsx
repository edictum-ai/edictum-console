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

interface UsageStats {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  duration_ms: number
  tokens_per_second: number
  estimated_cost_usd: number | null
  model: string
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  usage?: UsageStats
}

const YAML_BLOCK_RE = /```ya?ml\n([\s\S]*?)```/g

function extractYamlBlocks(content: string): string[] {
  return [...content.matchAll(YAML_BLOCK_RE)].map((m) => m[1]!)
}

export function AiChatPanel({ onApplyYaml, currentYaml, initialMessage }: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [streamStart, setStreamStart] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentInitial = useRef(false)

  // Elapsed time ticker while streaming
  useEffect(() => {
    if (!streamStart) { setElapsed(0); return }
    const id = setInterval(() => setElapsed((Date.now() - streamStart) / 1000), 100)
    return () => clearInterval(id)
  }, [streamStart])

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
    setStreamStart(Date.now())

    try {
      const res = await fetch(`${API_BASE}/contracts/assist`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
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
            const parsed = JSON.parse(payload) as { content?: string; error?: string; type?: string; [key: string]: unknown }
            if (parsed.type === "usage") {
              const usage = parsed as unknown as UsageStats
              setMessages((prev) => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                if (last) copy[copy.length - 1] = { ...last, usage }
                return copy
              })
              continue
            }
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
      setStreamStart(null)
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
            <p>AI assistant not configured.{" "}
            <a href="/dashboard/settings?section=ai" className="font-medium underline text-blue-600 dark:text-blue-400">
              Configure in Settings
            </a></p>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-border">
      <div className="flex-none flex items-center gap-2 border-b border-border px-3 py-2">
        <Sparkles className="size-4 text-violet-600 dark:text-violet-400" />
        <span className="text-sm font-medium">AI Assistant</span>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-3 p-3">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} onApply={onApplyYaml} />
          ))}
          {streaming && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Generating{elapsed > 0 ? ` (${elapsed.toFixed(1)}s)` : ""}...
            </div>
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="flex-none flex gap-2 border-t border-border p-3">
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

/** Validate YAML is parseable and looks like an edictum contract. */
function validateYamlBlock(raw: string): { valid: boolean; error?: string } {
  try {
    const parsed = yamlParser.load(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { valid: false, error: "Not a YAML mapping" }
    }
    const obj = parsed as Record<string, unknown>
    if (!obj.id) return { valid: false, error: "Missing 'id' field" }
    if (!obj.type) return { valid: false, error: "Missing 'type' field" }
    if (!obj.tool) return { valid: false, error: "Missing 'tool' field" }
    if (!obj.then || typeof obj.then !== "object") return { valid: false, error: "Missing 'then' block" }
    const then = obj.then as Record<string, unknown>
    if (!then.effect) return { valid: false, error: "Missing 'then.effect'" }
    return { valid: true }
  } catch {
    return { valid: false, error: "Invalid YAML syntax" }
  }
}

/** Render basic markdown: headings, bold, inline code, lists. No dependency needed. */
function renderMarkdown(text: string) {
  const lines = text.split("\n")
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    // Headings
    if (line.startsWith("## ")) {
      elements.push(<h4 key={i} className="font-semibold text-xs mt-3 mb-1">{inlineFormat(line.slice(3))}</h4>)
      i++; continue
    }
    if (line.startsWith("# ")) {
      elements.push(<h3 key={i} className="font-semibold text-sm mt-3 mb-1">{inlineFormat(line.slice(2))}</h3>)
      i++; continue
    }

    // List items
    if (/^[-*]\s/.test(line)) {
      const items: React.ReactNode[] = []
      while (i < lines.length && /^[-*]\s/.test(lines[i]!) || (i < lines.length && /^\s+[-*]\s/.test(lines[i]!))) {
        const item = lines[i]!.replace(/^\s*[-*]\s/, "")
        items.push(<li key={i}>{inlineFormat(item)}</li>)
        i++
      }
      elements.push(<ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 text-xs">{items}</ul>)
      continue
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items: React.ReactNode[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i]!)) {
        const item = lines[i]!.replace(/^\d+\.\s/, "")
        items.push(<li key={i}>{inlineFormat(item)}</li>)
        i++
      }
      elements.push(<ol key={`ol-${i}`} className="list-decimal list-inside space-y-0.5 text-xs">{items}</ol>)
      continue
    }

    // Empty line
    if (!line.trim()) { i++; continue }

    // Regular paragraph
    elements.push(<p key={i} className="text-xs leading-relaxed">{inlineFormat(line)}</p>)
    i++
  }

  return <>{elements}</>
}

/** Format inline markdown: **bold**, `code`, *italic* */
function inlineFormat(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const re = /(\*\*(.+?)\*\*|`([^`]+?)`|\*(.+?)\*)/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    if (match[2]) parts.push(<strong key={match.index}>{match[2]}</strong>)
    else if (match[3]) parts.push(<code key={match.index} className="rounded bg-background/80 px-1 py-0.5 text-[10px] font-mono">{match[3]}</code>)
    else if (match[4]) parts.push(<em key={match.index}>{match[4]}</em>)
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 ? parts[0] : <>{parts}</>
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
        {textWithoutYaml && (
          isUser
            ? <p className="whitespace-pre-wrap text-xs">{textWithoutYaml}</p>
            : <div className="space-y-1">{renderMarkdown(textWithoutYaml)}</div>
        )}
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
        {!isUser && message.usage && (
          <div className="mt-1.5 text-[10px] text-muted-foreground text-right">
            {message.usage.total_tokens.toLocaleString()} tokens
            {" · "}
            {Math.round(message.usage.tokens_per_second)} tok/s
            {" · "}
            {message.usage.estimated_cost_usd != null
              ? `~$${message.usage.estimated_cost_usd < 0.01
                  ? message.usage.estimated_cost_usd.toFixed(4)
                  : message.usage.estimated_cost_usd.toFixed(2)}`
              : "local"}
            {" · "}
            {(message.usage.duration_ms / 1000).toFixed(1)}s
          </div>
        )}
      </div>
    </div>
  )
}
