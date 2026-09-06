"use client"

import { useRef } from "react"

import { PlayerDock } from "@v3/_/components/audio"
import { Button } from "@v3/_/components/ui/button"
import { ScrollArea } from "@v3/_/components/ui/scroll-area"
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type BookAlignmentReportView } from "@/alignmentReportView"
import * as icon from "@/icons"
import { useGetBookAlignmentReportQuery } from "@/store/api"
import type { UUID } from "@/uuid"

import { ChapterDetail } from "./ChapterDetail"
import { LooseAudio } from "./LooseAudio"
import { Masthead } from "./Masthead"
import { Reel } from "./Reel"
import { SpineList } from "./SpineList"
import { useAudioFiles } from "./useAudioFiles"
import { useNarrow } from "./useNarrow"
import { useOverrideEditor } from "./useOverrideEditor"
import { useReportSelection } from "./useReportSelection"

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
  const { data, isLoading, isError } = useGetBookAlignmentReportQuery({ uuid })
  const t = useTranslation("AlignmentReport")
  const root = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(root)

  return (
    <div
      ref={root}
      className="relative flex h-[100cqh] min-h-0 flex-col overflow-hidden"
    >
      <ReportHeader
        view={data}
        compact={compact}
        embedded={embedded}
        onClose={onClose}
        onBack={onBack}
      />

      {isLoading && (
        <p className="text-muted-foreground p-4 text-sm">{t("loading")}</p>
      )}
      {isError && (
        <p className="text-muted-foreground p-4 text-sm">{t("notAvailable")}</p>
      )}

      {data && <ReportBody view={data} narrow={narrow} />}

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
}: {
  view: BookAlignmentReportView | undefined
  compact: boolean
  embedded: boolean
  onClose?: () => void
  onBack?: () => void
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
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t("title")}
          </span>
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
      </div>
      {onClose && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={t("close")}
          onClick={onClose}
        >
          <icon.Close />
        </Button>
      )}
    </header>
  )
}

function ReportBody({
  view,
  narrow,
}: {
  view: BookAlignmentReportView
  narrow: boolean
}) {
  const audio = useAudioFiles(view.bookUuid, view.audioFiles)
  const selection = useReportSelection()
  const editor = useOverrideEditor(view)

  const openItem =
    view.items.find((item) => item.href === selection.openHref) ??
    (narrow ? null : view.items.find((item) => item.kind === "chapter") ?? null)

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
        selection={selection}
        editor={editor}
      />
      <LooseAudio
        bookUuid={view.bookUuid}
        files={audio.files}
        editor={editor}
        narrow={narrow}
      />
    </div>
  )

  const top = (
    <>
      <Masthead view={view} narrow={narrow} />
      <Reel
        bookUuid={view.bookUuid}
        files={audio.files}
        totalSeconds={audio.totalSeconds}
        items={view.items}
        selectedHref={openItem?.href ?? null}
        onSelect={selection.setOpenHref}
        narrow={narrow}
      />
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
          <div className="p-4 pl-0">{detail}</div>
        </ScrollArea>
      </div>
    </div>
  )
}
