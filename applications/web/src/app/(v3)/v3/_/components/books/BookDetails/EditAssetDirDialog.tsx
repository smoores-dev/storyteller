"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"

import { Button } from "@v3/_/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { Input } from "@v3/_/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@v3/_/components/ui/radio-group"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { type BookWithRelations } from "@/database/books"
import { useUpdateBookAssetDirMutation } from "@/store/api"

type ConflictResolution = {
  ebook?: "current" | "target"
  audiobook?: "current" | "target"
  readaloud?: "current" | "target"
}

type ConflictInfo =
  | {
      kind: "owned_by_another_book"
      ownerUuid: string
      ownerTitle: string
    }
  | {
      kind: "files_exist_on_disk"
      existingFiles: {
        ebook?: string
        audiobook?: string
        readaloud?: string
      }
    }

export function EditAssetDirDialog({
  book,
  open,
  onOpenChange,
}: {
  book: BookWithRelations
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslation("BookDetailsPage")
  const c = useCommon()

  const [value, setValue] = useState(book.assetDir)
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)
  const [resolution, setResolution] = useState<ConflictResolution>({})
  const [updateAssetDir, { isLoading }] = useUpdateBookAssetDirMutation()

  const handleSubmit = useCallback(
    async (e: React.SubmitEvent) => {
      e.preventDefault()

      const trimmed = value.trim()
      if (!trimmed || trimmed === book.assetDir) {
        onOpenChange(false)
        return
      }

      try {
        const conflictRes =
          conflict?.kind === "files_exist_on_disk" ? resolution : undefined

        await updateAssetDir({
          uuid: book.uuid,
          assetDir: trimmed,
          conflictResolution: conflictRes,
        }).unwrap()

        toast.success(t.plain("fileInformation.assetFolderUpdated"))
        setConflict(null)
        onOpenChange(false)
      } catch (err: unknown) {
        const error = err as {
          status?: number
          data?: { conflict?: ConflictInfo }
        }

        if (error.status === 409 && error.data?.conflict) {
          setConflict(error.data.conflict)

          if (error.data.conflict.kind === "files_exist_on_disk") {
            const defaults: ConflictResolution = {}
            const existing = error.data.conflict.existingFiles

            if (existing.ebook) {
              defaults.ebook = book.ebook?.missing ? "target" : "current"
            }
            if (existing.audiobook) {
              defaults.audiobook = book.audiobook?.missing
                ? "target"
                : "current"
            }
            if (existing.readaloud) {
              defaults.readaloud = book.readaloud?.missing
                ? "target"
                : "current"
            }

            setResolution(defaults)
          }
        }
      }
    },
    [value, book, conflict, resolution, updateAssetDir, onOpenChange, t],
  )

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setConflict(null)
        setResolution({})
        setValue(book.assetDir)
      }
      onOpenChange(next)
    },
    [onOpenChange, book.assetDir],
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>{t("fileInformation.editAssetFolder")}</DialogTitle>
            <DialogDescription>
              {t("fileInformation.editAssetFolderDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <label htmlFor="asset-dir-input" className="text-sm font-medium">
                {t("fileInformation.assetFolderLabel")}
              </label>

              <Input
                id="asset-dir-input"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value)
                  setConflict(null)
                }}
                autoFocus
              />
            </div>

            {conflict?.kind === "owned_by_another_book" && (
              <p className="text-destructive text-sm">
                {t("fileInformation.conflictOwnedByOther", {
                  title: conflict.ownerTitle,
                })}
              </p>
            )}

            {conflict?.kind === "files_exist_on_disk" && (
              <div className="space-y-3">
                <p className="text-warning text-sm font-medium">
                  {t("fileInformation.conflictFilesExist")}
                </p>

                {conflict.existingFiles.ebook && (
                  <FormatResolutionPicker
                    format="ebook"
                    value={resolution.ebook ?? "current"}
                    onChange={(v) => {
                      setResolution((r) => ({ ...r, ebook: v }))
                    }}
                    keepCurrentLabel={t.plain("fileInformation.keepCurrent")}
                    keepTargetLabel={t.plain("fileInformation.keepTarget")}
                  />
                )}

                {conflict.existingFiles.audiobook && (
                  <FormatResolutionPicker
                    format="audiobook"
                    value={resolution.audiobook ?? "current"}
                    onChange={(v) => {
                      setResolution((r) => ({ ...r, audiobook: v }))
                    }}
                    keepCurrentLabel={t.plain("fileInformation.keepCurrent")}
                    keepTargetLabel={t.plain("fileInformation.keepTarget")}
                  />
                )}

                {conflict.existingFiles.readaloud && (
                  <FormatResolutionPicker
                    format="readaloud"
                    value={resolution.readaloud ?? "current"}
                    onChange={(v) => {
                      setResolution((r) => ({ ...r, readaloud: v }))
                    }}
                    keepCurrentLabel={t.plain("fileInformation.keepCurrent")}
                    keepTargetLabel={t.plain("fileInformation.keepTarget")}
                  />
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                handleOpenChange(false)
              }}
              disabled={isLoading}
            >
              {c("actions.cancel")}
            </Button>

            <Button
              type="submit"
              disabled={
                isLoading ||
                !value.trim() ||
                conflict?.kind === "owned_by_another_book"
              }
            >
              {isLoading ? c("states.saving") : c("actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FormatResolutionPicker({
  format,
  value,
  onChange,
  keepCurrentLabel,
  keepTargetLabel,
}: {
  format: "ebook" | "audiobook" | "readaloud"
  value: "current" | "target"
  onChange: (value: "current" | "target") => void
  keepCurrentLabel: string
  keepTargetLabel: string
}) {
  const FORMAT_LABELS: Record<string, string> = {
    ebook: "Ebook",
    audiobook: "Audiobook",
    readaloud: "Readaloud",
  }

  return (
    <div className="rounded-md border p-3">
      <p className="mb-2 text-xs font-medium tracking-wide uppercase">
        {FORMAT_LABELS[format]}
      </p>

      <RadioGroup
        value={value}
        onValueChange={(v) => {
          onChange(v as "current" | "target")
        }}
        className="gap-2"
      >
        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="current" />
          {keepCurrentLabel}
        </label>

        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="target" />
          {keepTargetLabel}
        </label>
      </RadioGroup>
    </div>
  )
}
