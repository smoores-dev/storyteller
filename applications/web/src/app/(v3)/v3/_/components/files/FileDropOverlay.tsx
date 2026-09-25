"use client"

import { usePathname } from "next/navigation"
import { useEffect, useEffectEvent, useState } from "react"
import { toast } from "sonner"

import { MediaType } from "@storyteller-platform/media-types"

import { useImportBookPaths } from "@v3/_/components/AddBookButton"
import {
  type BookFormat,
  FormatPicker,
} from "@v3/_/components/books/BookDetails/FormatPicker"
import { UploadFileDialog } from "@v3/_/components/books/BookDetails/UploadFileDialog"
import { useOpenBookUpload } from "@v3/_/components/books/UploadBookProvider"
import { Button } from "@v3/_/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { useIsTauri } from "@v3/_/hooks/use-is-tauri"
import { useBookInSidePanel } from "@v3/_/hooks/use-open-book"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { apiErrorMessage } from "@v3/_/lib/api-error"
import { cn } from "@v3/_/lib/utils"

import { type BookWithRelations } from "@/database/books"
import { defaultMetadataFieldOverrides } from "@/database/settingsTypes"
import { usePermissions } from "@/hooks/usePermissions"
import * as icon from "@/icons"
import { useGetBookQuery, useReplaceBookAssetMutation } from "@/store/api"
import { type UUID } from "@/uuid"

type DropZone = "new" | "book"

function zoneAt(x: number, y: number) {
  const zone = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-drop-zone]")?.dataset["dropZone"]
  return (zone as DropZone | undefined) ?? null
}

function isDialogOpen() {
  return document.querySelector('[data-slot="dialog-content"]') !== null
}

export function FileDropOverlay() {
  const t = useTranslation("FileDrop")
  const c = useCommon()
  const isTauri = useIsTauri()
  const permissions = usePermissions()
  const canCreate = !!permissions?.bookCreate
  const canUpdate = !!permissions?.bookUpdate

  const openBookUpload = useOpenBookUpload()
  const importBookPaths = useImportBookPaths()
  const [replaceAsset] = useReplaceBookAssetMutation()

  const pathname = usePathname()
  const { selectedBookUuid } = useBookInSidePanel()
  const collection = /\/collections\/([^/]+)\/?$/.exec(pathname)?.[1] as
    | UUID
    | undefined
  const bookUuid =
    selectedBookUuid ??
    (/\/books\/([^/]+)\/?$/.exec(pathname)?.[1] as UUID | undefined)
  const { currentData: book } = useGetBookQuery(
    { uuid: bookUuid as UUID },
    { skip: !bookUuid || !canUpdate },
  )

  const [dragging, setDragging] = useState(false)
  const [activeZone, setActiveZone] = useState<DropZone | null>(null)
  const [fileUpload, setFileUpload] = useState<{
    book: BookWithRelations
    format: BookFormat
    files: File[]
  } | null>(null)
  const [pathTarget, setPathTarget] = useState<{
    book: BookWithRelations
    format: BookFormat
    path: string
  } | null>(null)

  const hasZones = canCreate || !!book

  async function replaceBookFile(
    target: BookWithRelations,
    format: BookFormat,
    path: string,
  ) {
    try {
      await replaceAsset({
        uuid: target.uuid,
        format,
        path,
        importMode: "reference",
        metadataFieldOverrides: defaultMetadataFieldOverrides("merge"),
      }).unwrap()
    } catch (error) {
      toast.error(apiErrorMessage(error) ?? t.plain("replaceFailed"))
    }
  }

  const onDragMove = useEffectEvent((zone: DropZone | null) => {
    if (!hasZones) return
    setDragging(true)
    setActiveZone(zone)
  })

  const onDragEnd = useEffectEvent(() => {
    setDragging(false)
    setActiveZone(null)
  })

  const onDropFiles = useEffectEvent((zone: DropZone, files: File[]) => {
    if (zone === "new") {
      openBookUpload({ collection, files })
      return
    }
    if (!book) return

    const kinds = files.map((file) => MediaType.fromPath(file.name)?.kind)
    const isEpub = kinds.length === 1 && kinds[0] === "ebook"
    const isAudio = kinds.every(
      (kind) => kind === "audio" || kind === "archive",
    )

    if (!isEpub && !isAudio) {
      toast.error(t.plain("unsupportedFiles"))
      return
    }
    setFileUpload({ book, format: isEpub ? "ebook" : "audiobook", files })
  })

  const onDropPaths = useEffectEvent((zone: DropZone, paths: string[]) => {
    if (zone === "new") {
      importBookPaths(paths, collection).catch((error: unknown) => {
        toast.error(apiErrorMessage(error) ?? t.plain("importFailed"))
      })
      return
    }
    if (!book) return

    const path = paths.length === 1 ? paths[0] : undefined
    const kind = path ? MediaType.fromPath(path)?.kind : null

    if (!path || (kind !== "ebook" && kind !== undefined)) {
      toast.error(t.plain("unsupportedPaths"))
      return
    }
    setPathTarget({
      book,
      format: kind === "ebook" ? "ebook" : "audiobook",
      path,
    })
  })

  useEffect(() => {
    if (isTauri || (!canCreate && !canUpdate)) return

    const controller = new AbortController()
    const { signal } = controller
    let internalDrag = false
    let hideTimer: number | undefined

    const isFileDrag = (event: DragEvent) =>
      !internalDrag && !!event.dataTransfer?.types.includes("Files")

    const endDrag = () => {
      window.clearTimeout(hideTimer)
      onDragEnd()
    }

    window.addEventListener(
      "dragstart",
      () => {
        internalDrag = true
      },
      { signal },
    )
    window.addEventListener(
      "dragend",
      () => {
        internalDrag = false
      },
      { signal },
    )

    window.addEventListener(
      "dragover",
      (event) => {
        if (!isFileDrag(event) || event.defaultPrevented) return
        event.preventDefault()

        const items = Array.from(event.dataTransfer?.items ?? [])
        const imagesOnly =
          items.length > 0 &&
          items.every((item) => item.type.startsWith("image/"))
        const zone =
          imagesOnly || isDialogOpen()
            ? null
            : zoneAt(event.clientX, event.clientY)

        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = zone ? "copy" : "none"
        }
        if (imagesOnly || isDialogOpen()) return

        onDragMove(zone)
        window.clearTimeout(hideTimer)
        hideTimer = window.setTimeout(endDrag, 250)
      },
      { signal },
    )

    window.addEventListener(
      "drop",
      (event) => {
        if (!isFileDrag(event) || event.defaultPrevented) return
        event.preventDefault()
        endDrag()

        const zone = zoneAt(event.clientX, event.clientY)
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (zone && files.length > 0) onDropFiles(zone, files)
      },
      { signal },
    )

    return () => {
      window.clearTimeout(hideTimer)
      controller.abort()
    }
  }, [isTauri, canCreate, canUpdate])

  useEffect(() => {
    if (!isTauri || (!canCreate && !canUpdate)) return

    let disposed = false
    let unlisten: (() => void) | undefined

    void import("@tauri-apps/api/webview").then(
      async ({ getCurrentWebview }) => {
        const stop = await getCurrentWebview().onDragDropEvent(
          ({ payload }) => {
            if (payload.type === "leave") {
              onDragEnd()
              return
            }

            const { x, y } = payload.position.toLogical(window.devicePixelRatio)
            const zone = isDialogOpen() ? null : zoneAt(x, y)

            if (payload.type === "drop") {
              onDragEnd()
              if (zone) onDropPaths(zone, payload.paths)
              return
            }
            if (!isDialogOpen()) onDragMove(zone)
          },
        )
        if (disposed) stop()
        else unlisten = stop
      },
    )

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [isTauri, canCreate, canUpdate])

  return (
    <>
      {dragging && hasZones && (
        <div className="bg-background/80 animate-in fade-in fixed inset-0 z-100 flex flex-col gap-4 p-6 backdrop-blur-sm duration-150 sm:flex-row sm:p-10">
          {canCreate && (
            <div
              data-drop-zone="new"
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
                activeZone === "new"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card/60",
              )}
            >
              <icon.Books
                className={cn(
                  "size-8",
                  activeZone === "new"
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              />
              <span className="font-heading text-lg font-medium">
                {t("newBook")}
              </span>
              <span className="text-muted-foreground max-w-xs text-sm">
                {collection ? t("newBookInCollection") : t("newBookHint")}
              </span>
            </div>
          )}

          {book && (
            <div
              data-drop-zone="book"
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
                activeZone === "book"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card/60",
              )}
            >
              <icon.Replace
                className={cn(
                  "size-8",
                  activeZone === "book"
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              />
              <span className="font-heading line-clamp-2 text-lg font-medium">
                {t("addToBook", { title: book.title })}
              </span>
              <span className="text-muted-foreground max-w-xs text-sm">
                {isTauri ? t("addToBookHintFolder") : t("addToBookHint")}
              </span>
            </div>
          )}
        </div>
      )}

      {fileUpload && (
        <UploadFileDialog
          book={fileUpload.book}
          defaultFormat={fileUpload.format}
          initialFiles={fileUpload.files}
          open
          onOpenChange={(next) => {
            if (!next) setFileUpload(null)
          }}
        />
      )}

      {pathTarget && (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setPathTarget(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t("addToBook", { title: pathTarget.book.title })}
              </DialogTitle>
              <DialogDescription className="break-all">
                {pathTarget.path}
              </DialogDescription>
            </DialogHeader>

            <FormatPicker
              book={pathTarget.book}
              value={pathTarget.format}
              onValueChange={(format) => {
                setPathTarget({ ...pathTarget, format })
              }}
              disabled={
                pathTarget.format === "audiobook"
                  ? ["ebook", "readaloud"]
                  : ["audiobook"]
              }
            />

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setPathTarget(null)
                }}
              >
                {c("actions.cancel")}
              </Button>
              <Button
                onClick={() => {
                  void replaceBookFile(
                    pathTarget.book,
                    pathTarget.format,
                    pathTarget.path,
                  )
                  setPathTarget(null)
                }}
              >
                {pathTarget.book[pathTarget.format]
                  ? t("replaceConfirm")
                  : t("addConfirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
