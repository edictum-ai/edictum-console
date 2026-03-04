import { useState, useCallback } from "react"
import * as yaml from "js-yaml"
import { toast } from "sonner"
import {
  getContract,
  deleteContract,
  getContractUsage,
  importContracts,
  type LibraryContract,
  type LibraryContractSummary,
  type ContractUsageItem,
} from "@/lib/api/contracts"

export function useLibraryActions(
  contracts: LibraryContractSummary[],
  fetchContracts: () => void,
) {
  // Editor dialog
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<LibraryContract | undefined>()
  const [initialDef, setInitialDef] = useState<string | undefined>()

  // Import dialog
  const [importOpen, setImportOpen] = useState(false)

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<LibraryContractSummary | null>(null)
  const [deleteUsage, setDeleteUsage] = useState<ContractUsageItem[]>([])
  const [deleting, setDeleting] = useState(false)

  // Detail sheet
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  // Template import
  const [templateImporting, setTemplateImporting] = useState(false)

  const openNewContract = useCallback((prefill?: string) => {
    setEditingContract(undefined)
    setInitialDef(prefill)
    setEditorOpen(true)
  }, [])

  const handleEdit = useCallback(async (contractId: string) => {
    try {
      const full = await getContract(contractId)
      setEditingContract(full)
      setInitialDef(undefined)
      setEditorOpen(true)
      setDetailOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load contract")
    }
  }, [])

  const handleDuplicate = useCallback(async (contractId: string) => {
    try {
      const full = await getContract(contractId)
      setEditingContract(undefined)
      setInitialDef(yaml.dump(full.definition, { lineWidth: -1 }))
      setEditorOpen(true)
      setDetailOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load contract")
    }
  }, [])

  const handleDeleteRequest = useCallback(async (contractId: string) => {
    const c = contracts.find((x) => x.contract_id === contractId)
    if (!c) return
    setDeleteTarget(c)
    try {
      const usage = await getContractUsage(contractId)
      setDeleteUsage(usage)
    } catch {
      setDeleteUsage([])
    }
    setDeleteOpen(true)
    setDetailOpen(false)
  }, [contracts])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteContract(deleteTarget.contract_id)
      toast.success(`Deleted "${deleteTarget.name}"`)
      setDeleteOpen(false)
      fetchContracts()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete")
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, fetchContracts])

  const handleTemplateImport = useCallback(async (yamlContent: string) => {
    setTemplateImporting(true)
    try {
      const res = await importContracts(yamlContent)
      const total = res.contracts_created.length + res.contracts_updated.length
      toast.success(`Imported ${total} contract${total !== 1 ? "s" : ""}`)
      fetchContracts()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed")
    } finally {
      setTemplateImporting(false)
    }
  }, [fetchContracts])

  const openDetail = useCallback((contractId: string) => {
    setDetailId(contractId)
    setDetailOpen(true)
  }, [])

  return {
    // Editor
    editorOpen, setEditorOpen, editingContract, initialDef, openNewContract,
    // Import
    importOpen, setImportOpen,
    // Delete
    deleteOpen, setDeleteOpen, deleteTarget, deleteUsage, deleting,
    // Detail
    detailOpen, setDetailOpen, detailId,
    // Template
    templateImporting,
    // Handlers
    handleEdit, handleDuplicate, handleDeleteRequest, handleDeleteConfirm,
    handleTemplateImport, openDetail,
  }
}
