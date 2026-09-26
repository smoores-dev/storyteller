"use client"

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
import { type Settings } from "@/database/settingsTypes"
import * as icon from "@/icons"
import {
  useCreateBackupMutation,
  useDeleteBackupMutation,
  useGetBackupsQuery,
  useGetSettingsQuery,
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
    cronDraft !== undefined
      ? cronDraft
      : (settings?.backupCronExpression ?? null)
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
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
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

export function BackupsTab() {
  return (
    <div className="space-y-6">
      <BackupsSection />
      <ScheduleSection />
    </div>
  )
}
