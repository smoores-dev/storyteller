"use client"

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"
import { toast } from "sonner"

import {
  ConfirmDialog,
  useConfirmAction,
} from "@v3/_/components/ui/confirm-dialog"
import { Input } from "@v3/_/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import {
  useClearLogsMutation,
  useGetLogLevelQuery,
  useGetLogsQuery,
  useSetLogLevelMutation,
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

const LEVEL_NAMES: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
}

const LEVEL_COLORS: Record<number, string> = {
  10: "text-zinc-500",
  20: "text-sky-400",
  30: "text-zinc-300",
  40: "text-amber-400",
  50: "text-red-400",
  60: "text-red-500 font-bold",
}

const LEVEL_BG: Record<number, string> = {
  40: "bg-amber-400/5",
  50: "bg-red-400/8",
  60: "bg-red-500/12",
}

function formatTimestamp(epoch: number): string {
  const d = new Date(epoch)

  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

function formatLogMessage(entry: LogEntry): string {
  const parts: string[] = []

  if (entry.msg) {
    parts.push(entry.msg)
  }

  if (entry["ctx"] && typeof entry["ctx"] === "string") {
    parts.unshift(`[${entry["ctx"]}]`)
  }

  const err = entry["err"]
  if (err && typeof err === "object" && "message" in err) {
    parts.push(`- ${(err as { message: string }).message}`)
  }

  return parts.join(" ") || JSON.stringify(entry)
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

  const [search, setSearch] = useState("")

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
    },
    { pollingInterval: prefs.followMode ? POLL_INTERVAL : 0 },
  )

  const { data: logLevelData } = useGetLogLevelQuery()
  const [setLogLevel] = useSetLogLevelMutation()
  const [clearLogs] = useClearLogsMutation()

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

  const lines = (data?.lines ?? []).filter(isLogEntry)

  const refectEvent = useEffectEvent(refetch)

  useEffect(() => {
    void refectEvent()
  }, [])

  return (
    <div className="flex h-full flex-col gap-3">
      <LogsToolbar
        search={search}
        onSearchChange={setSearch}
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
        isDebug={isDebug}
        onToggleDebug={handleToggleDebug}
        followMode={prefs.followMode}
        onScrollToBottom={handleScrollToBottom}
        onClearLogs={clearConfirm.confirm}
        t={t}
      />

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={cn(
            "h-full overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 font-mono text-[13px] leading-relaxed",
            prefs.wrapLines
              ? "break-all whitespace-pre-wrap"
              : "whitespace-pre",
          )}
        >
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <icon.LoaderIOSish className="size-5 animate-spin text-zinc-500" />
            </div>
          )}

          {!isLoading && lines.length === 0 && (
            <div className="py-12 text-center text-zinc-500">{t("noLogs")}</div>
          )}

          {!isLoading && lines.length > 0 && (
            <div className="p-3">
              {lines.map((entry, i) => (
                <LogLine
                  key={`${entry.time}-${i}`}
                  entry={entry}
                  highlighting={prefs.highlighting}
                  hideTime={prefs.hideTime}
                />
              ))}
            </div>
          )}
        </div>

        {!prefs.followMode && (
          <button
            type="button"
            onClick={handleScrollToBottom}
            className="absolute right-4 bottom-4 flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 shadow-lg transition-colors hover:bg-zinc-700"
          >
            <icon.ArrowDown className="size-3.5" />
            {t("scrollToBottom")}
          </button>
        )}
      </div>

      <ConfirmDialog {...clearConfirm.dialogProps} />
    </div>
  )
}

function LogLine({
  entry,
  highlighting,
  hideTime,
}: {
  entry: LogEntry
  highlighting: boolean
  hideTime: boolean
}) {
  const levelName = LEVEL_NAMES[entry.level] ?? `LVL${entry.level}`
  const colorClass = highlighting
    ? LEVEL_COLORS[entry.level] ?? "text-zinc-300"
    : "text-zinc-300"
  const bgClass = highlighting ? LEVEL_BG[entry.level] ?? "" : ""

  const timestamp = formatTimestamp(entry.time)
  const message = formatLogMessage(entry)

  return (
    <div
      className={cn(
        "border-b border-zinc-800/30 px-1 py-px font-mono hover:bg-zinc-900/50",
        bgClass,
      )}
    >
      {!hideTime && (
        <span className="text-zinc-600 select-none">{timestamp}</span>
      )}

      <span className={cn("mx-2 inline-block w-12 text-right", colorClass)}>
        {levelName}
      </span>

      <span className="text-zinc-300">{message}</span>
    </div>
  )
}

function LogsToolbar({
  search,
  onSearchChange,
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
  isDebug,
  onToggleDebug,
  followMode,
  onScrollToBottom,
  onClearLogs,
  t,
}: {
  search: string
  onSearchChange: (v: string) => void
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
  isDebug: boolean
  onToggleDebug: () => void
  followMode: boolean
  onScrollToBottom: () => void
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <icon.Search className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
        <Input
          type="text"
          placeholder={t("searchLogs")}
          value={search}
          onChange={(e) => {
            onSearchChange(e.target.value)
          }}
          className="h-8 pr-8 pl-8 text-sm"
        />

        {search && (
          <button
            type="button"
            onClick={() => {
              onSearchChange("")
            }}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
          >
            <icon.Close className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Select
        value={levelFilter}
        onValueChange={(v) => {
          onLevelFilterChange(v as string)
        }}
        items={levelItems}
      >
        <SelectTrigger className="h-8 w-28 text-sm">
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
        <SelectTrigger className="h-8 w-28 text-sm">
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

        <TooltipButton
          variant="ghost"
          size="icon-sm"
          onClick={onClearLogs}
          aria-label={t("clearLogs")}
          tooltip={t("clearLogs")}
        >
          <icon.Trash className="h-4 w-4" />
        </TooltipButton>
      </div>
    </div>
  )
}
