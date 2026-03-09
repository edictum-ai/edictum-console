import type { EventResponse } from "@/lib/api"
import { extractArgsPreview } from "@/lib/payload-helpers"

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportJSON(events: EventResponse[]) {
  downloadFile(JSON.stringify(events, null, 2), "events.json", "application/json")
}

export function exportCSV(events: EventResponse[]) {
  const headers = ["id", "timestamp", "agent_id", "tool_name", "verdict", "mode", "call_id"]
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const rows = events.map((e) =>
    headers.map((h) => escape(String(e[h as keyof EventResponse] ?? ""))).join(","),
  )
  downloadFile([headers.join(","), ...rows].join("\n"), "events.csv", "text/csv")
}

export function exportText(events: EventResponse[]) {
  const lines = events.map((e) => {
    const ts = new Date(e.timestamp).toISOString()
    const preview = extractArgsPreview(e)
    return `${ts}  ${e.agent_id}  ${e.tool_name}  ${e.verdict}  ${preview}`
  })
  downloadFile(lines.join("\n"), "events.txt", "text/plain")
}
