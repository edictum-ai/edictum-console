import { Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type {
  ViewOptions, ColumnVisibility, PanelVisibility, Density,
} from "@/lib/hooks/use-view-options"

interface ViewOptionsPopoverProps {
  options: ViewOptions
  onSetColumn: (key: keyof ColumnVisibility, visible: boolean) => void
  onSetPanel: (key: keyof PanelVisibility, visible: boolean) => void
  onSetDensity: (d: Density) => void
  onToggleWrapData: () => void
  onResetDefaults: () => void
}

const COLUMN_LABELS: Record<keyof ColumnVisibility, string> = {
  time: "Time", agent: "Agent", tool: "Tool", verdict: "Verdict",
  data: "Data (payload)", mode: "Mode", contract: "Contract",
  duration: "Duration", environment: "Environment", traceId: "Trace ID",
}

const PANEL_LABELS: Record<keyof PanelVisibility, string> = {
  filters: "Show filters", histogram: "Show histogram",
}

const DENSITIES: { value: Density; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "dense", label: "Dense" },
  { value: "comfortable", label: "Comfortable" },
]

const heading = "text-[10px] font-medium text-muted-foreground uppercase tracking-wider"

function CheckRow({ id, checked, onChange, label }: {
  id: string; checked: boolean; onChange: (v: boolean) => void; label: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={id} className="text-sm font-normal cursor-pointer">{label}</Label>
    </div>
  )
}

export function ViewOptionsPopover({
  options, onSetColumn, onSetPanel, onSetDensity, onToggleWrapData, onResetDefaults,
}: ViewOptionsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="View options">
          <Settings2 className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3">
        <p className={heading}>Columns</p>
        <div className="mt-2 space-y-2">
          {(Object.keys(COLUMN_LABELS) as (keyof ColumnVisibility)[]).map((key) => (
            <CheckRow
              key={key}
              id={`col-${key}`}
              checked={options.columns[key]}
              onChange={(v) => onSetColumn(key, v)}
              label={COLUMN_LABELS[key]}
            />
          ))}
        </div>

        <Separator className="my-3" />

        <p className={heading}>Panels</p>
        <div className="mt-2 space-y-2">
          {(Object.keys(PANEL_LABELS) as (keyof PanelVisibility)[]).map((key) => (
            <CheckRow
              key={key}
              id={`panel-${key}`}
              checked={options.panels[key]}
              onChange={(v) => onSetPanel(key, v)}
              label={PANEL_LABELS[key]}
            />
          ))}
        </div>

        <Separator className="my-3" />

        <p className={heading}>Display</p>
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-1">
            {DENSITIES.map((d) => (
              <Button
                key={d.value}
                size="sm"
                variant={options.density === d.value ? "secondary" : "ghost"}
                className="h-7 px-2 text-xs flex-1"
                onClick={() => onSetDensity(d.value)}
              >
                {d.label}
              </Button>
            ))}
          </div>
          <CheckRow
            id="wrap-data"
            checked={options.wrapData}
            onChange={onToggleWrapData}
            label="Wrap data column"
          />
        </div>

        <Separator className="my-3" />

        <Button variant="ghost" size="sm" className="w-full" onClick={onResetDefaults}>
          Reset to defaults
        </Button>
      </PopoverContent>
    </Popover>
  )
}
