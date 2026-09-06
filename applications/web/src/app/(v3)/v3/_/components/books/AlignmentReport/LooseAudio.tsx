"use client"

import { useMemo, useState } from "react"

import { PlayButton, formatClock } from "@v3/_/components/audio"
import { Badge } from "@v3/_/components/ui/badge"
import { Button } from "@v3/_/components/ui/button"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type ReportAudioChunk } from "@/alignmentReportView"
import * as icon from "@/icons"
import { type UUID } from "@/uuid"

import { TONE_BADGE, fileClip, hrefStem } from "./shared"
import { type AudioFile } from "./useAudioFiles"
import { type OverrideEditor } from "./useOverrideEditor"

const SHORT_SECONDS = 5

type LooseRow = {
  file: AudioFile
  chunk: ReportAudioChunk
  before: string | null
  after: string | null
}

function looseRows(files: AudioFile[]): LooseRow[] {
  const flat = files.flatMap((file) =>
    file.chunks.map((chunk) => ({ file, chunk })),
  )
  const rows: LooseRow[] = []
  for (const [index, entry] of flat.entries()) {
    if (entry.chunk.placed) continue
    let before: string | null = null
    let after: string | null = null
    for (let at = index - 1; at >= 0; at--) {
      const label = flat[at]?.chunk.label
      if (label) {
        before = label
        break
      }
    }
    for (let at = index + 1; at < flat.length; at++) {
      const label = flat[at]?.chunk.label
      if (label) {
        after = label
        break
      }
    }
    rows.push({ ...entry, before, after })
  }
  return rows.sort((a, b) => b.chunk.duration - a.chunk.duration)
}

export function LooseAudio({
  bookUuid,
  files,
  editor,
  narrow,
}: {
  bookUuid: UUID
  files: AudioFile[]
  editor: OverrideEditor
  narrow: boolean
}) {
  const t = useTranslation("AlignmentReport")
  const [showShort, setShowShort] = useState(false)
  const rows = useMemo(() => looseRows(files), [files])

  if (rows.length === 0) return null

  const totalSeconds = rows.reduce((sum, row) => sum + row.chunk.duration, 0)
  const long = rows.filter((row) => row.chunk.duration >= SHORT_SECONDS)
  const shortCount = rows.length - long.length
  const visible = showShort ? rows : long

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <h2 className="font-heading text-sm font-medium">{t("loose.title")}</h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {t("loose.count", {
            count: rows.length,
            duration: formatClock(totalSeconds),
          })}
        </span>
        {shortCount > 0 && (
          <Button
            variant="link"
            size="xs"
            className="text-muted-foreground ml-auto h-auto px-0"
            onClick={() => {
              setShowShort((value) => !value)
            }}
          >
            {showShort
              ? t("loose.hideShort", {
                  count: shortCount,
                  seconds: SHORT_SECONDS,
                })
              : t("loose.showShort", {
                  count: shortCount,
                  seconds: SHORT_SECONDS,
                })}
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-3 text-xs">
          {t("loose.onlyShort", { seconds: SHORT_SECONDS })}
        </p>
      ) : (
        <div className="divide-border divide-y overflow-hidden rounded-lg border">
          {visible.map(({ file, chunk, before, after }) => {
            const hint = chunk.label
              ? t("loose.fromExcluded", { label: chunk.label })
              : before && after
                ? t("loose.between", { before, after })
                : after
                  ? t("loose.beforeFirst", { label: after })
                  : before
                    ? t("loose.afterLast", { label: before })
                    : null
            return (
              <div
                key={`${file.name}-${chunk.start}`}
                className={cn(
                  "flex items-center gap-2 px-2 py-1 text-xs",
                  file.excluded && "text-muted-foreground",
                )}
              >
                {file.present ? (
                  <PlayButton
                    clip={fileClip(bookUuid, file.name, {
                      start: chunk.start,
                      end: chunk.end,
                      label: hint,
                    })}
                  />
                ) : (
                  <span className="size-7 shrink-0" />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "shrink-0 tabular-nums",
                        file.excluded && "line-through",
                      )}
                    >
                      {hrefStem(file.name)}
                    </span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {formatClock(chunk.start)} → {formatClock(chunk.end)}
                    </span>
                  </span>
                  {!narrow && (
                    <span className="text-muted-foreground truncate text-[10px]">
                      {file.present ? hint : t("loose.notOnDisk")}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
                  {formatClock(chunk.duration)}
                </span>
                {file.excluded && (
                  <Badge
                    className={cn("h-4 px-1.5 text-[10px]", TONE_BADGE.muted)}
                  >
                    {t("judgment.excluded")}
                  </Badge>
                )}
                <TooltipButton
                  variant="ghost"
                  size="icon-xs"
                  aria-label={
                    file.excluded
                      ? t("actions.includeFile")
                      : t("actions.excludeFile")
                  }
                  tooltip={
                    file.excluded
                      ? t("actions.includeFile")
                      : t("actions.excludeFile")
                  }
                  onClick={() => {
                    editor({ audio: { [file.name]: !file.excluded } })
                  }}
                >
                  {file.excluded ? <icon.Volume /> : <icon.VolumeOff />}
                </TooltipButton>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
