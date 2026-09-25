"use client"

import { useRef } from "react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"

import { MediaType } from "@storyteller-platform/media-types"

import { UploadDialog } from "@v3/_/components/files/UploadDialog"
import { type UppyFileType } from "@v3/_/components/files/useTusUpload"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { audioAccept, bookFileTypes, epubAccept } from "@/uploadFileTypes"
import { type UUID } from "@/uuid"

const tusEndpoint =
  typeof window === "undefined"
    ? "/api/v2/books/upload"
    : new URL("/api/v2/books/upload", window.location.origin).toString()

export function UploadBookDialog({
  open,
  onOpenChange,
  collection,
  initialFiles,
  onBookCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  collection?: UUID
  initialFiles?: File[]
  onBookCreated?: (bookUuid: UUID) => void
}) {
  const t = useTranslation("UploadDialog")
  const c = useCommon()
  const bookUuidRef = useRef<UUID>(uuidv4() as UUID)

  function buildMeta(file: UppyFileType, batch: UppyFileType[]) {
    file.meta["bookUuid"] = bookUuidRef.current

    if (collection) {
      file.meta["collection"] = collection
    }

    file.meta["totalFiles"] = String(batch.length)
  }

  async function handleFinalize() {
    await fetch("/api/v2/books/upload/finalize", {
      method: "POST",
      headers: { "Content-Type": MediaType.JSON.mime },
      body: JSON.stringify({
        bookUuid: bookUuidRef.current,
        ...(collection && { collectionUuid: collection }),
      }),
    })
  }

  function handleComplete() {
    const uuid = bookUuidRef.current
    bookUuidRef.current = uuidv4() as UUID
    onBookCreated?.(uuid)
    toast.success(t.plain("bookUploaded"), {
      action: {
        label: t.plain("uploadAnother"),
        onClick: () => {
          onOpenChange(true)
        },
      },
    })
  }

  return (
    <UploadDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          bookUuidRef.current = uuidv4() as UUID
        }
        onOpenChange(next)
      }}
      title={t("uploadBookTitle")}
      description={t("uploadBookDescription")}
      endpoint={tusEndpoint}
      restrictions={{
        allowedFileTypes: bookFileTypes,
      }}
      zones={[
        {
          key: "ebook",
          label: t.plain("zoneEbook"),
          hint: t.plain("zoneEbookHint"),
          accept: epubAccept,
          filter: (name) => MediaType.fromPath(name)?.kind === "ebook",
        },
        {
          key: "audio",
          label: t.plain("zoneAudio"),
          hint: t.plain("zoneAudioHint"),
          accept: audioAccept,
          multiple: true,
          filter: (name) => {
            const kind = MediaType.fromPath(name)?.kind
            return kind === "audio" || kind === "archive"
          },
        },
      ]}
      initialFiles={initialFiles}
      buildMeta={buildMeta}
      onFinalize={handleFinalize}
      onComplete={handleComplete}
      showMetadataMode={false}
      labels={{
        metadataBehavior: t("metadataBehavior"),
        metadataMerge: c.plain("metadataBehavior.merge"),
        metadataSkip: c.plain("metadataBehavior.keep"),
        metadataOverwrite: c.plain("metadataBehavior.overwrite"),
        failedFiles: (count) => t("failedFiles", { count }),
        cancel: c.plain("actions.cancel"),
        upload: c.plain("actions.upload"),
        done: c.plain("actions.done"),
      }}
    />
  )
}
