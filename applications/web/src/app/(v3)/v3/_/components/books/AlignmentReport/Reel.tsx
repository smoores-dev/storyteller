"use client"

import {
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { formatClock, usePlayer } from "@v3/_/components/audio"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type ReportSpineItem } from "@/alignmentReportView"
import * as icon from "@/icons"
import { type UUID } from "@/uuid"

import {
  type ReportTone,
  TONE_FILL,
  TONE_TEXT,
  fileClip,
  hrefStem,
  itemTone,
} from "./shared"
import { type AudioFile } from "./useAudioFiles"

const PX_PER_HOUR = 520
const ZOOM_STEP = 1.5
const ZOOM_MIN = 0.25
const ZOOM_MAX = 12
const ZOOM_KEY = "storyteller-alignment-reel-zoom"
const WINDOW_MIN_FRACTION = 0.02
const LABEL_MIN_PX = 48
const TICK_MIN_PX = 64
const TICK_STEPS = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200]
const SEGMENT_JOIN_SECONDS = 15

const STRIPES =
  "bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--color-muted-foreground)_3px_5px)] opacity-40"

type Segment = {
  href: string
  label: string
  start: number
  end: number
  tone: ReportTone
  placed: boolean
}

function buildSegments(
  files: AudioFile[],
  toneByHref: Map<string, ReportTone>,
): Segment[] {
  const segments: Segment[] = []
  for (const file of files) {
    for (const chunk of file.chunks) {
      if (!chunk.href) continue
      const start = file.offset + chunk.start
      const end = file.offset + chunk.end
      const last = segments.at(-1)
      if (
        last &&
        last.href === chunk.href &&
        start - last.end < SEGMENT_JOIN_SECONDS
      ) {
        last.end = end
        continue
      }
      segments.push({
        href: chunk.href,
        label: chunk.label ?? hrefStem(chunk.href),
        start,
        end,
        tone: toneByHref.get(chunk.href) ?? "muted",
        placed: chunk.placed,
      })
    }
  }
  return segments
}

function trackWidthFor(
  totalSeconds: number,
  zoom: number,
  viewportWidth: number,
): number {
  return Math.max(viewportWidth, (totalSeconds / 3600) * PX_PER_HOUR * zoom)
}

function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, ZOOM_MIN), ZOOM_MAX)
}

function readStoredZoom(): number {
  if (typeof window === "undefined") return 1
  try {
    const stored = Number(window.localStorage.getItem(ZOOM_KEY))
    return Number.isFinite(stored) && stored > 0 ? clampZoom(stored) : 1
  } catch {
    return 1
  }
}

function storeZoom(zoom: number) {
  try {
    window.localStorage.setItem(ZOOM_KEY, String(zoom))
  } catch {
    return
  }
}

type Drag =
  | { mode: "pan"; grip: number }
  | { mode: "resize"; edge: "left" | "right" }

function Minimap({
  files,
  totalSeconds,
  scrollLeft,
  viewportWidth,
  trackWidth,
  label,
  onPan,
  onResize,
}: {
  files: AudioFile[]
  totalSeconds: number
  scrollLeft: number
  viewportWidth: number
  trackWidth: number
  label: string
  onPan: (leftFraction: number) => void
  onResize: (edge: "left" | "right", fraction: number) => void
}) {
  const drag = useRef<Drag | null>(null)
  const windowLeft = scrollLeft / trackWidth
  const windowWidth = viewportWidth / trackWidth

  const fractionOf = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return null
    return Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
  }

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    const fraction = fractionOf(event)
    if (!current || fraction === null) return
    if (current.mode === "pan") onPan(fraction - current.grip)
    else onResize(current.edge, fraction)
  }

  return (
    <div
      title={label}
      className="group/minimap bg-muted relative h-3 w-full touch-none overflow-hidden rounded-sm select-none"
      onPointerDown={(event) => {
        event.preventDefault()
        const fraction = fractionOf(event)
        if (fraction === null) return
        const edge = (event.target as HTMLElement).dataset["edge"]
        if (edge === "left" || edge === "right") {
          drag.current = { mode: "resize", edge }
        } else if (
          fraction >= windowLeft &&
          fraction <= windowLeft + windowWidth
        ) {
          drag.current = { mode: "pan", grip: fraction - windowLeft }
        } else {
          drag.current = { mode: "pan", grip: windowWidth / 2 }
          onPan(fraction - windowWidth / 2)
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        move(event)
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
    >
      {files.map((file) => (
        <span
          key={file.name}
          className={cn(
            "absolute inset-y-0",
            file.excluded
              ? "bg-muted-foreground/20"
              : file.duration > 0 && file.placedSeconds / file.duration > 0.98
                ? "bg-good/60"
                : file.placedSeconds > 0
                  ? "bg-moderate/60"
                  : "bg-poor/40",
          )}
          style={{
            left: `${(file.offset / totalSeconds) * 100}%`,
            width: `${(file.duration / totalSeconds) * 100}%`,
          }}
        />
      ))}
      <span
        className="border-foreground/70 bg-foreground/10 absolute inset-y-0 cursor-grab rounded-sm border active:cursor-grabbing"
        style={{
          left: `${windowLeft * 100}%`,
          width: `${windowWidth * 100}%`,
        }}
      >
        <span
          data-edge="left"
          className="bg-foreground/60 absolute inset-y-0 -left-px w-1.5 cursor-ew-resize rounded-l-sm opacity-0 group-hover/minimap:opacity-100"
        />
        <span
          data-edge="right"
          className="bg-foreground/60 absolute inset-y-0 -right-px w-1.5 cursor-ew-resize rounded-r-sm opacity-0 group-hover/minimap:opacity-100"
        />
      </span>
    </div>
  )
}

export function Reel({
  bookUuid,
  files,
  totalSeconds,
  items,
  selectedHref,
  onSelect,
  narrow,
}: {
  bookUuid: UUID
  files: AudioFile[]
  totalSeconds: number
  items: ReportSpineItem[]
  selectedHref: string | null
  onSelect: (href: string) => void
  narrow: boolean
}) {
  const t = useTranslation("AlignmentReport")
  const { play, clip, currentTime } = usePlayer()
  const scroller = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [zoom, setZoom] = useState(readStoredZoom)

  useEffect(() => {
    storeZoom(zoom)
  }, [zoom])

  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width !== undefined) setViewportWidth(width)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [])

  const toneByHref = useMemo(
    () => new Map(items.map((item) => [item.href, itemTone(item)])),
    [items],
  )
  const segments = useMemo(
    () => buildSegments(files, toneByHref),
    [files, toneByHref],
  )

  const trackWidth = trackWidthFor(totalSeconds, zoom, viewportWidth)
  const pxPerSecond = totalSeconds > 0 ? trackWidth / totalSeconds : 0

  const tickStep =
    TICK_STEPS.find((step) => step * pxPerSecond >= TICK_MIN_PX) ??
    TICK_STEPS[TICK_STEPS.length - 1] ??
    3600
  const ticks: number[] = []
  for (let at = 0; at < totalSeconds; at += tickStep) ticks.push(at)

  const geometry = useRef({ segments, pxPerSecond, viewportWidth })
  geometry.current = { segments, pxPerSecond, viewportWidth }

  const applyZoom = (
    resolve: (current: number) => number,
    scrollAfter: (nextTrackWidth: number) => number,
  ) => {
    const element = scroller.current
    if (!element) return
    const { viewportWidth: width } = geometry.current
    setZoom((current) => {
      const next = clampZoom(resolve(current))
      if (next === current) return current
      requestAnimationFrame(() => {
        element.scrollLeft = scrollAfter(
          trackWidthFor(totalSeconds, next, width),
        )
      })
      return next
    })
  }

  const zoomAround = (factor: number, clientX: number | null) => {
    const element = scroller.current
    if (!element) return
    const { pxPerSecond: pps } = geometry.current
    const rect = element.getBoundingClientRect()
    const offset = clientX === null ? 0 : clientX - rect.left
    const seconds = (element.scrollLeft + offset) / pps
    applyZoom(
      (current) => current * factor,
      (nextWidth) =>
        seconds * (totalSeconds > 0 ? nextWidth / totalSeconds : 0) - offset,
    )
  }

  const resizeWindow = (edge: "left" | "right", fraction: number) => {
    const element = scroller.current
    if (!element || viewportWidth === 0) return
    const left = element.scrollLeft / trackWidth
    const right = left + viewportWidth / trackWidth
    const nextLeft =
      edge === "left" ? Math.min(fraction, right - WINDOW_MIN_FRACTION) : left
    const nextRight =
      edge === "right" ? Math.max(fraction, left + WINDOW_MIN_FRACTION) : right
    const base = (totalSeconds / 3600) * PX_PER_HOUR
    if (base <= 0) return
    applyZoom(
      () => viewportWidth / (nextRight - nextLeft) / base,
      (nextWidth) =>
        edge === "left"
          ? nextRight * nextWidth - viewportWidth
          : nextLeft * nextWidth,
    )
  }

  const zoomRef = useRef(zoomAround)
  zoomRef.current = zoomAround

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      zoomRef.current(
        event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP,
        event.clientX,
      )
    }
    element.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      element.removeEventListener("wheel", onWheel)
    }
  }, [])

  useEffect(() => {
    const element = scroller.current
    if (!element || !selectedHref) return
    const {
      segments: current,
      pxPerSecond: pps,
      viewportWidth: width,
    } = geometry.current
    const segment = current.find((entry) => entry.href === selectedHref)
    if (!segment) return
    const left = segment.start * pps
    const right = segment.end * pps
    if (left >= element.scrollLeft && right <= element.scrollLeft + width) {
      return
    }
    element.scrollTo({ left: Math.max(0, left - 24), behavior: "smooth" })
  }, [selectedHref])

  if (files.length === 0 || totalSeconds <= 0) return null

  const playingFile = clip
    ? files.find((file) => file.name === clip.name)
    : null
  const playhead =
    playingFile !== null && playingFile !== undefined
      ? (playingFile.offset + currentTime) * pxPerSecond
      : null

  const legend = [
    { key: "placed", swatch: "bg-good" },
    {
      key: "unplaced",
      swatch: "border-poor/70 bg-poor/10 border border-dashed",
    },
    { key: "excluded", swatch: STRIPES },
    { key: "selected", swatch: "ring-primary bg-transparent ring-2" },
  ] as const

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-muted-foreground text-[10px] font-medium tracking-wide">
          {t("reel.title", {
            count: files.length,
            duration: formatClock(totalSeconds),
          })}
        </span>
        <span className="text-muted-foreground text-xs">{t("reel.hint")}</span>
        <div className="ml-auto flex items-center gap-3">
          {!narrow && (
            <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
              {legend.map((entry) => (
                <span
                  key={entry.key}
                  className="inline-flex items-center gap-1.5"
                >
                  <i
                    className={cn(
                      "inline-block size-2.5 rounded-xs",
                      entry.swatch,
                    )}
                  />
                  {t(`reel.legend.${entry.key}`)}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center">
            <TooltipButton
              variant="ghost"
              size="icon-xs"
              aria-label={t("reel.zoomOut")}
              tooltip={t("reel.zoomOut")}
              disabled={zoom <= ZOOM_MIN}
              onClick={() => {
                zoomAround(1 / ZOOM_STEP, null)
              }}
            >
              <icon.Minus />
            </TooltipButton>
            <TooltipButton
              variant="ghost"
              size="icon-xs"
              aria-label={t("reel.zoomIn")}
              tooltip={t("reel.zoomIn")}
              disabled={zoom >= ZOOM_MAX}
              onClick={() => {
                zoomAround(ZOOM_STEP, null)
              }}
            >
              <icon.Plus />
            </TooltipButton>
          </div>
        </div>
      </div>

      <Minimap
        files={files}
        totalSeconds={totalSeconds}
        scrollLeft={scrollLeft}
        viewportWidth={viewportWidth}
        trackWidth={trackWidth}
        label={t("reel.minimap")}
        onPan={(leftFraction) => {
          scroller.current?.scrollTo({ left: leftFraction * trackWidth })
        }}
        onResize={resizeWindow}
      />

      <div
        ref={scroller}
        className="overflow-x-auto overscroll-x-contain select-none"
        onScroll={(event) => {
          setScrollLeft(event.currentTarget.scrollLeft)
        }}
      >
        <div
          className="relative min-w-full"
          style={{ width: `${trackWidth}px` }}
        >
          <div className={cn("relative", narrow ? "h-2" : "h-5")}>
            {segments.map((segment) => {
              const width = (segment.end - segment.start) * pxPerSecond
              const selected = segment.href === selectedHref
              return (
                <button
                  key={`${segment.href}-${segment.start}`}
                  type="button"
                  title={segment.label}
                  aria-pressed={selected}
                  onClick={() => {
                    onSelect(segment.href)
                  }}
                  className={cn(
                    "focus-visible:ring-ring/40 absolute inset-y-0 flex flex-col justify-end gap-0.5 overflow-hidden rounded-xs text-left outline-none focus-visible:ring-2",
                    selected && "z-10",
                  )}
                  style={{
                    left: `${segment.start * pxPerSecond}px`,
                    width: `${Math.max(width, 2)}px`,
                  }}
                >
                  {!narrow && width >= LABEL_MIN_PX && (
                    <span
                      className={cn(
                        "truncate px-0.5 text-[10px] leading-3",
                        selected
                          ? cn("font-medium", TONE_TEXT[segment.tone])
                          : "text-muted-foreground",
                      )}
                    >
                      {segment.label}
                    </span>
                  )}
                  <span
                    className={cn(
                      "block rounded-xs",
                      selected ? "h-2" : "h-1.5 opacity-70",
                      segment.placed ? TONE_FILL[segment.tone] : STRIPES,
                    )}
                  />
                </button>
              )
            })}
          </div>

          <div className={cn("relative mt-0.5", narrow ? "h-8" : "h-10")}>
            {files.map((file) => {
              const width = Math.max(file.duration * pxPerSecond - 2, 3)
              const selected =
                selectedHref !== null &&
                file.chunks.some((chunk) => chunk.href === selectedHref)
              return (
                <button
                  key={file.name}
                  type="button"
                  disabled={!file.present}
                  title={
                    file.present
                      ? `${file.name} · ${formatClock(file.duration)}`
                      : `${file.name} · ${t("reel.notOnDisk")}`
                  }
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    if (rect.width === 0) return
                    const fraction = Math.min(
                      Math.max((event.clientX - rect.left) / rect.width, 0),
                      1,
                    )
                    const time = fraction * file.duration
                    const chunk = file.chunks.find(
                      (entry) => time >= entry.start && time < entry.end,
                    )
                    play(
                      fileClip(bookUuid, file.name, {
                        start: time,
                        label: chunk?.label,
                      }),
                    )
                  }}
                  className={cn(
                    "bg-muted focus-visible:ring-ring/40 absolute inset-y-0 overflow-hidden rounded-sm text-left outline-none focus-visible:ring-2",
                    file.excluded && "opacity-40",
                    !file.present && "cursor-not-allowed opacity-30",
                    selected && "ring-primary z-10 ring-2",
                  )}
                  style={{
                    left: `${file.offset * pxPerSecond + 1}px`,
                    width: `${width}px`,
                  }}
                >
                  {file.chunks.map((chunk) => {
                    const tone =
                      (chunk.href ? toneByHref.get(chunk.href) : null) ??
                      "muted"
                    return (
                      <span
                        key={`${chunk.start}-${chunk.end}`}
                        className={cn(
                          "absolute inset-y-0",
                          chunk.placed
                            ? cn(TONE_FILL[tone], "opacity-75")
                            : chunk.href
                              ? STRIPES
                              : "border-poor/70 bg-poor/10 border border-dashed",
                        )}
                        style={{
                          left: `${(chunk.start / file.duration) * 100}%`,
                          width: `${(chunk.duration / file.duration) * 100}%`,
                        }}
                      />
                    )
                  })}
                  {!narrow && width >= LABEL_MIN_PX && (
                    <span
                      className={cn(
                        "text-foreground/80 absolute bottom-0.5 left-1 max-w-[calc(100%-0.5rem)] truncate text-[10px] tabular-nums",
                        file.excluded && "line-through",
                      )}
                    >
                      {hrefStem(file.name)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {playhead !== null && (
            <span
              className="bg-primary pointer-events-none absolute top-0 bottom-4 z-20 w-0.5 rounded-full"
              style={{ left: `${playhead}px` }}
            />
          )}

          <div className="border-border relative mt-1 h-4 border-t">
            {ticks.map((tick, index) => (
              <span
                key={tick}
                className={cn(
                  "text-muted-foreground absolute top-0 text-[10px] tabular-nums",
                  index > 0 && "-translate-x-1/2",
                )}
                style={{ left: `${tick * pxPerSecond}px` }}
              >
                {formatClock(tick)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
