import { Monitor, Bell, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const SECTIONS = [
  { id: "system", label: "System", icon: Monitor },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
] as const

interface SettingsSidebarProps {
  activeSection: string
  onSectionChange: (section: string) => void
}

export function SettingsSidebar({ activeSection, onSectionChange }: SettingsSidebarProps) {
  return (
    <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
      {SECTIONS.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          variant="ghost"
          className={cn(
            "justify-start",
            activeSection === id && "bg-accent text-accent-foreground",
          )}
          onClick={() => onSectionChange(id)}
        >
          <Icon className="mr-2 size-4" />
          {label}
        </Button>
      ))}
    </nav>
  )
}
