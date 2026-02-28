import { cn } from "@/lib/utils"
import { CONTRACT_TABS, type ContractTab } from "./contracts-data"
import { Layers, FileCode2, GitCompare, FlaskConical } from "lucide-react"

const TAB_ICONS: Record<ContractTab, React.ReactNode> = {
  deployments: <Layers className="size-3.5" />,
  versions: <FileCode2 className="size-3.5" />,
  diff: <GitCompare className="size-3.5" />,
  playground: <FlaskConical className="size-3.5" />,
}

export function ContractsTabBar({ activeTab }: { activeTab: ContractTab }) {
  return (
    <div className="flex items-center gap-1 border-b border-border px-6">
      {CONTRACT_TABS.map((tab) => (
        <button
          key={tab.id}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            tab.id === activeTab
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground cursor-default",
          )}
        >
          {TAB_ICONS[tab.id]}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
