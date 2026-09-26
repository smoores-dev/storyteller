"use client"

import { parseAsString, useQueryState } from "nuqs"
import { type MouseEvent, type ReactNode, useCallback, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@v3/_/components/ui/badge"
import { Button } from "@v3/_/components/ui/button"
import {
  ConfirmDialog,
  useConfirmAction,
} from "@v3/_/components/ui/confirm-dialog"
import { Input } from "@v3/_/components/ui/input"
import { Label } from "@v3/_/components/ui/label"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { cn } from "@/cn"
import { type RewritePreview } from "@/database/pathRewrite"
import { usePermissions } from "@/hooks/usePermissions"
import * as icon from "@/icons"
import { type OrphanFolder } from "@/maintenance"
import {
  useAcknowledgePathsMutation,
  useApplyPathRewriteMutation,
  useCancelScanMutation,
  useClearBooksCacheMutation,
  useClearImageCacheMutation,
  useClearStaleUploadsMutation,
  useDeleteAllLogsMutation,
  useDeleteOrphanFoldersMutation,
  useDeleteUnusedImagesMutation,
  useGetBooksCacheUsageQuery,
  useGetMaintenanceStorageQuery,
  useGetOrphansQuery,
  useGetPathsStatusQuery,
  useGetScanStateQuery,
  usePreviewPathRewriteMutation,
  useTriggerScanMutation,
} from "@/store/api"
import { formatBytes } from "@/strings"

import { SettingsCard, SettingsLink, SettingsSection } from "./shared"

function LibraryScanSection() {
  const t = useTranslation("SettingsPage.tabs.maintenance.sections.scan")
  const { data: scanState } = useGetScanStateQuery(undefined, {
    pollingInterval: 5_000,
  })
  const [triggerScan, { isLoading: isTriggering }] = useTriggerScanMutation()
  const [cancelScan, { isLoading: isCancelling }] = useCancelScanMutation()

  return (
    <SettingsSection id="libraryScan">
      <SettingsCard title={t("title")} description={t("description")}>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={scanState?.running || isTriggering}
            onClick={() => {
              void triggerScan({ force: true })
            }}
          >
            {t("scanLibrary")}
          </Button>

          {scanState?.running && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isCancelling}
              onClick={() => {
                void cancelScan()
              }}
            >
              {t("cancelScan")}
            </Button>
          )}
        </div>

        {scanState?.running && (
          <p className="text-muted-foreground text-sm">
            {t("scanRunning", { source: scanState.source ?? "unknown" })}
          </p>
        )}

        <SettingsLink section="scanning">{t("scheduleLink")}</SettingsLink>
      </SettingsCard>
    </SettingsSection>
  )
}

function StorageItem({
  title,
  description,
  summary,
  bytes,
  actionLabel,
  actionDisabled,
  onAction,
  children,
}: {
  title: string
  description?: string
  summary?: string
  bytes: number | undefined
  actionLabel: string
  actionDisabled: boolean
  onAction: (event: MouseEvent) => void
  children?: ReactNode
}) {
  return (
    <div className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">{title}</p>
          {description && (
            <p className="text-muted-foreground text-xs">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="text-sm tabular-nums">
              {bytes === undefined ? "…" : formatBytes(bytes)}
            </p>
            {summary && (
              <p className="text-muted-foreground text-xs">{summary}</p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={actionDisabled}
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        </div>
      </div>
      {children}
    </div>
  )
}

function useDestructiveAction({
  title,
  description,
  confirmLabel,
  error,
  run,
}: {
  title: string
  description: string
  confirmLabel: string
  error: string
  run: () => Promise<string>
}) {
  return useConfirmAction({
    title,
    description,
    confirmLabel,
    variant: "destructive",
    onConfirm: async () => {
      try {
        toast.success(await run())
      } catch {
        toast.error(error)
      }
    },
  })
}

const PROCESSING_PARTS = [
  { key: "transcodedAudio", className: "bg-primary" },
  { key: "transcriptions", className: "bg-primary/60" },
  { key: "emissions", className: "bg-primary/30" },
] as const

function ProcessingCacheItem() {
  const t = useTranslation(
    "SettingsPage.tabs.maintenance.sections.caches.processing",
  )
  const { data: usage } = useGetBooksCacheUsageQuery(
    {},
    { refetchOnMountOrArgChange: true },
  )
  const [clearBooksCache] = useClearBooksCacheMutation()

  const action = useDestructiveAction({
    title: t("confirmTitle"),
    description: t("confirmDescription", {
      size: formatBytes(usage?.bytes ?? 0),
    }),
    confirmLabel: t("confirm"),
    error: t("error"),
    run: async () => {
      await clearBooksCache({}).unwrap()
      return t("success")
    },
  })

  return (
    <StorageItem
      title={t("title")}
      description={t("description")}
      summary={t("books", { count: usage?.bookCount ?? 0 })}
      bytes={usage?.bytes}
      actionLabel={t("clear")}
      actionDisabled={!usage?.bytes}
      onAction={action.confirm}
    >
      {usage && usage.bytes > 0 && (
        <div className="space-y-2">
          <div className="bg-muted flex h-1.5 overflow-hidden rounded-full">
            {PROCESSING_PARTS.map(({ key, className }) => (
              <div
                key={key}
                className={className}
                style={{ width: `${(usage.parts[key] / usage.bytes) * 100}%` }}
              />
            ))}
          </div>
          <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {PROCESSING_PARTS.map(({ key, className }) => (
              <li key={key} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", className)} />
                {t(key)}
                <span className="text-foreground tabular-nums">
                  {formatBytes(usage.parts[key])}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <SettingsLink section="readaloud">{t("autoCleanLink")}</SettingsLink>
      <ConfirmDialog {...action.dialogProps} />
    </StorageItem>
  )
}

function ImageCacheItem() {
  const t = useTranslation(
    "SettingsPage.tabs.maintenance.sections.caches.images",
  )
  const { data: storage } = useGetMaintenanceStorageQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })
  const [clearImageCache] = useClearImageCacheMutation()
  const usage = storage?.imageCache

  const action = useDestructiveAction({
    title: t("confirmTitle"),
    description: t("confirmDescription", {
      size: formatBytes(usage?.bytes ?? 0),
    }),
    confirmLabel: t("confirm"),
    error: t("error"),
    run: async () => {
      await clearImageCache().unwrap()
      return t("success")
    },
  })

  return (
    <StorageItem
      title={t("title")}
      description={t("description")}
      summary={t("files", { count: usage?.count ?? 0 })}
      bytes={usage?.bytes}
      actionLabel={t("clear")}
      actionDisabled={!usage?.bytes}
      onAction={action.confirm}
    >
      <ConfirmDialog {...action.dialogProps} />
    </StorageItem>
  )
}

function StaleUploadsItem() {
  const t = useTranslation(
    "SettingsPage.tabs.maintenance.sections.caches.uploads",
  )
  const { data: storage } = useGetMaintenanceStorageQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })
  const [clearStaleUploads] = useClearStaleUploadsMutation()
  const usage = storage?.uploads

  const action = useDestructiveAction({
    title: t("confirmTitle"),
    description: t("confirmDescription", {
      size: formatBytes(usage?.bytes ?? 0),
    }),
    confirmLabel: t("confirm"),
    error: t("error"),
    run: async () => {
      await clearStaleUploads().unwrap()
      return t("success")
    },
  })

  return (
    <StorageItem
      title={t("title")}
      description={t("description")}
      summary={t("files", { count: usage?.count ?? 0 })}
      bytes={usage?.bytes}
      actionLabel={t("clear")}
      actionDisabled={!usage?.count}
      onAction={action.confirm}
    >
      <ConfirmDialog {...action.dialogProps} />
    </StorageItem>
  )
}

function CachesSection() {
  const t = useTranslation("SettingsPage.tabs.maintenance.sections.caches")
  const permissions = usePermissions()

  return (
    <SettingsSection id="caches">
      <SettingsCard
        title={t("title")}
        description={t("description")}
        contentClassName="divide-border space-y-0 divide-y"
      >
        {permissions?.bookProcess && <ProcessingCacheItem />}
        <ImageCacheItem />
        <StaleUploadsItem />
      </SettingsCard>
    </SettingsSection>
  )
}

function OrphanFoldersItem() {
  const t = useTranslation(
    "SettingsPage.tabs.maintenance.sections.leftovers.folders",
  )
  const { data: orphans } = useGetOrphansQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })
  const [deleteOrphanFolders] = useDeleteOrphanFoldersMutation()
  const [showFolders, setShowFolders] = useState(false)
  const [pending, setPending] = useState<OrphanFolder | null>(null)

  const folders = orphans?.folders ?? []
  const leftovers = folders.filter((folder) => !folder.hasBookFiles)
  const sumBytes = (list: OrphanFolder[]) =>
    list.reduce((total, folder) => total + folder.bytes, 0)

  const runDelete = useCallback(
    async (names: string[]) => {
      const { deleted } = await deleteOrphanFolders({ names }).unwrap()
      return t("success", { count: deleted })
    },
    [deleteOrphanFolders, t],
  )

  const deleteAll = useDestructiveAction({
    title: t("confirmAllTitle"),
    description: t("confirmAllDescription", {
      count: leftovers.length,
      size: formatBytes(sumBytes(leftovers)),
    }),
    confirmLabel: t("confirm"),
    error: t("error"),
    run: () => runDelete(leftovers.map((folder) => folder.name)),
  })

  const deleteOne = useDestructiveAction({
    title: t("confirmOneTitle"),
    description: t(
      pending?.hasBookFiles
        ? "confirmOneBookFilesDescription"
        : "confirmOneDescription",
      {
        name: pending?.name ?? "",
        size: formatBytes(pending?.bytes ?? 0),
      },
    ),
    confirmLabel: t("confirm"),
    error: t("error"),
    run: () => runDelete(pending ? [pending.name] : []),
  })

  return (
    <StorageItem
      title={t("title")}
      description={t("description")}
      summary={t("summary", { count: folders.length })}
      bytes={orphans ? sumBytes(folders) : undefined}
      actionLabel={t("deleteAll")}
      actionDisabled={leftovers.length === 0}
      onAction={() => {
        deleteAll.confirm()
      }}
    >
      {folders.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            onClick={() => {
              setShowFolders((open) => !open)
            }}
          >
            <icon.ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                showFolders && "rotate-90",
              )}
            />
            {showFolders ? t("hide") : t("show")}
          </button>

          {showFolders && (
            <ul className="divide-border max-h-80 divide-y overflow-y-auto rounded-md border">
              {folders
                .toSorted((a, b) => b.bytes - a.bytes)
                .map((folder) => (
                  <li
                    key={folder.name}
                    className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{folder.name}</span>
                      {folder.hasBookFiles && (
                        <Badge variant="secondary" className="shrink-0">
                          {t("bookFiles")}
                        </Badge>
                      )}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {folder.bytes === 0
                          ? t("empty")
                          : formatBytes(folder.bytes)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("deleteOne", { name: folder.name })}
                        onClick={() => {
                          setPending(folder)
                          deleteOne.confirm()
                        }}
                      >
                        <icon.Trash aria-hidden />
                      </Button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      <ConfirmDialog {...deleteAll.dialogProps} />
      <ConfirmDialog {...deleteOne.dialogProps} />
    </StorageItem>
  )
}

function UnusedImagesItem() {
  const t = useTranslation(
    "SettingsPage.tabs.maintenance.sections.leftovers.images",
  )
  const { data: orphans } = useGetOrphansQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })
  const [deleteUnusedImages] = useDeleteUnusedImagesMutation()
  const usage = orphans?.images

  const action = useDestructiveAction({
    title: t("confirmTitle"),
    description: t("confirmDescription", {
      size: formatBytes(usage?.bytes ?? 0),
    }),
    confirmLabel: t("confirm"),
    error: t("error"),
    run: async () => {
      const { deleted } = await deleteUnusedImages().unwrap()
      return t("success", { count: deleted })
    },
  })

  return (
    <StorageItem
      title={t("title")}
      description={t("description")}
      summary={t("summary", { count: usage?.count ?? 0 })}
      bytes={usage?.bytes}
      actionLabel={t("delete")}
      actionDisabled={!usage?.count}
      onAction={action.confirm}
    >
      <ConfirmDialog {...action.dialogProps} />
    </StorageItem>
  )
}

function LeftoversSection() {
  const t = useTranslation("SettingsPage.tabs.maintenance.sections.leftovers")

  return (
    <SettingsSection id="leftovers">
      <SettingsCard
        title={t("title")}
        description={t("description")}
        contentClassName="divide-border space-y-0 divide-y"
      >
        <OrphanFoldersItem />
        <UnusedImagesItem />
      </SettingsCard>
    </SettingsSection>
  )
}

function LogsSection() {
  const t = useTranslation("SettingsPage.tabs.maintenance.sections.logs")
  const { data: storage } = useGetMaintenanceStorageQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })
  const [deleteAllLogs] = useDeleteAllLogsMutation()
  const usage = storage?.logs

  const action = useDestructiveAction({
    title: t("confirmTitle"),
    description: t("confirmDescription", {
      size: formatBytes(usage?.bytes ?? 0),
    }),
    confirmLabel: t("confirm"),
    error: t("error"),
    run: async () => {
      await deleteAllLogs().unwrap()
      return t("success")
    },
  })

  return (
    <SettingsSection id="logFiles">
      <SettingsCard title={t("title")} description={t("description")}>
        <StorageItem
          title={t("summary", { count: usage?.count ?? 0 })}
          bytes={usage?.bytes}
          actionLabel={t("delete")}
          actionDisabled={!usage?.count}
          onAction={action.confirm}
        >
          <SettingsLink tab="logs">{t("viewLink")}</SettingsLink>
          <ConfirmDialog {...action.dialogProps} />
        </StorageItem>
      </SettingsCard>
    </SettingsSection>
  )
}

function PathRewriteSection() {
  const t = useTranslation("SettingsPage.tabs.maintenance.sections.pathRewrite")
  const { data: pathsStatus } = useGetPathsStatusQuery()
  const [fromParam] = useQueryState("from", parseAsString)
  const [toParam] = useQueryState("to", parseAsString)

  const [from, setFrom] = useState(fromParam ?? "")
  const [to, setTo] = useState(toParam ?? "")
  const [preview, setPreview] = useState<RewritePreview | null>(null)

  const [previewRewrite, { isLoading: isPreviewing }] =
    usePreviewPathRewriteMutation()
  const [applyRewrite, { isLoading: isApplying }] =
    useApplyPathRewriteMutation()
  const [acknowledgePaths] = useAcknowledgePathsMutation()

  const anchorMismatch =
    pathsStatus?.anchor != null &&
    pathsStatus.anchor !== pathsStatus.currentDataDir

  const handlePreview = useCallback(async () => {
    const result = await previewRewrite({ from, to })
    if ("error" in result) {
      toast.error(t("previewFailed"))
      return
    }
    setPreview(result.data.preview)
  }, [previewRewrite, from, to, t])

  const applyConfirm = useConfirmAction({
    onConfirm: async () => {
      const result = await applyRewrite({ from, to })
      if ("error" in result) {
        toast.error(t("applyFailed"))
        return
      }
      toast.success(
        t("applySucceeded", { count: result.data.result.totalUpdated }),
      )
      setPreview(null)
    },
    title: t("applyRewrite"),
    description: t("applyRewriteConfirm"),
    confirmLabel: t("applyRewrite"),
    variant: "destructive",
  })

  return (
    <SettingsSection id="pathRewrite">
      <SettingsCard title={t("title")} description={t("description")}>
        {anchorMismatch && (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p>
              {t("anchorMismatch", {
                anchor: pathsStatus.anchor ?? "",
                current: pathsStatus.currentDataDir,
              })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFrom(pathsStatus.anchor ?? "")
                  setTo(pathsStatus.currentDataDir)
                  setPreview(null)
                }}
              >
                {t("prefillFromAnchor")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void acknowledgePaths()}
              >
                {t("dismissAnchor")}
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rewriteFrom">{t("rewriteFrom")}</Label>
            <Input
              id="rewriteFrom"
              placeholder="/old/data/dir"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                setPreview(null)
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rewriteTo">{t("rewriteTo")}</Label>
            <Input
              id="rewriteTo"
              placeholder="/new/data/dir"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                setPreview(null)
              }}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!from || !to || from === to || isPreviewing}
            onClick={() => void handlePreview()}
          >
            {isPreviewing ? t("previewing") : t("previewRewrite")}
          </Button>
          {preview && preview.totalMatches > 0 && (
            <Button
              variant="destructive"
              size="sm"
              disabled={isApplying}
              onClick={(event) => {
                applyConfirm.confirm(event)
              }}
            >
              {isApplying
                ? t("applying")
                : t("applyRewriteCount", { count: preview.totalMatches })}
            </Button>
          )}
        </div>

        {preview && (
          <div className="space-y-3">
            {preview.totalMatches === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noMatches")}</p>
            ) : (
              preview.columns
                .filter((col) => col.matchCount > 0)
                .map((col) => (
                  <div
                    key={`${col.table}.${col.column}`}
                    className="space-y-2 rounded-md border p-3 text-sm"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-medium">
                        {col.table}.{col.column}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {t("matchSummary", {
                          count: col.matchCount,
                          existing: col.existingCount,
                          checked: col.checkedCount,
                        })}
                      </span>
                    </div>
                    <ul className="space-y-1 font-mono text-xs">
                      {col.samples.map((sample) => (
                        <li key={sample.before} className="truncate">
                          <span className="text-muted-foreground line-through">
                            {sample.before}
                          </span>{" "}
                          →{" "}
                          <span
                            className={
                              sample.targetExists
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                            }
                          >
                            {sample.after}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
            )}
          </div>
        )}
        <ConfirmDialog {...applyConfirm.dialogProps} />
      </SettingsCard>
    </SettingsSection>
  )
}

export function MaintenanceTab() {
  return (
    <div className="space-y-6">
      <LibraryScanSection />
      <CachesSection />
      <LeftoversSection />
      <LogsSection />
      <PathRewriteSection />
    </div>
  )
}
