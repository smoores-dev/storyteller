"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { SearchInput } from "@v3/_/components/books/SearchInput"
import { Button } from "@v3/_/components/ui/button"
import {
  ConfirmDialog,
  useConfirmAction,
} from "@v3/_/components/ui/confirm-dialog"
import { Input } from "@v3/_/components/ui/input"
import { Label } from "@v3/_/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTheme } from "@v3/_/hooks/use-theme"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import {
  DEFAULT_LOG_RETENTION_DAYS,
  type Settings,
} from "@/database/settingsTypes"
import * as icon from "@/icons"
import {
  useClearLogsMutation,
  useGetLogLevelQuery,
  useGetLogsQuery,
  useGetSettingsQuery,
  useSetLogLevelMutation,
  useUpdateSettingsMutation,
} from "@/store/api"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  type LogDisplayPrefs,
  selectLogDisplayPrefs,
  uiSettingsSlice,
} from "@/store/slices/uiSettingsSlice"

type LogEntry = {
  level: number
  time: number
  msg?: string
  [key: string]: unknown
}

type PaneTheme = "light" | "dark"

const LEVEL_NAMES: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
}

const LEVEL_TEXT: Record<PaneTheme, Record<number, string>> = {
  dark: {
    10: "text-zinc-500",
    20: "text-sky-400",
    30: "text-zinc-300",
    40: "text-amber-400",
    50: "text-red-400",
    60: "text-red-400 font-bold",
  },
  light: {
    10: "text-zinc-400",
    20: "text-sky-700",
    30: "text-zinc-600",
    40: "text-amber-700",
    50: "text-red-700",
    60: "text-red-800 font-bold",
  },
}

const LEVEL_BG: Record<PaneTheme, Record<number, string>> = {
  dark: {
    40: "bg-amber-400/5",
    50: "bg-red-400/8",
    60: "bg-red-500/12",
  },
  light: {
    40: "bg-amber-500/8",
    50: "bg-red-500/8",
    60: "bg-red-600/12",
  },
}

function formatTimestamp(epoch: number): string {
  return new Date(epoch).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: "UTC",
    dateStyle: "medium",
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

function formatLogMessage(entry: LogEntry): string {
  const parts: string[] = []

  if (typeof entry["ctx"] === "string") {
    parts.push(`[${entry["ctx"]}]`)
  } else if (typeof entry["src"] === "string" && entry["src"] !== "launcher") {
    parts.push(`[${entry["src"]}]`)
  }

  if (entry.msg) {
    parts.push(entry.msg)
  }

  const err = entry["err"]
  if (err && typeof err === "object") {
    const { message, stack } = err as { message?: string; stack?: string }

    if (entry.level >= 50 && stack) {
      parts.push(`\n${stack}`)
    } else if (message) {
      parts.push(`- ${message}`)
    }
  }

  return parts.join(" ") || JSON.stringify(entry)
}

function formatLogLine(entry: LogEntry): string {
  const level = LEVEL_NAMES[entry.level] ?? `LVL${entry.level}`
  return `${new Date(entry.time).toISOString()} ${level.padEnd(5)} ${formatLogMessage(entry)}`
}

function isLogEntry(value: unknown): value is LogEntry {
  if (!value || typeof value !== "object") return false

  const obj = value as Record<string, unknown>
  return typeof obj["level"] === "number" && typeof obj["time"] === "number"
}

const POLL_INTERVAL = 3000

const LINE_COUNT_OPTIONS = [100, 250, 500, 1000, 2500, 5000]

export function LogsTab() {
  const t = useTranslation("SettingsPage.tabs.logs")
  const dispatch = useAppDispatch()
  const prefs = useAppSelector(selectLogDisplayPrefs)
  const { resolvedTheme } = useTheme()

  const paneTheme: PaneTheme =
    prefs.theme ?? (resolvedTheme === "dark" ? "dark" : "light")

  const [search, setSearch] = useState("")
  const [date, setDate] = useState<string | null>(null)

  const updatePrefs = useCallback(
    (patch: Partial<LogDisplayPrefs>) => {
      dispatch(uiSettingsSlice.actions.setLogDisplayPrefs(patch))
    },
    [dispatch],
  )

  const { data, isLoading, refetch } = useGetLogsQuery(
    {
      lines: prefs.lineCount,
      search: search || undefined,
      level: prefs.levelFilter === "all" ? undefined : prefs.levelFilter,
      date: date ?? undefined,
    },
    { pollingInterval: prefs.followMode && date === null ? POLL_INTERVAL : 0 },
  )

  const isToday = data === undefined || data.date === data.today
  const selectedDate = date ?? data?.today ?? null

  const { data: logLevelData } = useGetLogLevelQuery()
  const [setLogLevel] = useSetLogLevelMutation()
  const [clearLogs] = useClearLogsMutation()

  const { data: settings } = useGetSettingsQuery()
  const [updateSettings, { isLoading: isSavingRetention }] =
    useUpdateSettingsMutation()
  const [retentionDraft, setRetentionDraft] = useState<number | undefined>(
    undefined,
  )
  const savedRetention =
    settings?.logRetentionDays ?? DEFAULT_LOG_RETENTION_DAYS
  const retention = retentionDraft ?? savedRetention
  const retentionDirty =
    settings !== undefined &&
    retentionDraft !== undefined &&
    retentionDraft !== savedRetention

  const handleSaveRetention = useCallback(async () => {
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
    const result = await updateSettings({
      logRetentionDays: retention,
    } as Partial<Settings> as Settings)

    if ("error" in result) {
      toast.error(t("retentionSaveFailed"))
    } else {
      toast.success(t("retentionSaved"))
      setRetentionDraft(undefined)
      void refetch()
    }
  }, [updateSettings, retention, t, refetch])

  const currentLevel = logLevelData?.level ?? "info"
  const isDebug = currentLevel === "debug" || currentLevel === "trace"

  const handleClearLogs = useCallback(async () => {
    await clearLogs()
    toast.success(t("logsCleared"))
    void refetch()
  }, [clearLogs, refetch, t])

  const clearConfirm = useConfirmAction({
    onConfirm: handleClearLogs,
    title: t("clearLogs"),
    description: t("clearLogsConfirm"),
    confirmLabel: t("clearLogs"),
    variant: "destructive",
  })

  const handleToggleDebug = useCallback(async () => {
    const newLevel = isDebug ? "info" : "debug"
    await setLogLevel({ level: newLevel })
  }, [isDebug, setLogLevel])

  const lines = (data?.lines ?? []).filter(isLogEntry)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(lines.map(formatLogLine).join("\n"))
      toast.success(t("copied", { count: lines.length }))
    } catch {
      toast.error(t("copyFailed"))
    }
  }, [lines, t])

  const scrollRef = useRef<HTMLDivElement>(null)
  const wasFollowingRef = useRef(prefs.followMode)

  useEffect(() => {
    wasFollowingRef.current = prefs.followMode
  }, [prefs.followMode])

  useEffect(() => {
    if (!prefs.followMode || !scrollRef.current) return

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [data, prefs.followMode])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 40

    if (!atBottom && prefs.followMode) {
      updatePrefs({ followMode: false })
    } else if (atBottom && wasFollowingRef.current && !prefs.followMode) {
      updatePrefs({ followMode: true })
    }
  }, [prefs.followMode, updatePrefs])

  const handleScrollToBottom = useCallback(() => {
    if (!scrollRef.current) return

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    updatePrefs({ followMode: true })
    wasFollowingRef.current = true
  }, [updatePrefs])

  const hasMountedRef = useRef(false)
  // scroll to bottom when the component mounts
  useEffect(() => {
    if (!scrollRef.current || hasMountedRef.current) return

    if (!isLoading && lines.length > 0) {
      handleScrollToBottom()
    }
    hasMountedRef.current = true
  }, [handleScrollToBottom, isLoading, lines.length])

  const availableDates = data?.availableDates ?? []
  const today = data?.today

  return (
    <div className="flex h-full flex-col gap-3">
      <LogsToolbar
        search={search}
        onSearchChange={setSearch}
        selectedDate={selectedDate}
        today={today}
        availableDates={availableDates}
        onDateChange={(value) => {
          setDate(value === today ? null : value)
        }}
        levelFilter={prefs.levelFilter}
        onLevelFilterChange={(v) => {
          updatePrefs({ levelFilter: v })
        }}
        lineCount={prefs.lineCount}
        onLineCountChange={(v) => {
          updatePrefs({ lineCount: v })
        }}
        wrapLines={prefs.wrapLines}
        onWrapLinesToggle={() => {
          updatePrefs({ wrapLines: !prefs.wrapLines })
        }}
        highlighting={prefs.highlighting}
        onHighlightingToggle={() => {
          updatePrefs({ highlighting: !prefs.highlighting })
        }}
        hideTime={prefs.hideTime}
        onHideTimeToggle={() => {
          updatePrefs({ hideTime: !prefs.hideTime })
        }}
        paneTheme={paneTheme}
        onPaneThemeToggle={() => {
          updatePrefs({ theme: paneTheme === "dark" ? "light" : "dark" })
        }}
        isDebug={isDebug}
        onToggleDebug={handleToggleDebug}
        followMode={prefs.followMode}
        onScrollToBottom={handleScrollToBottom}
        onCopy={handleCopy}
        canCopy={lines.length > 0}
        canClear={isToday}
        onClearLogs={clearConfirm.confirm}
        t={t}
      />

      <div
        className={cn(
          "border-border relative min-h-0 flex-1 rounded-lg border",
          paneTheme,
        )}
        style={{ colorScheme: paneTheme }}
      >
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={cn(
            "bg-card text-foreground h-full overflow-auto rounded-lg font-mono text-[13px] leading-relaxed",
            prefs.wrapLines
              ? "break-all whitespace-pre-wrap"
              : "whitespace-pre",
          )}
        >
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <icon.LoaderIOSish className="text-muted-foreground size-5 animate-spin" />
            </div>
          )}

          {!isLoading && lines.length === 0 && (
            <div className="text-muted-foreground py-12 text-center">
              {t("noLogs")}
            </div>
          )}

          {!isLoading && lines.length > 0 && (
            <div className="p-3">
              {lines.map((entry, i) => (
                <LogLine
                  key={`${entry.time}-${i}`}
                  entry={entry}
                  highlighting={prefs.highlighting}
                  hideTime={prefs.hideTime}
                  paneTheme={paneTheme}
                />
              ))}
            </div>
          )}
        </div>

        {!prefs.followMode && isToday && (
          <button
            type="button"
            onClick={handleScrollToBottom}
            className="bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground absolute right-4 bottom-4 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs shadow-lg transition-colors"
          >
            <icon.ArrowDown className="size-3.5" />
            {t("scrollToBottom")}
          </button>
        )}
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span>
          {t("diskUsage", { size: formatBytes(data?.totalBytes ?? 0) })}
        </span>
        <span aria-hidden>·</span>
        <Label htmlFor="logRetentionDays" className="font-normal">
          {t("retention")}
        </Label>
        <Input
          id="logRetentionDays"
          type="number"
          min={1}
          className="h-8 w-20"
          value={retention}
          onChange={(e) => {
            const value = Number(e.target.value)
            if (value > 0) setRetentionDraft(value)
          }}
        />
        <span>{t("days")}</span>
        {retentionDirty && (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSaveRetention}
            disabled={isSavingRetention}
          >
            {t("save")}
          </Button>
        )}
        <span className="text-xs">{t("retentionDescription")}</span>
      </div>

      <ConfirmDialog {...clearConfirm.dialogProps} />
    </div>
  )
}

function LogLine({
  entry,
  highlighting,
  hideTime,
  paneTheme,
}: {
  entry: LogEntry
  highlighting: boolean
  hideTime: boolean
  paneTheme: PaneTheme
}) {
  const levelName = LEVEL_NAMES[entry.level] ?? `LVL${entry.level}`
  const colorClass = highlighting
    ? (LEVEL_TEXT[paneTheme][entry.level] ?? "text-foreground")
    : "text-foreground"
  const bgClass = highlighting ? (LEVEL_BG[paneTheme][entry.level] ?? "") : ""

  return (
    <div
      className={cn(
        "border-border/40 hover:bg-muted/60 border-b px-1 py-px font-mono",
        bgClass,
      )}
    >
      {!hideTime && (
        <span className="text-muted-foreground select-none">
          {formatTimestamp(entry.time)}
        </span>
      )}

      <span className={cn("mx-2 inline-block w-12 text-right", colorClass)}>
        {levelName}
      </span>

      <span className="text-foreground">{formatLogMessage(entry)}</span>
    </div>
  )
}

function LogsToolbar({
  search,
  onSearchChange,
  selectedDate,
  today,
  availableDates,
  onDateChange,
  levelFilter,
  onLevelFilterChange,
  lineCount,
  onLineCountChange,
  wrapLines,
  onWrapLinesToggle,
  highlighting,
  onHighlightingToggle,
  hideTime,
  onHideTimeToggle,
  paneTheme,
  onPaneThemeToggle,
  isDebug,
  onToggleDebug,
  followMode,
  onScrollToBottom,
  onCopy,
  canCopy,
  canClear,
  onClearLogs,
  t,
}: {
  search: string
  onSearchChange: (v: string) => void
  selectedDate: string | null
  today: string | undefined
  availableDates: string[]
  onDateChange: (v: string) => void
  levelFilter: string
  onLevelFilterChange: (v: string) => void
  lineCount: number
  onLineCountChange: (v: number) => void
  wrapLines: boolean
  onWrapLinesToggle: () => void
  highlighting: boolean
  onHighlightingToggle: () => void
  hideTime: boolean
  onHideTimeToggle: () => void
  paneTheme: PaneTheme
  onPaneThemeToggle: () => void
  isDebug: boolean
  onToggleDebug: () => void
  followMode: boolean
  onScrollToBottom: () => void
  onCopy: () => void
  canCopy: boolean
  canClear: boolean
  onClearLogs: () => void
  t: ReturnType<typeof useTranslation<"SettingsPage.tabs.logs">>
}) {
  const levelItems = [
    { value: "all", label: t("allLevels") },
    { value: "trace", label: "Trace" },
    { value: "debug", label: "Debug" },
    { value: "info", label: "Info" },
    { value: "warn", label: "Warn" },
    { value: "error", label: "Error" },
  ]

  const lineCountItems = LINE_COUNT_OPTIONS.map((n) => ({
    value: String(n),
    label: t("lineCount", { count: n }),
  }))

  const dateValues = today
    ? [today, ...availableDates.filter((d) => d !== today)]
    : availableDates
  const dateItems = dateValues.map((d) => ({
    value: d,
    label: d === today ? t("today") : formatDate(d),
  }))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-40 flex-1">
        <SearchInput
          type="text"
          placeholder={t("searchLogs")}
          value={search}
          onChange={(value) => {
            onSearchChange(value)
          }}
        />
      </div>

      {selectedDate && dateItems.length > 0 && (
        <Select
          value={selectedDate}
          onValueChange={(v) => {
            onDateChange(v as string)
          }}
          items={dateItems}
        >
          <SelectTrigger
            className="h-8! w-36 text-sm"
            aria-label={t("selectDate")}
          >
            <icon.Calendar className="text-muted-foreground h-3.5 w-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dateItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={levelFilter}
        onValueChange={(v) => {
          onLevelFilterChange(v as string)
        }}
        items={levelItems}
      >
        <SelectTrigger className="h-8! w-28 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {levelItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={String(lineCount)}
        onValueChange={(v) => {
          onLineCountChange(Number(v))
        }}
        items={lineCountItems}
      >
        <SelectTrigger className="h-8! w-28 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {lineCountItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <TooltipButton
          variant={wrapLines ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={t("wrapLines")}
          onClick={onWrapLinesToggle}
          tooltip={t("wrapLines")}
        >
          <icon.TextWrap className="h-4 w-4" />
        </TooltipButton>

        <TooltipButton
          variant={highlighting ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={onHighlightingToggle}
          aria-label={t("highlighting")}
          tooltip={t("highlighting")}
        >
          <icon.Highlight className="h-4 w-4" />
        </TooltipButton>

        <TooltipButton
          variant={hideTime ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={hideTime ? t("showTime") : t("hideTime")}
          onClick={onHideTimeToggle}
          tooltip={hideTime ? t("showTime") : t("hideTime")}
        >
          <icon.Clock className="h-4 w-4" />
        </TooltipButton>

        <TooltipButton
          variant="ghost"
          size="icon-sm"
          aria-label={paneTheme === "dark" ? t("lightPane") : t("darkPane")}
          onClick={onPaneThemeToggle}
          tooltip={paneTheme === "dark" ? t("lightPane") : t("darkPane")}
        >
          {paneTheme === "dark" ? (
            <icon.Sun className="h-4 w-4" />
          ) : (
            <icon.Moon className="h-4 w-4" />
          )}
        </TooltipButton>
      </div>

      <div className="flex items-center gap-1">
        <TooltipButton
          variant={isDebug ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={isDebug ? t("disableDebug") : t("enableDebug")}
          onClick={onToggleDebug}
          tooltip={isDebug ? t("disableDebug") : t("enableDebug")}
        >
          <icon.Bug className="h-4 w-4" />
        </TooltipButton>

        <TooltipButton
          variant={followMode ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={onScrollToBottom}
          aria-label={t("scrollToBottom")}
          tooltip={t("follow")}
        >
          <icon.ArrowDown className="h-4 w-4" />
        </TooltipButton>
      </div>

      <div className="flex items-center gap-1">
        <TooltipButton
          variant="ghost"
          size="icon-sm"
          onClick={onCopy}
          disabled={!canCopy}
          aria-label={t("copyLogs")}
          tooltip={t("copyLogs")}
        >
          <icon.Copy className="h-4 w-4" />
        </TooltipButton>

        <TooltipButton
          variant="ghost"
          size="icon-sm"
          disabled={!selectedDate}
          aria-label={t("downloadLogs")}
          tooltip={t("downloadLogs")}
          render={
            <a
              href={`/api/v2/logs/download?date=${selectedDate ?? ""}`}
              download
            />
          }
        >
          <icon.Download className="h-4 w-4" />
        </TooltipButton>

        <TooltipButton
          variant="ghost"
          size="icon-sm"
          onClick={onClearLogs}
          disabled={!canClear}
          aria-label={t("clearLogs")}
          tooltip={t("clearLogs")}
        >
          <icon.Trash className="h-4 w-4" />
        </TooltipButton>
      </div>
    </div>
  )
}
