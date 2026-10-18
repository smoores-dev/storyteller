import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { useState } from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@v3/_/components/ui/tooltip"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type BookWithRelations } from "@/database/books"
import { formatTime } from "@/formatTime"
import { readerPlayer } from "@/services/AudioPlayerService"
import {
  playerPositionSeeked,
  playerTrackChanged,
  userRequestedTextNavigation,
} from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { selectPlaybackRate } from "@/store/slices/audioPlayerSlice"
import { type ReadingPreferences } from "@/store/slices/preferencesSlice"

import {
  type ProgressMark,
  useFormattedProgress,
} from "./hooks/useFormattedProgress"

const TRACK_CLASS = "bg-reader-border/60 absolute inset-x-0 top-0 h-1"
const FILL_CLASS = "bg-reader-accent absolute inset-y-0 left-0"

const SeekSlider = ({
  value,
  max,
  onCommit,
}: {
  value: number
  max: number
  onCommit: (value: number) => void
}) => {
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? value
  const t = useTranslation("Reader.progress")

  return (
    <SliderPrimitive.Root
      value={shown}
      min={0}
      max={Math.max(max, 1)}
      step={1}
      thumbAlignment="edge"
      onValueChange={(next) => {
        setDraft(next)
      }}
      onValueCommitted={(next) => {
        setDraft(null)
        onCommit(next)
      }}
      className="group relative block h-3 w-full"
    >
      <SliderPrimitive.Control className="relative h-3 w-full cursor-pointer touch-none select-none">
        <SliderPrimitive.Track className={TRACK_CLASS}>
          <SliderPrimitive.Indicator
            className={cn(
              FILL_CLASS,
              draft === null && "transition-[width] duration-200 ease-linear",
            )}
          />
          <Tooltip>
            <TooltipTrigger
              delay={0}
              closeDelay={0}
              render={
                <SliderPrimitive.Thumb
                  aria-label={t.plain("playbackPosition")}
                  className="bg-reader-accent border-reader-bg focus-visible:ring-reader-accent/40 block size-3 rounded-full border-2 opacity-0 shadow-sm transition-opacity outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 data-dragging:opacity-100"
                />
              }
            />
            <TooltipContent side="top" className="tabular-nums">
              {formatTime(shown)}
            </TooltipContent>
          </Tooltip>
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

const MarkTrack = ({
  marks,
  value,
  max,
  onSelect,
  format,
}: {
  marks: ProgressMark[]
  value: number
  max: number
  onSelect: (mark: ProgressMark) => void
  format: (value: number) => string | null
}) => {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const segments = marks
    .map((mark, idx) => ({
      mark,
      idx,
      start: idx === 0 ? 0 : mark.position,
      end: marks[idx + 1]?.position ?? max,
    }))
    .filter(
      (segment) =>
        max > 0 && ((segment.end - segment.start) / max) * 100 >= 0.5,
    )

  return (
    <div className="group relative h-3 w-full">
      <div className={TRACK_CLASS}>
        <div
          className={cn(FILL_CLASS, "transition-[width] duration-300 ease-out")}
          style={{ width: `${percent}%` }}
        />
      </div>
      {segments.map((segment) => {
        const label = format(segment.mark.position)
        return (
          <Tooltip key={segment.idx}>
            <TooltipTrigger
              delay={0}
              closeDelay={0}
              render={
                <button
                  type="button"
                  aria-label={segment.mark.title}
                  onClick={() => {
                    onSelect(segment.mark)
                  }}
                  className="before:bg-reader-accent-hover after:bg-reader-bg focus-visible:ring-reader-accent/40 absolute top-0 h-3 cursor-pointer outline-none before:absolute before:-top-0.5 before:right-0.5 before:left-0 before:h-2 before:opacity-0 before:transition-opacity before:content-[''] after:absolute after:top-0 after:right-0 after:h-1 after:w-0.5 after:content-[''] last:after:hidden hover:before:opacity-100 focus-visible:ring-2 focus-visible:before:opacity-100"
                  style={{
                    left: `${(segment.start / max) * 100}%`,
                    width: `${((segment.end - segment.start) / max) * 100}%`,
                  }}
                />
              }
            />
            <TooltipContent side="top" className="flex flex-col gap-0.5">
              <span className="font-medium">{segment.mark.title}</span>
              {label && (
                <span className="text-background/70 text-[10px] tabular-nums">
                  {label}
                </span>
              )}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

export const ProgressBar = ({
  book,
  detailView,
}: {
  book: BookWithRelations
  detailView: ReadingPreferences["detailView"]
  targetDocument?: Document
}) => {
  const { total, marks, progress, ready } = useFormattedProgress({ book })
  const playbackSpeed = useAppSelector(selectPlaybackRate)
  const dispatch = useAppDispatch()
  const t = useTranslation("Reader.progress")

  const restrictToMarks =
    detailView.scope === "book" || detailView.mode === "text"

  if (!ready) {
    return (
      <div className="relative h-3 w-full">
        <div className={TRACK_CLASS} />
      </div>
    )
  }

  if (restrictToMarks) {
    return (
      <MarkTrack
        marks={marks ?? []}
        value={progress}
        max={total}
        format={(value) => {
          if (detailView.mode === "audio") return formatTime(value)
          if (detailView.scope === "chapter") return null
          return t.plain("page", { page: value })
        }}
        onSelect={(mark) => {
          if (detailView.mode === "text") {
            if (!mark.locator) return
            readerPlayer().pause()
            dispatch(userRequestedTextNavigation({ locator: mark.locator }))
            return
          }
          const index = marks?.indexOf(mark) ?? -1
          if (index < 0) return
          dispatch(playerTrackChanged({ index, start: 0 }))
        }}
      />
    )
  }

  return (
    <SeekSlider
      value={progress}
      max={total}
      onCommit={(value) => {
        dispatch(playerPositionSeeked({ progress: value * playbackSpeed }))
      }}
    />
  )
}
