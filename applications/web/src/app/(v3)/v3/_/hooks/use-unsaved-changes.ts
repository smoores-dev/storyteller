import { useEffect } from "react"
import { toast } from "sonner"

type UnsavedGuard = {
  isDirty: () => boolean
  save: () => Promise<boolean>
  discard: () => void
  labels: () => {
    title: string
    description: string
    save: string
    discard: string
  }
}

const TOAST_ID = "unsaved-changes"

let activeGuard: UnsavedGuard | null = null

export function confirmLeave(proceed: () => void): boolean {
  const guard = activeGuard
  if (!guard || !guard.isDirty()) return true

  const labels = guard.labels()
  toast.warning(labels.title, {
    id: TOAST_ID,
    description: labels.description,
    action: {
      label: labels.save,
      onClick: () => {
        void guard.save().then((ok) => {
          if (ok) proceed()
        })
      },
    },
    cancel: {
      label: labels.discard,
      onClick: () => {
        guard.discard()
        proceed()
      },
    },
  })

  return false
}

export function useUnsavedChangesGuard(guard: UnsavedGuard | null) {
  useEffect(() => {
    if (!guard) return
    activeGuard = guard

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (guard.isDirty()) event.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      if (activeGuard === guard) activeGuard = null
      toast.dismiss(TOAST_ID)
    }
  }, [guard])
}
