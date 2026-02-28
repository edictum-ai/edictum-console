import type { Expression } from "./types"

export function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded bg-muted/40 px-3 py-2">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

export function ExpressionTree({ expr, depth }: { expr: Expression; depth: number }) {
  const ml = depth > 0 ? "ml-4" : ""

  if ("all" in expr) {
    const items = (expr as { all: Expression[] }).all
    return (
      <div className={ml}>
        <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">ALL</span>
        {items.map((e, i) => <ExpressionTree key={i} expr={e} depth={depth + 1} />)}
      </div>
    )
  }
  if ("any" in expr) {
    const items = (expr as { any: Expression[] }).any
    return (
      <div className={ml}>
        <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">ANY</span>
        {items.map((e, i) => <ExpressionTree key={i} expr={e} depth={depth + 1} />)}
      </div>
    )
  }
  if ("not" in expr) {
    return (
      <div className={ml}>
        <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">NOT</span>
        <ExpressionTree expr={(expr as { not: Expression }).not} depth={depth + 1} />
      </div>
    )
  }

  // Leaf
  const entries = Object.entries(expr as Record<string, Record<string, unknown>>)
  if (entries.length === 0) return null
  const [selector, ops] = entries[0]
  const opStr = Object.entries(ops)
    .map(([op, val]) => {
      if (op === "exists") return val ? "is set" : "is not set"
      if (Array.isArray(val)) return `${op} [${val.join(", ")}]`
      return `${op} ${String(val)}`
    })
    .join(", ")

  return (
    <div className={`${ml} text-xs`}>
      <code className="font-medium text-foreground">{selector}</code>{" "}
      <span className="text-muted-foreground">{opStr}</span>
    </div>
  )
}
