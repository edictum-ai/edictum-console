import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "react-router"
import {
  listBundles,
  listBundleVersions,
  getContractStats,
  getBundleYaml,
  type BundleSummary,
  type BundleWithDeployments,
  type ContractCoverage,
} from "@/lib/api"
import { getAgentStatus } from "@/lib/api/agents"
import { parseContractBundle } from "./yaml-parser"
import type { ContractBundle } from "./types"

export function useContractsData() {
  const [searchParams] = useSearchParams()

  const [summaries, setSummaries] = useState<BundleSummary[]>([])
  const [selectedBundle, setSelectedBundle] = useState<string | null>(
    searchParams.get("bundle"),
  )
  const [versions, setVersions] = useState<BundleWithDeployments[]>([])
  const [selectedVersion, setSelectedVersion] = useState<number | null>(
    searchParams.get("version") ? Number(searchParams.get("version")) : null,
  )

  const [coverage, setCoverage] = useState<ContractCoverage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [yamlContent, setYamlContent] = useState("")
  const [parsedBundle, setParsedBundle] = useState<ContractBundle | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [agentCount, setAgentCount] = useState<number | null>(null)

  // Fetch summaries + coverage
  const refreshSummaries = useCallback(async () => {
    try {
      const [s, stats] = await Promise.all([listBundles(), getContractStats()])
      setSummaries(s)
      setCoverage(stats.coverage)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshSummaries()
  }, [refreshSummaries])

  // Auto-select first bundle when summaries load
  useEffect(() => {
    if (summaries.length === 0) return
    if (selectedBundle && summaries.some((s) => s.name === selectedBundle)) return
    setSelectedBundle(summaries[0]!.name)
  }, [summaries, selectedBundle])

  // Fetch versions when selected bundle changes
  const refreshVersions = useCallback(async () => {
    if (!selectedBundle) { setVersions([]); return }
    try {
      setVersions(await listBundleVersions(selectedBundle))
    } catch {
      setVersions([])
    }
  }, [selectedBundle])

  useEffect(() => {
    void refreshVersions()
  }, [refreshVersions])

  // Auto-select latest version when versions load
  useEffect(() => {
    if (versions.length === 0) return
    if (selectedVersion && versions.some((v) => v.version === selectedVersion)) return
    setSelectedVersion(versions[0]!.version)
  }, [versions, selectedVersion])

  // Fetch agent count for selected bundle
  useEffect(() => {
    if (!selectedBundle) { setAgentCount(null); return }
    let cancelled = false
    getAgentStatus(selectedBundle)
      .then((data) => { if (!cancelled) setAgentCount(data.agents.length) })
      .catch(() => { if (!cancelled) setAgentCount(null) })
    return () => { cancelled = true }
  }, [selectedBundle])

  // Load YAML when bundle + version changes
  useEffect(() => {
    if (!selectedBundle || !selectedVersion) return
    getBundleYaml(selectedBundle, selectedVersion)
      .then((yaml) => {
        setYamlContent(yaml)
        try {
          setParsedBundle(parseContractBundle(yaml))
          setParseError(null)
        } catch (e) {
          setParsedBundle(null)
          setParseError(e instanceof Error ? e.message : "Invalid contract YAML")
        }
      })
      .catch(() => setError("Failed to load bundle YAML"))
  }, [selectedBundle, selectedVersion])

  const handleBundleChange = useCallback((name: string) => {
    setSelectedBundle(name)
    setSelectedVersion(null)
    setYamlContent("")
    setParsedBundle(null)
    setParseError(null)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
    setLoading(true)
  }, [])

  return {
    summaries, selectedBundle, versions, selectedVersion,
    coverage, loading, error, yamlContent, parsedBundle, parseError,
    agentCount,
    refreshSummaries, refreshVersions, handleBundleChange,
    setSelectedVersion, clearError,
  }
}
