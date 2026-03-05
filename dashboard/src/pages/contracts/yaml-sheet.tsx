import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Copy, FileCode } from "lucide-react"
import { toast } from "sonner"

interface YamlSheetProps {
  bundleName: string
  version: number
  yamlContent: string
}

export function YamlSheet({ bundleName, version, yamlContent }: YamlSheetProps) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(yamlContent)
      toast.success("Copied to clipboard")
    } catch {
      toast.error("Failed to copy — clipboard access denied")
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <FileCode className="mr-1.5 size-3.5" />
          View YAML
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[50vw] sm:max-w-[50vw]">
        <SheetHeader>
          <div className="flex items-center justify-between pr-4">
            <SheetTitle className="font-mono">
              {bundleName} v{version}
            </SheetTitle>
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              <Copy className="mr-1.5 size-3.5" />
              Copy
            </Button>
          </div>
        </SheetHeader>
        <ScrollArea className="mt-4 h-[calc(100vh-8rem)]">
          <pre className="whitespace-pre-wrap p-4 text-xs leading-relaxed">
            {highlightYaml(yamlContent)}
          </pre>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Simple regex-based YAML syntax highlighting.
 * Returns an array of React elements with colored spans.
 */
export function highlightYaml(yaml: string) {
  return yaml.split("\n").map((line, i) => {
    // Comments
    const commentIdx = findCommentStart(line)
    if (commentIdx === 0) {
      return (
        <span key={i}>
          <span className="text-muted-foreground">{line}</span>
          {"\n"}
        </span>
      )
    }

    const mainPart = commentIdx > 0 ? line.slice(0, commentIdx) : line
    const commentPart = commentIdx > 0 ? line.slice(commentIdx) : ""

    // Key: value pattern
    const keyMatch = mainPart.match(/^(\s*)([\w][\w.-]*)(:\s*)(.*)$/)
    if (keyMatch) {
      const [, indent = "", key = "", colon = "", value = ""] = keyMatch
      return (
        <span key={i}>
          {indent}
          <span className="text-blue-600 dark:text-blue-400">{key}</span>
          {colon}
          {highlightValue(value)}
          {commentPart && <span className="text-muted-foreground">{commentPart}</span>}
          {"\n"}
        </span>
      )
    }

    // List item: - value
    const listMatch = mainPart.match(/^(\s*-\s)(.*)$/)
    if (listMatch) {
      const [, prefix = "", value = ""] = listMatch
      return (
        <span key={i}>
          {prefix}
          {highlightValue(value)}
          {commentPart && <span className="text-muted-foreground">{commentPart}</span>}
          {"\n"}
        </span>
      )
    }

    return (
      <span key={i}>
        {mainPart}
        {commentPart && <span className="text-muted-foreground">{commentPart}</span>}
        {"\n"}
      </span>
    )
  })
}

function highlightValue(value: string) {
  if (!value) return null
  // Quoted strings
  if (/^["'].*["']$/.test(value.trim())) {
    return <span className="text-emerald-600 dark:text-emerald-400">{value}</span>
  }
  // Booleans / null
  if (/^(true|false|null|~)$/i.test(value.trim())) {
    return <span className="text-orange-600 dark:text-orange-400">{value}</span>
  }
  // Numbers
  if (/^-?\d+(\.\d+)?$/.test(value.trim())) {
    return <span className="text-orange-600 dark:text-orange-400">{value}</span>
  }
  return <span>{value}</span>
}

/** Find index of a YAML comment (# not inside quotes). Simplified. */
function findCommentStart(line: string): number {
  let inQuote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === inQuote) inQuote = null
    } else {
      if (ch === '"' || ch === "'") inQuote = ch
      else if (ch === "#" && (i === 0 || line[i - 1] === " ")) return i
    }
  }
  return -1
}
