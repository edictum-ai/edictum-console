import { useMemo, useCallback, useRef, useEffect, useState } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { yaml as yamlLanguage } from "@codemirror/lang-yaml"
import { oneDark } from "@codemirror/theme-one-dark"
import { linter, type Diagnostic } from "@codemirror/lint"
import { EditorView } from "@codemirror/view"
import { useTheme } from "@/hooks/use-theme"
import { Badge } from "@/components/ui/badge"
import jsYaml from "js-yaml"

interface YamlEditorProps {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  height?: string | number
  validation?: {
    valid: boolean
    error?: string
    line?: number
  }
  placeholder?: string
}

interface ParsedInfo {
  contractCount: number
  types: string[]
}

function parseYamlInfo(content: string): ParsedInfo | null {
  try {
    const doc = jsYaml.load(content)
    if (!doc || typeof doc !== "object") return null
    const root = doc as Record<string, unknown>
    const contracts = root.contracts
    if (!Array.isArray(contracts)) return null
    const types = new Set<string>()
    for (const c of contracts) {
      if (c && typeof c === "object" && "type" in c && typeof c.type === "string") {
        types.add(c.type)
      }
    }
    return { contractCount: contracts.length, types: [...types] }
  } catch {
    return null
  }
}

export function YamlEditor({
  value,
  onChange,
  readOnly = false,
  height = "300px",
  validation,
  placeholder,
}: YamlEditorProps) {
  const { theme } = useTheme()
  const [info, setInfo] = useState<ParsedInfo | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Debounced YAML parsing for status bar
  const updateInfo = useCallback((content: string) => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setInfo(parseYamlInfo(content))
    }, 300)
  }, [])

  useEffect(() => {
    updateInfo(value)
    return () => clearTimeout(debounceRef.current)
  }, [value, updateInfo])

  // Validation linter extension
  const validationLinter = useMemo(() => {
    if (!validation?.error || !validation.line) return []
    return [
      linter((view) => {
        const line = validation.line!
        const lineCount = view.state.doc.lines
        if (line < 1 || line > lineCount) return []
        const lineObj = view.state.doc.line(line)
        const diagnostic: Diagnostic = {
          from: lineObj.from,
          to: lineObj.to,
          severity: "error",
          message: validation.error!,
        }
        return [diagnostic]
      }),
    ]
  }, [validation?.error, validation?.line])

  const extensions = useMemo(() => {
    const exts = [yamlLanguage(), EditorView.lineWrapping, ...validationLinter]
    if (readOnly) {
      exts.push(EditorView.editable.of(false))
    }
    return exts
  }, [readOnly, validationLinter])

  const heightStr = typeof height === "number" ? `${height}px` : height

  return (
    <div className="space-y-1.5">
      <div className="overflow-hidden rounded-md border border-border">
        <CodeMirror
          value={value}
          onChange={onChange}
          extensions={extensions}
          theme={theme === "dark" ? oneDark : "light"}
          placeholder={placeholder}
          height={heightStr}
          readOnly={readOnly}
          basicSetup={{ lineNumbers: true, foldGutter: true }}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-1 text-xs">
        {validation ? (
          validation.valid ? (
            <span className="text-emerald-600 dark:text-emerald-400">Valid</span>
          ) : (
            <span className="text-red-600 dark:text-red-400">
              {validation.error ?? "Invalid YAML"}
            </span>
          )
        ) : null}

        {info && (
          <span className="text-zinc-600 dark:text-zinc-400">
            {info.contractCount} contract{info.contractCount !== 1 ? "s" : ""}
            {info.types.length > 0 && (
              <>
                {" \u00B7 "}
                {info.types.map((t) => (
                  <Badge
                    key={t}
                    variant="outline"
                    className="mx-0.5 text-[10px] px-1 py-0"
                  >
                    {t}
                  </Badge>
                ))}
              </>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
