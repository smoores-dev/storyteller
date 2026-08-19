"use client"

import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { type ComponentType, useMemo, useState } from "react"

import { Badge } from "@v3/_/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"

import { useBookForm } from "@/app/(v3)/v3/_/components/books/BookDetails/BookFormProvider"
import { EditAssetDirDialog } from "@/app/(v3)/v3/_/components/books/BookDetails/EditAssetDirDialog"
import { EditIdentifiersDialog } from "@/app/(v3)/v3/_/components/books/BookDetails/EditIdentifiersDialog"
import { ReplaceFileDialog } from "@/app/(v3)/v3/_/components/books/BookDetails/ReplaceFileDialog"
import { UploadFileDialog } from "@/app/(v3)/v3/_/components/books/BookDetails/UploadFileDialog"
import { openTauriFileDialog } from "@/app/(v3)/v3/_/components/files/ServerFileBrowser"
import { ConfirmDialog } from "@/app/(v3)/v3/_/components/ui/confirm-dialog"
import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import { useIsTauri } from "@/app/(v3)/v3/_/hooks/use-is-tauri"
import {
  useCommon,
  useTranslation,
} from "@/app/(v3)/v3/_/hooks/use-translation"
import { cn } from "@/cn"
import { IconReadaloud } from "@/components/icons/IconReadaloud"
import { formatTimeHuman } from "@/components/reader/preferenceItems/formatTime"
import { type BookWithRelations } from "@/database/books"
import {
  getCoreIdentifier,
  renderIdentifierUrl,
} from "@/database/identifierKinds"
import { type IdentifierKind } from "@/database/identifiers"
import { defaultMetadataFieldOverrides } from "@/database/settingsTypes"
import { usePermission } from "@/hooks/usePermission"
import * as icon from "@/icons"
import {
  getDownloadUrl,
  useRemoveBookAssetMutation,
  useReplaceBookAssetMutation,
} from "@/store/api"
import { formatFileSize } from "@/utils/formatFileSize"

import { CollapsibleSection } from "./CollapsibleSection"

const EBOOK_FILTERS = [{ name: "Ebooks", extensions: ["epub"] }]
const AUDIO_FILTERS = [
  {
    name: "Audio files",
    extensions: [
      "mp3",
      "aac",
      "mp4",
      "m4a",
      "m4b",
      "opus",
      "ogg",
      "oga",
      "wav",
      "flac",
      "zip",
    ],
  },
]

type Format = "ebook" | "audiobook" | "readaloud"

const FORMAT_ICONS: Record<Format, ComponentType<{ className?: string }>> = {
  ebook: icon.BookAlt,
  audiobook: icon.Headphones,
  readaloud: IconReadaloud,
}

function IdentifierChip({
  label,
  value,
  href,
  copyLabel,
  copiedLabel,
}: {
  label: string
  value: string
  href: string | null
  copyLabel: string
  copiedLabel: string
}) {
  const [copied, setCopied] = useState(false)

  const valueClasses =
    "flex min-w-0 items-center gap-1 px-1.5 py-0.5 font-mono text-xs"

  return (
    <span className="group/chip inline-flex max-w-full items-stretch overflow-hidden rounded-md border text-xs">
      <span className="border-border/70 bg-muted/50 small-caps flex items-center border-r px-1.5 font-sans">
        {label}
      </span>

      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={value}
          className={`${valueClasses} text-foreground/90 hover:text-foreground decoration-muted-foreground/50 underline-offset-2 hover:underline`}
        >
          <span className="truncate">{value}</span>
          <icon.ExternalLink className="size-2.5 shrink-0 opacity-40 transition-opacity group-hover/chip:opacity-80" />
        </a>
      ) : (
        <span title={value} className={`${valueClasses} text-foreground/90`}>
          <span className="truncate">{value}</span>
        </span>
      )}

      <button
        type="button"
        aria-label={copied ? copiedLabel : copyLabel}
        title={copied ? copiedLabel : copyLabel}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            setTimeout(() => {
              setCopied(false)
            }, 1500)
          })
        }}
        className="border-border/50 text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 flex items-center border-l px-1 transition-colors"
      >
        {copied ? (
          <icon.Check className="size-2.5" />
        ) : (
          <icon.Copy className="size-2.5" />
        )}
      </button>
    </span>
  )
}

function FormatFileRow({
  book,
  format,
  canRemove,
  isTauri,
  onReplace,
  onReplaceServer,
  onReplaceUpload,
  onRemove,
}: {
  book: BookWithRelations
  format: Format
  canRemove: boolean
  isTauri: boolean
  onReplace: () => void
  onReplaceServer: () => void
  onReplaceUpload: () => void
  onRemove: () => void
}) {
  const fmt = book[format]

  const canEdit = usePermission("bookUpdate")
  const canDownload = usePermission("bookDownload")
  const { isEditing } = useBookForm()

  const t = useTranslation("BookDetailsPage")
  const tLabels = useTranslation("Labels")
  const c = useCommon()

  const [editingIdentifiers, setEditingIdentifiers] = useState(false)

  const siblingValues = useMemo(() => {
    const map = new Map<IdentifierKind, string>()
    const groups = [
      book.identifiers,
      book.ebook?.identifiers,
      book.audiobook?.identifiers,
      book.readaloud?.identifiers,
    ]
    for (const group of groups) {
      for (const identifier of group ?? []) {
        if (identifier.kind && !map.has(identifier.kind)) {
          map.set(identifier.kind, identifier.value)
        }
      }
    }
    return map
  }, [book])

  if (!fmt) return null

  const Icon = FORMAT_ICONS[format]
  const isEpub2 = "isEpub2" in fmt && fmt.isEpub2

  const filepath = fmt.filepath ?? ""

  const FORMAT_LABELS: Record<Format, string> = {
    ebook: t("fileInformation.ebook"),
    audiobook: t("fileInformation.audiobook"),
    readaloud: t("fileInformation.readaloud"),
  }

  const pageCount =
    format !== "audiobook"
      ? book.pageCount ?? ("pageCount" in fmt ? fmt.pageCount : null)
      : null
  const duration =
    format !== "ebook"
      ? book.duration ?? ("duration" in fmt ? fmt.duration : null)
      : null
  const fileSize = formatFileSize(fmt.fileSize ?? null)
  const identifiers = fmt.identifiers

  return (
    <div className="group/file flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-sans text-sm">
            {FORMAT_LABELS[format]}
          </span>
          <Icon className="text-muted-foreground h-4 w-4 shrink-0 stroke-1" />
          {fmt.missing && (
            <Badge variant="destructive" className="h-4 gap-0.5 px-1 text-xs">
              <icon.AlertTriangle className="h-2.5 w-2.5" />
              {tLabels("missing")}
            </Badge>
          )}
          {isEpub2 && (
            <Badge variant="outline" className="h-4 px-1 text-xs">
              EPUB 2
            </Badge>
          )}

          {(canEdit || canDownload) && (
            <div className="flex grow items-center justify-end gap-1">
              {/* downloading is a file action, so it lives on the file rather
                  than in the hero. a missing file has nothing to send. */}
              {canDownload && !!filepath && !fmt.missing && (
                <TooltipButton
                  variant="ghost"
                  size="icon-sm"
                  nativeButton={false}
                  tooltip={t.plain("downloads.download")}
                  className={cn(
                    "text-muted-foreground font-thin opacity-0 transition-opacity",
                    "group-hover/file:opacity-100",
                    isEditing && "opacity-100",
                  )}
                  aria-label={`Download ${FORMAT_LABELS[format]}`}
                  render={
                    <a href={getDownloadUrl(book.uuid, format)} download>
                      <icon.Download className="h-3.5 w-3.5 stroke-[1.5]" />
                    </a>
                  }
                />
              )}

              {canEdit && (
                <>
                  {isTauri ? (
                    <TooltipButton
                      variant="ghost"
                      size="icon-sm"
                      tooltip={c.plain("actions.replace")}
                      className={cn(
                        "text-muted-foreground font-thin opacity-0 transition-opacity",
                        "group-hover/file:opacity-100",
                        isEditing && "opacity-100",
                      )}
                      aria-label={`Replace ${format} file`}
                      onClick={onReplace}
                    >
                      <icon.Replace className="h-3.5 w-3.5 stroke-[1.5]" />
                    </TooltipButton>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <TooltipButton
                            variant="ghost"
                            size="icon-sm"
                            tooltip={c.plain("actions.replace")}
                            className={cn(
                              "text-muted-foreground font-thin opacity-0 transition-opacity",
                              "group-hover/file:opacity-100",
                              isEditing && "opacity-100",
                            )}
                            aria-label={`Replace ${format} file`}
                          >
                            <icon.Replace className="h-3.5 w-3.5 stroke-[1.5]" />
                          </TooltipButton>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-fit">
                        <DropdownMenuItem
                          onClick={onReplaceServer}
                          className="whitespace-nowrap"
                        >
                          <icon.Server className="mr-2 h-4 w-4" />
                          {c("actions.import")}
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={onReplaceUpload}
                          className="whitespace-nowrap"
                        >
                          <icon.Upload className="mr-2 h-4 w-4" />
                          {c("actions.upload")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {identifiers.length === 0 && (
                    <TooltipButton
                      variant="ghost"
                      onClick={() => {
                        setEditingIdentifiers(true)
                      }}
                      size="xs"
                      className={cn(
                        "text-muted-foreground/60 relative font-sans text-xs tracking-wide uppercase transition-colors",
                        "font-normal opacity-0 transition-opacity",
                        "group-hover/file:opacity-100",
                        isEditing && "opacity-100",
                      )}
                      tooltip={t("identifiers.add")}
                      aria-label={t("identifiers.add")}
                    >
                      <span>ID</span>
                      <icon.Plus className="absolute -top-0.5 -right-0.5 size-2.5" />
                    </TooltipButton>
                  )}
                  {canRemove && (
                    <TooltipButton
                      variant="ghost"
                      size="icon-sm"
                      tooltip={c.plain("actions.remove")}
                      className={cn(
                        "text-muted-foreground/60 hover:text-foreground opacity-0 transition-opacity",
                        "group-hover/file:opacity-100",
                        isEditing && "opacity-100",
                      )}
                      aria-label={c.plain("actions.remove")}
                      onClick={onRemove}
                    >
                      <icon.Trash className="h-3.5 w-3.5" />
                    </TooltipButton>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <p className="truncate text-left text-sm" title={filepath}>
          {filepath}
        </p>

        <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs">
          {pageCount != null && <span>{pageCount} pages</span>}
          {duration != null && <span>{formatTimeHuman(duration)}</span>}
          {!!fileSize && <span>{fileSize}</span>}
        </div>
        {(identifiers.length > 0 || canEdit) && (
          <div className="group/identifiers mt-1.5 flex flex-wrap items-stretch gap-1">
            {identifiers.map((identifier) => (
              <IdentifierChip
                key={`${identifier.uuid}-${identifier.value}`}
                label={
                  getCoreIdentifier(identifier.kind)?.displayName ??
                  identifier.name
                }
                value={identifier.value}
                href={renderIdentifierUrl(
                  identifier,
                  identifier.value,
                  siblingValues,
                )}
                copyLabel={t.plain("identifiers.copyValue")}
                copiedLabel={t.plain("identifiers.copied")}
              />
            ))}

            {canEdit && identifiers.length > 0 && (
              <TooltipButton
                variant="ghost"
                size="icon-sm"
                tooltip={t.plain("identifiers.edit")}
                aria-label={t.plain("identifiers.edit")}
                className={cn(
                  "text-muted-foreground/60 hover:text-foreground h-auto w-6 self-stretch opacity-0 transition-opacity",
                  "group-hover/identifiers:opacity-100",
                  isEditing && "opacity-100",
                )}
                onClick={() => {
                  setEditingIdentifiers(true)
                }}
              >
                <icon.Edit className="size-3 stroke-[1.5]" />
              </TooltipButton>
            )}
          </div>
        )}
      </div>

      {editingIdentifiers && (
        <EditIdentifiersDialog
          book={book}
          format={format}
          formatLabel={FORMAT_LABELS[format]}
          open
          onOpenChange={(next) => {
            if (!next) setEditingIdentifiers(false)
          }}
        />
      )}

      {isTauri && filepath && (
        <TooltipButton
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground mt-0.5 shrink-0"
          tooltip="Show in file manager"
          aria-label={`Show ${format} file in file manager`}
          onClick={() => {
            void revealItemInDir(filepath)
          }}
        >
          <icon.ExternalLink className="h-3.5 w-3.5" />
        </TooltipButton>
      )}
    </div>
  )
}

function filtersForFormat(format: Format) {
  return format === "audiobook" ? AUDIO_FILTERS : EBOOK_FILTERS
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

export function FileSection({
  book,
  assetsDir,
  className,
}: {
  book: BookWithRelations
  assetsDir?: string
  className?: string
}) {
  const canEdit = usePermission("bookUpdate")
  const isTauri = useIsTauri()
  const t = useTranslation("BookDetailsPage")
  const [removeAsset, { isLoading: isRemoving }] = useRemoveBookAssetMutation()
  const [replaceAsset] = useReplaceBookAssetMutation()

  const FORMAT_LABELS: Record<Format, string> = {
    ebook: t("fileInformation.ebook"),
    audiobook: t("fileInformation.audiobook"),
    readaloud: t("fileInformation.readaloud"),
  }

  const [fileDialog, setFileDialog] = useState<{
    format: Format
    mode: "server" | "upload"
  } | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Format | null>(null)
  const [editingAssetDir, setEditingAssetDir] = useState(false)

  const allFormats = ["readaloud", "ebook", "audiobook"] as const
  const presentFormats = allFormats.filter((f) => book[f])
  const missingFormats = (["ebook", "audiobook", "readaloud"] as const).filter(
    (f) => !book[f],
  )
  const canRemove = presentFormats.length > 1

  async function handleConfirmRemove() {
    if (!removeTarget) return
    await removeAsset({ uuid: book.uuid, format: removeTarget }).unwrap()
    setRemoveTarget(null)
  }

  async function handleTauriReplace(format: Format) {
    const currentPath = book[format]?.filepath ?? siblingDir(book, format)
    const isDirectory = format === "audiobook"

    const result = await openTauriFileDialog({
      directory: isDirectory,
      defaultPath: currentPath || undefined,
      filters: isDirectory ? undefined : filtersForFormat(format),
    })

    if (!result) return

    const path = Array.isArray(result) ? result[0] : result
    if (!path) return

    let finalPath = path
    if (format === "audiobook" && !isDirectory) {
      finalPath = path.replace(/(\/|\\)[^/\\]*?$/, "$1")
    }

    await replaceAsset({
      uuid: book.uuid,
      format,
      path: finalPath,
      importMode: "reference",
      metadataFieldOverrides: defaultMetadataFieldOverrides("merge"),
    }).unwrap()
  }

  const assetFolder =
    assetsDir && book.assetDir ? `${assetsDir}/${book.assetDir}` : book.assetDir

  const { isEditing } = useBookForm()

  return (
    <CollapsibleSection
      sectionKey="files"
      title={t("fileInformation.title")}
      className={className}
      rightElement={
        canEdit &&
        missingFormats.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <TooltipButton
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground font-thin"
                  onClick={(e) => {
                    e.stopPropagation()
                  }}
                  aria-label={t("fileInformation.addFile")}
                  tooltip={t("fileInformation.addFile")}
                >
                  <icon.Plus className="size-3.5 stroke-[1.5]" />
                </TooltipButton>
              }
            />
            <DropdownMenuContent align="end" className="w-fit">
              {missingFormats.map((f, i) => {
                const FormatIcon = FORMAT_ICONS[f]

                if (isTauri) {
                  return (
                    <DropdownMenuItem
                      key={f}
                      onClick={() => {
                        void handleTauriReplace(f)
                      }}
                    >
                      <FormatIcon className="mr-2 h-4 w-4" />
                      {FORMAT_LABELS[f]}
                    </DropdownMenuItem>
                  )
                }

                return (
                  <DropdownMenuGroup key={f}>
                    {i > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="flex items-center gap-1.5">
                      <FormatIcon className="h-3 w-3" />
                      {FORMAT_LABELS[f]}
                    </DropdownMenuLabel>

                    <DropdownMenuItem
                      onClick={() => {
                        setFileDialog({ format: f, mode: "server" })
                      }}
                    >
                      <icon.Server className="mr-2 h-4 w-4" />
                      {t("fileInformation.importFromServer")}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => {
                        setFileDialog({ format: f, mode: "upload" })
                      }}
                    >
                      <icon.Upload className="mr-2 h-4 w-4" />
                      {t("fileInformation.upload")}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    >
      <div className="space-y-3">
        {presentFormats.map((format) => (
          <FormatFileRow
            key={format}
            book={book}
            format={format}
            canRemove={canRemove}
            isTauri={isTauri}
            onReplace={() => {
              void handleTauriReplace(format)
            }}
            onReplaceServer={() => {
              setFileDialog({ format, mode: "server" })
            }}
            onReplaceUpload={() => {
              setFileDialog({ format, mode: "upload" })
            }}
            onRemove={() => {
              setRemoveTarget(format)
            }}
          />
        ))}

        {canEdit && assetFolder && (
          <div className="group/asset-folder flex flex-col gap-0.5 text-xs">
            <div className="flex items-center justify-between gap-1">
              <span className="text-muted-foreground font-sans text-xs">
                {t("fileInformation.assetFolder")}
              </span>

              <div className="flex items-center gap-1">
                <TooltipButton
                  variant="ghost"
                  tooltip={t.plain("fileInformation.editAssetFolder")}
                  aria-label={t.plain("fileInformation.editAssetFolder")}
                  onClick={() => {
                    setEditingAssetDir(true)
                  }}
                  className={cn(
                    "opacity-0 transition-opacity group-hover/asset-folder:opacity-100",
                    "text-muted-foreground -my-1 h-5 w-5",
                    isEditing && "opacity-100",
                  )}
                >
                  <icon.Edit className="h-3 w-3" />
                </TooltipButton>

                {isTauri && (
                  <TooltipButton
                    variant="ghost"
                    tooltip="Show asset folder in file manager"
                    aria-label="Show asset folder in file manager"
                    className={cn(
                      "opacity-0 transition-opacity group-hover/asset-folder:opacity-100",
                      "text-muted-foreground -my-1 h-5 w-5",
                      isEditing && "opacity-100",
                    )}
                    onClick={() => {
                      void revealItemInDir(assetFolder)
                    }}
                  >
                    <icon.ExternalLink className="h-3 w-3" />
                  </TooltipButton>
                )}
              </div>
            </div>

            <code className={cn("break-all")}>{assetFolder}</code>
          </div>
        )}
      </div>

      {fileDialog?.mode === "server" && (
        <ReplaceFileDialog
          book={book}
          format={fileDialog.format}
          assetsDir={assetsDir}
          open
          onOpenChange={(next) => {
            if (!next) setFileDialog(null)
          }}
        />
      )}

      {fileDialog?.mode === "upload" && (
        <UploadFileDialog
          book={book}
          format={fileDialog.format}
          open
          onOpenChange={(next) => {
            if (!next) setFileDialog(null)
          }}
        />
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(next) => {
          if (!next) setRemoveTarget(null)
        }}
        title={`Remove ${removeTarget ? FORMAT_LABELS[removeTarget] : ""} from book`}
        description={
          removeTarget === "readaloud"
            ? "The readaloud file will be deleted from disk."
            : "Library-owned files will be deleted. Files in your watch folders are left on disk."
        }
        onConfirm={() => void handleConfirmRemove()}
        isLoading={isRemoving}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="destructive"
      />

      {editingAssetDir && (
        <EditAssetDirDialog
          book={book}
          open
          onOpenChange={(next) => {
            if (!next) setEditingAssetDir(false)
          }}
        />
      )}
    </CollapsibleSection>
  )
}
