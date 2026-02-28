import { cn } from "@/lib/utils"
import { CONTRACT_TABS_V2, type ContractTabV2 } from "./contracts-data"
import { FileText, History, GitCompare, FlaskConical } from "lucide-react"

const TAB_ICONS: Record<ContractTabV2, React.ReactNode> = {
  contracts: <FileText className="size-3.5" />,
  versions: <History className="size-3.5" />,
  diff: <GitCompare className="size-3.5" />,
  playground: <FlaskConical className="size-3.5" />,
}

interface ContractsTabBarV2Props {
  activeTab: ContractTabV2
  onTabChange?: (tab: ContractTabV2) => void
}

export function ContractsTabBarV2({ activeTab, onTabChange }: ContractsTabBarV2Props) {
  return (
    <div className="flex items-center gap-1 border-b border-border px-6">
      {CONTRACT_TABS_V2.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange?.(tab.id)}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            tab.id === activeTab
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {TAB_ICONS[tab.id]}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
