"use client"

import { useState } from "react"

import { ImportFromServerDialog } from "@v3/_/components/files/ImportFromServerDialog"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { type BookWithRelations } from "@/database/books"
import {
  type ImportMode,
  type MetadataFieldMode,
  defaultMetadataFieldOverrides,
} from "@/database/settingsTypes"
import * as icon from "@/icons"
import { useReplaceBookAssetMutation } from "@/store/api"

type Format = "ebook" | "audiobook" | "readaloud"

const AUDIO_FILE_EXTENSIONS = [
  ".mp3",
  ".aac",
  ".mp4",
  ".m4a",
  ".m4b",
  ".opus",
  ".ogg",
  ".oga",
  ".mogg",
  ".wav",
  ".aiff",
  ".flac",
  ".alac",
  ".weba",
]

function isEbookFilter(entry: { name: string; isDirectory: boolean }) {
  return !entry.isDirectory && entry.name.toLowerCase().endsWith(".epub")
}

function isAudioFileFilter(entry: { name: string; isDirectory: boolean }) {
  return (
    !entry.isDirectory &&
    AUDIO_FILE_EXTENSIONS.some((ext) => entry.name.toLowerCase().endsWith(ext))
  )
}

function siblingDir(book: BookWithRelations, format: Format): string {
  const others: Format[] = (
    ["ebook", "audiobook", "readaloud"] as const
  ).filter((f) => f !== format)

  for (const f of others) {
    const filepath = book[f]?.filepath
    if (!filepath) continue

    const i = filepath.lastIndexOf("/")
    return i === -1 ? "" : filepath.slice(0, i + 1)
  }

  return ""
}

export function ReplaceFileDialog({
  book,
  format,
  assetsDir,
  open,
  onOpenChange,
}: {
  book: BookWithRelations
  format: Format
  assetsDir?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslation("ImportFromServerDialog")
  const c = useCommon()
  const [replaceAsset, { isLoading }] = useReplaceBookAssetMutation()
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string>("")

  const currentPath = book[format]?.filepath ?? siblingDir(book, format)
  const isAdd = !book[format]?.filepath

  const assetRoot =
    assetsDir && book.assetDir ? `${assetsDir}/${book.assetDir}` : null

  const sourceInsideAssetDir = Boolean(
    selectedPath &&
      assetRoot &&
      (selectedPath === assetRoot || selectedPath.startsWith(`${assetRoot}/`)),
  )

  async function handleSubmit(
    path: string,
    importMode: ImportMode,
    metadataMode: MetadataFieldMode,
  ) {
    setError(null)

    if (!path) {
      setError(t("errorPickFile"))
      return
    }

    try {
      let finalPath = path
      if (format === "audiobook") {
        finalPath = path.replace(/(\/|\\)[^/\\]*?$/, "$1")
      }

      await replaceAsset({
        uuid: book.uuid,
        format,
        path: finalPath,
        importMode,
        metadataFieldOverrides: defaultMetadataFieldOverrides(metadataMode),
      }).unwrap()

      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"))
    }
  }

  const warnings = (
    <>
      {!isAdd && (
        <p className="text-muted-foreground text-xs">
          {t("replaceWarning", { format })}
        </p>
      )}

      {sourceInsideAssetDir && (
        <div className="text-destructive flex items-start gap-2 text-xs">
          <icon.AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("insideAssetDirWarning")}</span>
        </div>
      )}
    </>
  )

  return (
    <ImportFromServerDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
      title={
        isAdd
          ? t("importFormatTitle", { format })
          : t("replaceFormatTitle", { format })
      }
      description={
        format === "audiobook" ? t("audioDescription") : t("ebookDescription")
      }
      startPath={currentPath}
      fileFilter={format === "audiobook" ? isAudioFileFilter : isEbookFilter}
      selectLabel={format === "audiobook" ? t("useThisDirectory") : undefined}
      onSelectionChange={setSelectedPath}
      onSubmit={(path, importMode, metadataMode) => {
        void handleSubmit(path, importMode, metadataMode)
      }}
      isSubmitting={isLoading}
      submitLabel={
        isAdd ? c.plain("actions.import") : c.plain("actions.replace")
      }
      warnings={warnings}
      error={error}
      labels={{
        importMode: t("importMode"),
        importModeReference: c.plain("importMode.reference"),
        importModeCopy: c.plain("importMode.copy"),
        importModeMove: c.plain("importMode.move"),
        importModeHardlink: t("importModeHardlink"),
        metadataBehavior: t("metadataBehavior"),
        metadataMerge: c.plain("metadataBehavior.merge"),
        metadataSkip: c.plain("metadataBehavior.keep"),
        metadataOverwrite: c.plain("metadataBehavior.overwrite"),
        selected: t("selected"),
        cancel: c.plain("actions.cancel"),
      }}
    />
  )
}
