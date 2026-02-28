import { useState } from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChevronRight } from "lucide-react"
import { diffLines, type Change } from "diff"

interface DiffYamlProps {
  oldYaml: string
  newYaml: string
}

export function DiffYaml({ oldYaml, newYaml }: DiffYamlProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"unified" | "side">("unified")

  const changes = diffLines(oldYaml, newYaml)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-3">
        <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground">
          <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
          YAML Diff
        </CollapsibleTrigger>
        {open && (
          <Tabs value={mode} onValueChange={(v) => setMode(v as "unified" | "side")}>
            <TabsList className="h-7">
              <TabsTrigger value="side" className="text-xs px-2 py-0.5">Side-by-side</TabsTrigger>
              <TabsTrigger value="unified" className="text-xs px-2 py-0.5">Unified</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
      <CollapsibleContent>
        <div className="mt-2 rounded-md border bg-muted/20">
          {mode === "unified" ? (
            <UnifiedDiff changes={changes} />
          ) : (
            <SideBySideDiff changes={changes} />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function UnifiedDiff({ changes }: { changes: Change[] }) {
  let lineNum = 0
  return (
    <ScrollArea className="max-h-[500px]">
      <pre className="p-3 text-xs leading-relaxed">
        {changes.map((change, ci) => {
          const lines = change.value.replace(/\n$/, "").split("\n")
          return lines.map((line, li) => {
            if (!change.added && !change.removed) lineNum++
            else if (change.added) lineNum++
            const bg = change.added
              ? "bg-emerald-500/15"
              : change.removed
                ? "bg-red-500/15"
                : ""
            const prefix = change.added ? "+" : change.removed ? "-" : " "
            return (
              <div key={`${ci}-${li}`} className={bg}>
                <span className="inline-block w-8 text-right text-muted-foreground select-none mr-2">
                  {!change.removed ? lineNum : ""}
                </span>
                <span className="text-muted-foreground select-none">{prefix}</span>
                {" "}{line}
              </div>
            )
          })
        })}
      </pre>
    </ScrollArea>
  )
}

function SideBySideDiff({ changes }: { changes: Change[] }) {
  const leftLines: Array<{ text: string; type: "removed" | "context"; num: number }> = []
  const rightLines: Array<{ text: string; type: "added" | "context"; num: number }> = []
  let leftNum = 0
  let rightNum = 0

  for (const change of changes) {
    const lines = change.value.replace(/\n$/, "").split("\n")
    if (!change.added && !change.removed) {
      for (const line of lines) {
        leftNum++; rightNum++
        leftLines.push({ text: line, type: "context", num: leftNum })
        rightLines.push({ text: line, type: "context", num: rightNum })
      }
    } else if (change.removed) {
      for (const line of lines) {
        leftNum++
        leftLines.push({ text: line, type: "removed", num: leftNum })
      }
    } else if (change.added) {
      for (const line of lines) {
        rightNum++
        rightLines.push({ text: line, type: "added", num: rightNum })
      }
    }
  }

  // Pad shorter side
  const maxLen = Math.max(leftLines.length, rightLines.length)
  while (leftLines.length < maxLen) leftLines.push({ text: "", type: "context", num: 0 })
  while (rightLines.length < maxLen) rightLines.push({ text: "", type: "context", num: 0 })

  return (
    <ScrollArea className="max-h-[500px]">
      <div className="grid grid-cols-2 divide-x text-xs leading-relaxed">
        <pre className="p-3">
          {leftLines.map((l, i) => (
            <div key={i} className={l.type === "removed" ? "bg-red-500/15" : ""}>
              <span className="inline-block w-8 text-right text-muted-foreground select-none mr-2">
                {l.num || ""}
              </span>
              {l.text}
            </div>
          ))}
        </pre>
        <pre className="p-3">
          {rightLines.map((l, i) => (
            <div key={i} className={l.type === "added" ? "bg-emerald-500/15" : ""}>
              <span className="inline-block w-8 text-right text-muted-foreground select-none mr-2">
                {l.num || ""}
              </span>
              {l.text}
            </div>
          ))}
        </pre>
      </div>
    </ScrollArea>
  )
}
