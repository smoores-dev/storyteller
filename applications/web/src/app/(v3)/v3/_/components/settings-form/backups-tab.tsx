"use client"

import { parseAsString, useQueryState } from "nuqs"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { Button } from "@v3/_/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import {
  ConfirmDialog,
  useConfirmAction,
} from "@v3/_/components/ui/confirm-dialog"
import { Input } from "@v3/_/components/ui/input"
import { Label } from "@v3/_/components/ui/label"
import { Switch } from "@v3/_/components/ui/switch"
import { useTranslation } from "@v3/_/hooks/use-translation"

import {
  cronExpressionToMinutes,
  minutesToCronExpression,
} from "@/assets/library/scanner/triggers/cron"
import { type RewritePreview } from "@/database/pathRewrite"
import { type Settings } from "@/database/settingsTypes"
import * as icon from "@/icons"
import {
  useAcknowledgePathsMutation,
  useApplyPathRewriteMutation,
  useCreateBackupMutation,
  useDeleteBackupMutation,
  useGetBackupsQuery,
  useGetPathsStatusQuery,
  useGetSettingsQuery,
  usePreviewPathRewriteMutation,
  useUpdateSettingsMutation,
} from "@/store/api"
import { formatFileSize } from "@/utils/formatFileSize"

const DEFAULT_RETENTION = 5

function BackupsSection() {
  const t = useTranslation("SettingsPage.tabs.backups")
  const { data } = useGetBackupsQuery(undefined, { pollingInterval: 30_000 })
  const [createBackup, { isLoading: isCreating }] = useCreateBackupMutation()
  const [deleteBackup] = useDeleteBackupMutation()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const deleteConfirm = useConfirmAction({
    onConfirm: async () => {
      if (!pendingDelete) return
      const result = await deleteBackup({ name: pendingDelete })
      if ("error" in result) {
        toast.error(t("deleteFailed"))
      }
      setPendingDelete(null)
    },
    title: t("deleteBackup"),
    description: t("deleteBackupConfirm"),
    confirmLabel: t("deleteBackup"),
    variant: "destructive",
  })

  const handleCreate = useCallback(async () => {
    const result = await createBackup()
    if ("error" in result) {
      toast.error(t("backupFailed"))
    } else {
      toast.success(t("backupCreated"))
    }
  }, [createBackup, t])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("databaseTitle")}</CardTitle>
        <CardDescription>{t("databaseDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href="/api/v2/backups/download" download />}
          >
            <icon.Download aria-hidden />
            {t("downloadDatabase")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isCreating}
            onClick={() => void handleCreate()}
          >
            <icon.Database aria-hidden />
            {isCreating ? t("backingUp") : t("backUpNow")}
          </Button>
        </div>

        {data?.backups.length ? (
          <ul className="divide-border divide-y rounded-md border">
            {data.backups.map((backup) => (
              <li
                key={backup.name}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs">
                    {backup.name}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {new Date(backup.createdAt).toLocaleString()} ·{" "}
                    {formatFileSize(backup.size)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("downloadBackup")}
                    render={
                      <a
                        href={`/api/v2/backups/${encodeURIComponent(backup.name)}`}
                        download
                      />
                    }
                  >
                    <icon.Download aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("deleteBackup")}
                    onClick={(event) => {
                      setPendingDelete(backup.name)
                      deleteConfirm.confirm(event)
                    }}
                  >
                    <icon.Trash aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{t("noBackups")}</p>
        )}
        <ConfirmDialog {...deleteConfirm.dialogProps} />
      </CardContent>
    </Card>
  )
}

function ScheduleSection() {
  const t = useTranslation("SettingsPage.tabs.backups")
  const { data: settings } = useGetSettingsQuery()
  const [updateSettings, { isLoading: isSaving }] = useUpdateSettingsMutation()

  const [cronDraft, setCronDraft] = useState<string | null | undefined>(
    undefined,
  )
  const [retentionDraft, setRetentionDraft] = useState<number | undefined>(
    undefined,
  )
  const [showCronInput, setShowCronInput] = useState(false)

  const cron =
    cronDraft !== undefined ? cronDraft : settings?.backupCronExpression ?? null
  const retention =
    retentionDraft ?? settings?.backupRetentionCount ?? DEFAULT_RETENTION
  const intervalMinutes = cron ? cronExpressionToMinutes(cron) : null

  const dirty =
    settings !== undefined &&
    ((cronDraft !== undefined &&
      cronDraft !== (settings.backupCronExpression ?? null)) ||
      (retentionDraft !== undefined &&
        retentionDraft !==
          (settings.backupRetentionCount ?? DEFAULT_RETENTION)))

  const handleSave = useCallback(async () => {
    const result = await updateSettings({
      backupCronExpression: cron,
      backupRetentionCount: retention,
    } as Partial<Settings> as Settings)
    if ("error" in result) {
      toast.error(t("scheduleSaveFailed"))
    } else {
      toast.success(t("scheduleSaved"))
      setCronDraft(undefined)
      setRetentionDraft(undefined)
    }
  }, [updateSettings, cron, retention, t])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("scheduleTitle")}</CardTitle>
        <CardDescription>{t("scheduleDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Switch
            id="enableScheduledBackups"
            checked={!!cron}
            disabled={!settings}
            onCheckedChange={(checked) => {
              setCronDraft(checked ? minutesToCronExpression(1440) : null)
            }}
          />
          <Label htmlFor="enableScheduledBackups">
            {t("enableScheduledBackups")}
          </Label>
        </div>

        {cron && (
          <div className="space-y-3">
            {!showCronInput ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="backupIntervalMinutes">
                    {t("backupInterval")}
                  </Label>
                  <Input
                    id="backupIntervalMinutes"
                    type="number"
                    min={1}
                    className="max-w-40"
                    value={intervalMinutes ?? ""}
                    onChange={(e) => {
                      const minutes = Number(e.target.value)
                      if (minutes > 0) {
                        setCronDraft(minutesToCronExpression(minutes))
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-xs underline"
                  onClick={() => {
                    setShowCronInput(true)
                  }}
                >
                  {t("showAdvancedCron")}
                </button>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="backupCronExpression">
                  {t("cronExpression")}
                </Label>
                <Input
                  id="backupCronExpression"
                  placeholder="0 4 * * *"
                  className="max-w-60"
                  value={cron}
                  onChange={(e) => {
                    setCronDraft(e.target.value || null)
                  }}
                />
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-xs underline"
                  onClick={() => {
                    setShowCronInput(false)
                  }}
                >
                  {t("hideAdvancedCron")}
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="backupRetentionCount">{t("retention")}</Label>
              <Input
                id="backupRetentionCount"
                type="number"
                min={1}
                className="max-w-40"
                value={retention}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  if (value > 0) setRetentionDraft(value)
                }}
              />
              <p className="text-muted-foreground text-xs">
                {t("retentionDescription")}
              </p>
            </div>
          </div>
        )}

        <Button
          size="sm"
          disabled={!dirty || isSaving}
          onClick={() => void handleSave()}
        >
          {isSaving ? t("saving") : t("saveSchedule")}
        </Button>
      </CardContent>
    </Card>
  )
}

function RewriteSection() {
  const t = useTranslation("SettingsPage.tabs.backups")
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
    <Card>
      <CardHeader>
        <CardTitle>{t("rewriteTitle")}</CardTitle>
        <CardDescription>{t("rewriteDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
  )
}

export function BackupsTab() {
  return (
    <div className="space-y-6">
      <BackupsSection />
      <ScheduleSection />
      <RewriteSection />
    </div>
  )
}
