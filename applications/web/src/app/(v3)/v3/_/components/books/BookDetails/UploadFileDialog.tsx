"use client"

import { useState } from "react"

import { MediaType } from "@storyteller-platform/media-types"

import {
  type BookFormat,
  FormatPicker,
} from "@v3/_/components/books/BookDetails/FormatPicker"
import { UploadDialog } from "@v3/_/components/files/UploadDialog"
import { type UppyFileType } from "@v3/_/components/files/useTusUpload"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { type BookWithRelations } from "@/database/books"
import {
  type MetadataFieldMode,
  defaultMetadataFieldOverrides,
} from "@/database/settingsTypes"
import {
  audioAccept,
  audioFileTypes,
  epubAccept,
  epubFileTypes,
} from "@/uploadFileTypes"

function tusEndpointForBook(bookUuid: string) {
  const path = `/api/v2/books/${bookUuid}/replace-asset/upload`
  if (typeof window === "undefined") return path
  return new URL(path, window.location.origin).toString()
}

export function UploadFileDialog({
  book,
  defaultFormat,
  open,
  onOpenChange,
  initialFiles,
}: {
  book: BookWithRelations
  defaultFormat: BookFormat
  open: boolean
  onOpenChange: (open: boolean) => void
  initialFiles?: File[]
}) {
  const t = useTranslation("UploadDialog")
  const c = useCommon()
  const [format, setFormat] = useState(defaultFormat)
  const isAdd = !book[format]?.filepath
  const [metadataMode, setMetadataMode] = useState<MetadataFieldMode>("merge")

  function buildMeta(file: UppyFileType, batch: UppyFileType[]) {
    const overrides = defaultMetadataFieldOverrides(metadataMode)
    file.meta["bookUuid"] = book.uuid
    file.meta["format"] = format
    file.meta["metadataFieldOverrides"] = JSON.stringify(overrides)

    if (format === "audiobook") {
      file.meta["totalAudioFiles"] = String(batch.length)
    }
  }

  async function handleFinalize() {
    await fetch(`/api/v2/books/${book.uuid}/replace-asset/upload/finalize`, {
      method: "POST",
      headers: { "Content-Type": MediaType.JSON.mime },
      body: JSON.stringify({
        metadataFieldOverrides: defaultMetadataFieldOverrides(metadataMode),
      }),
    })
  }

  return (
    <UploadDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        isAdd
          ? t("uploadFormat", { format })
          : t("uploadReplacementFormat", { format })
      }
      description={
        format === "audiobook"
          ? isAdd
            ? t("audioDescription")
            : t("audioReplaceDescription")
          : ""
      }
      endpoint={tusEndpointForBook(book.uuid)}
      restrictions={{
        maxNumberOfFiles: format === "audiobook" ? null : 1,
        allowedFileTypes:
          format === "audiobook" ? audioFileTypes : epubFileTypes,
      }}
      accept={format === "audiobook" ? audioAccept : epubAccept}
      multiple={format === "audiobook"}
      hint={format === "audiobook" ? t("audioHint") : t("ebookHint")}
      initialFiles={initialFiles}
      aboveZones={(files) => {
        const kinds = files.map(
          (file) => MediaType.fromPath(file.name ?? "")?.kind,
        )
        const hasEpub = kinds.includes("ebook")
        const hasAudio = kinds.some(
          (kind) => kind === "audio" || kind === "archive",
        )
        return (
          <FormatPicker
            book={book}
            value={format}
            onValueChange={setFormat}
            disabled={
              hasEpub ? ["audiobook"] : hasAudio ? ["ebook", "readaloud"] : []
            }
          />
        )
      }}
      buildMeta={buildMeta}
      onFinalize={format === "audiobook" ? handleFinalize : undefined}
      metadataMode={metadataMode}
      onMetadataModeChange={setMetadataMode}
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
