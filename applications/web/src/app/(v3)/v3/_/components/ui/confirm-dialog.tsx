"use client"

import { type MouseEvent, useCallback, useState } from "react"

import { Button } from "@v3/_/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { useTranslation } from "@v3/_/hooks/use-translation"

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
  onConfirm: () => void | Promise<void>
  isLoading?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps) {
  const t = useTranslation("EntityActions")

  const handleConfirm = useCallback(async () => {
    await onConfirm()
    onOpenChange(false)
  }, [onConfirm, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <DialogFooter>
          <p className="text-muted-foreground mr-auto hidden self-center text-[0.625rem] md:block">
            {t("shiftSkipHint")}
          </p>

          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
            }}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>

          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? "..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type UseConfirmActionOptions = {
  onConfirm: () => void | Promise<void>
  title: string
  description?: string
  confirmLabel?: string
  variant?: "default" | "destructive"
}

export function useConfirmAction({
  onConfirm,
  title,
  description,
  confirmLabel,
  variant,
}: UseConfirmActionOptions) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const wrappedConfirm = useCallback(async () => {
    setIsLoading(true)
    try {
      await onConfirm()
    } finally {
      setIsLoading(false)
    }
  }, [onConfirm])

  const confirm = useCallback(
    (event?: MouseEvent | { shiftKey: boolean }) => {
      if (event?.shiftKey) {
        void wrappedConfirm()
        return
      }

      setOpen(true)
    },
    [wrappedConfirm],
  )

  const dialogProps: ConfirmDialogProps = {
    open,
    onOpenChange: setOpen,
    title,
    description,
    confirmLabel,
    variant,
    onConfirm: wrappedConfirm,
    isLoading,
  }

  return { confirm, dialogProps, isLoading }
}
