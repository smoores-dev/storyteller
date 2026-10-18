"use client"

import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { type ComponentType, useMemo, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@v3/_/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"

import { EditAssetDirDialog } from "@/app/(v3)/v3/_/components/books/BookDetails/EditAssetDirDialog"
import { EditIdentifiersDialog } from "@/app/(v3)/v3/_/components/books/BookDetails/EditIdentifiersDialog"
import { ReplaceFileDialog } from "@/app/(v3)/v3/_/components/books/BookDetails/ReplaceFileDialog"
import { ShowOpfDialog } from "@/app/(v3)/v3/_/components/books/BookDetails/ShowOpfDialog"
import { UploadFileDialog } from "@/app/(v3)/v3/_/components/books/BookDetails/UploadFileDialog"
import { useSendToKindle } from "@/app/(v3)/v3/_/components/books/SendToKindle"
import {
  canShareFiles,
  shareBookFile,
} from "@/app/(v3)/v3/_/components/books/bookSharing"
import { openTauriFileDialog } from "@/app/(v3)/v3/_/components/files/ServerFileBrowser"
import { ConfirmDialog } from "@/app/(v3)/v3/_/components/ui/confirm-dialog"
import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import { useIsTauri } from "@/app/(v3)/v3/_/hooks/use-is-tauri"
import {
  useCommon,
  useTranslation,
} from "@/app/(v3)/v3/_/hooks/use-translation"
import { type BookWithRelations } from "@/database/books"
import {
  getCoreIdentifier,
  renderIdentifierUrl,
} from "@/database/identifierKinds"
import { type IdentifierKind } from "@/database/identifiers"
import { defaultMetadataFieldOverrides } from "@/database/settingsTypes"
import { formatTimeHuman } from "@/formatTime"
import { usePermission } from "@/hooks/usePermission"
import * as icon from "@/icons"
import { IconReadaloud } from "@/icons/IconReadaloud"
import {
  getDownloadUrl,
  useRemoveBookAssetMutation,
  useReplaceBookAssetMutation,
} from "@/store/api"
import { audioDialogExtensions, epubDialogExtensions } from "@/uploadFileTypes"
import { formatFileSize } from "@/utils/formatFileSize"

import { CollapsibleSection } from "./CollapsibleSection"

const EBOOK_FILTERS = [{ name: "Ebooks", extensions: epubDialogExtensions }]
const AUDIO_FILTERS = [
  { name: "Audio files", extensions: audioDialogExtensions },
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
  onSendToKindle,
}: {
  book: BookWithRelations
  format: Format
  canRemove: boolean
  isTauri: boolean
  onReplace: () => void
  onReplaceServer: () => void
  onReplaceUpload: () => void
  onRemove: () => void
  onSendToKindle: (modifiers?: { shiftKey?: boolean }) => void
}) {
  const fmt = book[format]

  const canEdit = usePermission("bookUpdate")
  const canDownload = usePermission("bookDownload")
  const t = useTranslation("BookDetailsPage")
  const tLabels = useTranslation("Labels")
  const tShare = useTranslation("Sharing")
  const c = useCommon()

  const [editingIdentifiers, setEditingIdentifiers] = useState(false)
  const [showingOpf, setShowingOpf] = useState(false)

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
  const available = !!filepath && !fmt.missing
  const canSendToKindle = canDownload && format === "ebook" && available
  const canReveal = isTauri && !!filepath
  const hasMenu = canEdit || canSendToKindle || canReveal

  const FORMAT_LABELS: Record<Format, string> = {
    ebook: t.plain("fileInformation.ebook"),
    audiobook: t.plain("fileInformation.audiobook"),
    readaloud: t.plain("fileInformation.readaloud"),
  }

  const pageCount =
    format !== "audiobook"
      ? (book.pageCount ?? ("pageCount" in fmt ? fmt.pageCount : null))
      : null
  const duration =
    format !== "ebook"
      ? (book.duration ?? ("duration" in fmt ? fmt.duration : null))
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

          {(hasMenu || (canDownload && available)) && (
            <div className="flex grow items-center justify-end gap-0.5">
              {canDownload && available && (
                <TooltipButton
                  variant="ghost"
                  size="icon-sm"
                  nativeButton={false}
                  tooltip={t.plain("downloads.download")}
                  className="text-muted-foreground font-thin"
                  aria-label={`Download ${FORMAT_LABELS[format]}`}
                  render={
                    <a href={getDownloadUrl(book.uuid, format)} download>
                      <icon.Download className="h-3.5 w-3.5 stroke-[1.5]" />
                    </a>
                  }
                />
              )}

              {hasMenu && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <TooltipButton
                        variant="ghost"
                        size="icon-sm"
                        tooltip={tShare.plain("moreActions")}
                        className="text-muted-foreground font-thin"
                        aria-label={`${tShare.plain("moreActions")} ${FORMAT_LABELS[format]}`}
                      >
                        <icon.Dots className="h-3.5 w-3.5 stroke-[1.5]" />
                      </TooltipButton>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-fit">
                    {canSendToKindle && (
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={(event) => {
                            onSendToKindle({ shiftKey: event.shiftKey })
                          }}
                          className="whitespace-nowrap"
                        >
                          <icon.Send className="mr-2 h-4 w-4" />
                          {tShare("sendToKindle")}
                        </DropdownMenuItem>
                        {canShareFiles() && (
                          <DropdownMenuItem
                            onClick={() => {
                              shareBookFile(
                                book,
                                tShare.plain("shareFile"),
                              ).catch(() => {
                                toast.error(tShare.plain("shareFailed"))
                              })
                            }}
                            className="whitespace-nowrap"
                          >
                            <icon.Share className="mr-2 h-4 w-4" />
                            {tShare("shareFile")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuGroup>
                    )}

                    {canSendToKindle && (canEdit || canReveal) && (
                      <DropdownMenuSeparator />
                    )}

                    {canEdit &&
                      (isTauri ? (
                        <DropdownMenuItem
                          onClick={onReplace}
                          className="whitespace-nowrap"
                        >
                          <icon.Replace className="mr-2 h-4 w-4" />
                          {c("actions.replace")}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="whitespace-nowrap">
                            <icon.Replace className="mr-2 h-4 w-4" />
                            {c("actions.replace")}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="w-fit">
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
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ))}

                    {canEdit && (
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingIdentifiers(true)
                        }}
                        className="whitespace-nowrap"
                      >
                        <icon.Edit className="mr-2 h-4 w-4" />
                        {identifiers.length > 0
                          ? t("identifiers.edit")
                          : t("identifiers.add")}
                      </DropdownMenuItem>
                    )}

                    {canReveal && (
                      <DropdownMenuItem
                        onClick={() => {
                          void revealItemInDir(filepath)
                        }}
                        className="whitespace-nowrap"
                      >
                        <icon.ExternalLink className="mr-2 h-4 w-4" />
                        Show in file manager
                      </DropdownMenuItem>
                    )}

                    {canEdit && format !== "audiobook" && available && (
                      <DropdownMenuItem
                        onClick={() => {
                          setShowingOpf(true)
                        }}
                        className="whitespace-nowrap"
                      >
                        <icon.Bug className="mr-2 h-4 w-4" />
                        Show OPF
                      </DropdownMenuItem>
                    )}

                    {canEdit && canRemove && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={onRemove}
                          className="whitespace-nowrap"
                        >
                          <icon.Trash className="mr-2 h-4 w-4" />
                          {c("actions.remove")}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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
        {identifiers.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-stretch gap-1">
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
          </div>
        )}
      </div>

      {showingOpf && format !== "audiobook" && (
        <ShowOpfDialog
          bookUuid={book.uuid}
          format={format}
          formatLabel={FORMAT_LABELS[format]}
          open
          onOpenChange={(next) => {
            if (!next) setShowingOpf(false)
          }}
        />
      )}

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
  const sendToKindle = useSendToKindle()

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
            onSendToKindle={(modifiers) => {
              sendToKindle.send([book], modifiers)
            }}
          />
        ))}

        {canEdit && assetFolder && (
          <div className="flex flex-col gap-0.5 text-xs">
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
                  className="text-muted-foreground -my-1 h-5 w-5"
                >
                  <icon.Edit className="h-3 w-3" />
                </TooltipButton>

                {isTauri && (
                  <TooltipButton
                    variant="ghost"
                    tooltip="Show asset folder in file manager"
                    aria-label="Show asset folder in file manager"
                    className="text-muted-foreground -my-1 h-5 w-5"
                    onClick={() => {
                      void revealItemInDir(assetFolder)
                    }}
                  >
                    <icon.ExternalLink className="h-3 w-3" />
                  </TooltipButton>
                )}
              </div>
            </div>

            <code className="break-all">{assetFolder}</code>
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
          defaultFormat={fileDialog.format}
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

      {sendToKindle.dialog}

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
