import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Loader2 } from "lucide-react"

interface DeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contractName: string
  onConfirm: () => Promise<void>
  deleting: boolean
  usageCount?: number
  usedByBundles?: string[]
}

export function DeleteDialog({
  open,
  onOpenChange,
  contractName,
  onConfirm,
  deleting,
  usageCount = 0,
  usedByBundles = [],
}: DeleteDialogProps) {
  const isUsed = usageCount > 0

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete &ldquo;{contractName}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              {isUsed ? (
                <div className="space-y-2">
                  <p>
                    This contract is referenced by{" "}
                    <span className="font-medium text-foreground">
                      {usageCount} bundle{usageCount !== 1 ? "s" : ""}
                    </span>
                    . Remove it from all bundles before deleting.
                  </p>
                  {usedByBundles.length > 0 && (
                    <ul className="list-inside list-disc space-y-0.5 text-xs">
                      {usedByBundles.map((name) => (
                        <li key={name} className="text-muted-foreground">
                          {name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p>
                  All versions will be permanently removed. This cannot be
                  undone.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting || isUsed}
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
          >
            {deleting ? (
              <>
                <Loader2 className="animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
