interface DetailRowProps {
  label: string
  value: string
  mono?: boolean
}

export function DetailRow({ label, value, mono }: DetailRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <span
        className={`min-w-0 truncate text-right text-[11px] text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}
