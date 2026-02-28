import { Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface KeyFilterBarProps {
  envFilter: string
  onEnvFilterChange: (env: string) => void
  search: string
  onSearchChange: (search: string) => void
  counts: Record<string, number>
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "development", label: "Development" },
] as const

export function KeyFilterBar({
  envFilter,
  onEnvFilterChange,
  search,
  onSearchChange,
  counts,
}: KeyFilterBarProps) {
  return (
    <div className="space-y-3">
      <Tabs value={envFilter} onValueChange={onEnvFilterChange}>
        <TabsList variant="line">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
              <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">
                {counts[f.value] ?? 0}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder="Filter by label..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  )
}
