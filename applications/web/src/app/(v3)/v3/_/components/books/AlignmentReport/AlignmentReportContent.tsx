"use client"

import { parseAsString, useQueryState } from "nuqs"
import { type ReactNode, useRef } from "react"

import { PlayerDock } from "@v3/_/components/audio"
import { Button } from "@v3/_/components/ui/button"
import { ScrollArea } from "@v3/_/components/ui/scroll-area"
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type BookAlignmentReportView } from "@/alignmentReportView"
import * as icon from "@/icons"
import { useGetBookAlignmentReportQuery } from "@/store/api"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  selectShowPreviousAlignmentReport,
  uiSettingsSlice,
} from "@/store/slices/uiSettingsSlice"
import type { UUID } from "@/uuid"

import { ChapterDetail } from "./ChapterDetail"
import { Legend } from "./Legend"
import { LooseAudio } from "./LooseAudio"
import { Masthead } from "./Masthead"
import { PreviousReport } from "./PreviousReport"
import { Reel } from "./Reel"
import { SpineList } from "./SpineList"
import { useDecisionEditor } from "./useDecisionEditor"
import { useNarrow } from "./useNarrow"
import { useReportSelection } from "./useReportSelection"
import { useTracks } from "./useTracks"

export function AlignmentReportContent({
  uuid,
  compact = false,
  onClose,
  onBack,
  embedded = false,
}: {
  uuid: UUID
  compact?: boolean
  onClose?: () => void
  onBack?: () => void
  embedded?: boolean
}) {
  const [reportUuid, setReportUuid] = useQueryState("reportUuid", parseAsString)
  const { data, isLoading, isError } = useGetBookAlignmentReportQuery({
    uuid,
    reportUuid: (reportUuid as UUID | null) ?? undefined,
  })
  const t = useTranslation("AlignmentReport")
  const root = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(root)
  const dispatch = useAppDispatch()
  const showPrevious = useAppSelector(selectShowPreviousAlignmentReport)
  const setShowPrevious = (value: boolean) => {
    dispatch(uiSettingsSlice.actions.setShowPreviousAlignmentReport(value))
  }
  const openReport = (next: UUID | null) => {
    void setReportUuid(next)
  }

  return (
    <div ref={root} className="relative flex h-[100cqh] min-h-0 flex-col">
      <ReportHeader
        view={data}
        compact={compact}
        embedded={embedded}
        onClose={onClose}
        onBack={onBack}
        showPrevious={showPrevious}
        onShowPrevious={() => {
          setShowPrevious(true)
        }}
        onOpenLatest={() => {
          openReport(null)
        }}
      />

      {isLoading && (
        <p className="text-muted-foreground p-4 text-sm">{t("loading")}</p>
      )}
      {isError && (
        <p className="text-muted-foreground p-4 text-sm">{t("notAvailable")}</p>
      )}

      {data && (
        <ReportBody
          view={data}
          narrow={narrow}
          previous={
            showPrevious && data.previous ? (
              <PreviousReport
                previous={data.previous}
                summary={data.summary}
                narrow={narrow}
                onOpen={openReport}
                onHide={() => {
                  setShowPrevious(false)
                }}
              />
            ) : null
          }
        />
      )}

      <PlayerDock className="shrink-0" />
    </div>
  )
}

function ReportHeader({
  view,
  compact,
  embedded,
  onClose,
  onBack,
  showPrevious,
  onShowPrevious,
  onOpenLatest,
}: {
  view: BookAlignmentReportView | undefined
  compact: boolean
  embedded: boolean
  onClose?: () => void
  onBack?: () => void
  showPrevious: boolean
  onShowPrevious: () => void
  onOpenLatest: () => void
}) {
  const t = useTranslation("AlignmentReport")

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {onBack && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            aria-label={t("back")}
            onClick={onBack}
          >
            <icon.ArrowLeft />
          </Button>
        )}
        {embedded ? (
          <span className="text-xs font-medium">{t("title")}</span>
        ) : (
          <h1
            className={cn(
              "font-heading truncate font-medium",
              compact ? "text-base" : "text-xl",
            )}
          >
            {view?.bookTitle ?? t("title")}
          </h1>
        )}
        {view && compact && (
          <V3Link
            href={`/books/${view.bookUuid}?report=true`}
            className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-[11px] hover:underline"
          >
            <icon.ExternalLink className="size-3" />
            {t("openFullPage")}
          </V3Link>
        )}
        {view && !view.latest && (
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="bg-muted text-muted-foreground rounded px-1.5 py-px text-[11px] font-medium">
              {t("previous.older")}
            </span>
            <button
              type="button"
              onClick={onOpenLatest}
              className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-[11px] hover:underline"
            >
              <icon.ArrowBack className="size-3" />
              {t("previous.latest")}
            </button>
          </span>
        )}
        {view && view.audioSource === "none" && (
          <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-[11px]">
            <icon.VolumeOff className="size-3" />
            {t("audio.none")}
          </span>
        )}
        {view && view.audioSource === "original" && !view.latest && (
          <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-[11px]">
            <icon.Volume className="size-3" />
            {t("audio.original")}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {view?.previous && !showPrevious && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("previous.show")}
            title={t("previous.show")}
            onClick={onShowPrevious}
          >
            <icon.History />
          </Button>
        )}
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("close")}
            onClick={onClose}
          >
            <icon.Close />
          </Button>
        )}
      </div>
    </header>
  )
}

function ReportBody({
  view,
  narrow,
  previous,
}: {
  view: BookAlignmentReportView
  narrow: boolean
  previous: ReactNode
}) {
  const audio = useTracks(view)
  const selection = useReportSelection()
  const editor = useDecisionEditor(view)

  const openItem =
    view.items.find((item) => item.href === selection.openHref) ??
    (narrow
      ? null
      : (view.items.find((item) => item.status === "aligned") ?? null))

  const openIndex = openItem
    ? view.items.findIndex((item) => item.href === openItem.href)
    : -1

  const step = (delta: number) => {
    const next = view.items[openIndex + delta]
    if (next) selection.setOpenHref(next.href)
  }

  const detail = (
    <ChapterDetail
      bookUuid={view.bookUuid}
      item={openItem}
      items={view.items}
      spans={view.spans}
      tracks={audio.tracks}
      editor={editor}
      onBack={
        narrow
          ? () => {
              selection.setOpenHref(null)
            }
          : undefined
      }
      onPrev={
        openIndex > 0
          ? () => {
              step(-1)
            }
          : undefined
      }
      onNext={
        openIndex >= 0 && openIndex < view.items.length - 1
          ? () => {
              step(1)
            }
          : undefined
      }
      narrow={narrow}
    />
  )

  const list = (
    <div className="flex min-w-0 flex-col gap-5">
      <SpineList
        bookUuid={view.bookUuid}
        items={view.items}
        spans={view.spans}
        tracks={audio.tracks}
        selection={selection}
        editor={editor}
      />
      <LooseAudio
        bookUuid={view.bookUuid}
        items={view.items}
        spans={view.spans}
        tracks={audio.tracks}
        editor={editor}
        narrow={narrow}
      />
    </div>
  )

  const top = (
    <>
      <div className="flex flex-wrap items-stretch gap-3">
        <Masthead view={view} narrow={narrow} />
        {previous}
      </div>
      <Reel
        bookUuid={view.bookUuid}
        tracks={audio.tracks}
        totalSeconds={audio.totalSeconds}
        items={view.items}
        spans={view.spans}
        selectedHref={openItem?.href ?? null}
        onSelect={selection.setOpenHref}
        narrow={narrow}
      />
      <Legend />
    </>
  )

  if (narrow) {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          {openItem ? detail : top}
          {!openItem && list}
        </div>
      </ScrollArea>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 px-4 pt-2 pb-3">{top}</div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,24rem)_minmax(0,1fr)] gap-4 border-t">
        <ScrollArea className="h-full min-h-0 border-r">
          <div className="p-4 pr-3">{list}</div>
        </ScrollArea>
        <ScrollArea className="h-full min-h-0">
          <div className="h-full p-4 pl-0">{detail}</div>
        </ScrollArea>
      </div>
    </div>
  )
}
