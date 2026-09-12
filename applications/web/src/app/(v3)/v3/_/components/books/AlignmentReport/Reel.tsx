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

import { type ReportSpan, type ViewSpineItem } from "@/alignmentReportView"
import * as icon from "@/icons"
import { type UUID } from "@/uuid"

import {
  type ReportTone,
  TONE_FILL,
  TONE_TEXT,
  type Track,
  itemTone,
  trackClip,
  trackLabel,
  trackTime,
  trackTone,
} from "./shared"

const PX_PER_HOUR = 520
const PX_PER_SENTENCE = 0.5
const ZOOM_STEP = 1.5
const ZOOM_MIN = 0.25
const ZOOM_MAX = 12
const ZOOM_KEY = "storyteller-alignment-reel-zoom"
const MODE_KEY = "storyteller-alignment-reel-mode"
const WINDOW_MIN_FRACTION = 0.02
const LABEL_MIN_PX = 48
const TICK_MIN_PX = 64
const SECOND_TICKS = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200]
const SENTENCE_TICKS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
const SEGMENT_JOIN_SECONDS = 15
const GAP_SECONDS = 1

const STRIPES =
  "bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--color-muted-foreground)_3px_5px)] opacity-40"

const GAP = "border-poor/70 bg-poor/10 border border-dashed"

type Mode = "audio" | "spine"

type Fill = "solid" | "soft" | "unmatched" | "gap"

type Part = {
  key: string
  start: number
  end: number
  tone: ReportTone
  fill: Fill
  href: string | null
}

type Block = {
  key: string
  href: string | null
  label: string
  title: string
  start: number
  end: number
  tone: ReportTone
  parts: Part[]
  dimmed: boolean
  disabled: boolean
  onClick: (fraction: number) => void
}

type Segment = {
  key: string
  href: string
  label: string
  start: number
  end: number
  tone: ReportTone
  fill: Fill
  onClick: () => void
}

type Playing = { track: Track; time: number }

type Axis = {
  total: number
  blocks: Block[]
  segments: Segment[]
  formatTick: (value: number) => string
  playhead: (playing: Playing | null) => number | null
}

function partClass(part: { tone: ReportTone; fill: Fill }): string {
  if (part.fill === "solid") return cn(TONE_FILL[part.tone], "opacity-80")
  if (part.fill === "soft") return cn(TONE_FILL[part.tone], "opacity-35")
  if (part.fill === "unmatched") return STRIPES
  return GAP
}

function buildAudioAxis(input: {
  bookUuid: UUID
  tracks: Track[]
  items: ViewSpineItem[]
  spans: ReportSpan[]
  totalSeconds: number
  play: (clip: ReturnType<typeof trackClip>) => void
  onSelect: (href: string) => void
}): Axis {
  const itemByIndex = new Map(input.items.map((item) => [item.index, item]))
  const toneByIndex = new Map(
    input.items.map((item) => [item.index, itemTone(item)]),
  )

  const spansByTrack = new Map<number, ReportSpan[]>()
  for (const span of input.spans) {
    if (!span.audio) continue
    const list = spansByTrack.get(span.audio.track) ?? []
    list.push(span)
    spansByTrack.set(span.audio.track, list)
  }
  for (const list of spansByTrack.values()) {
    list.sort((a, b) => (a.audio?.start ?? 0) - (b.audio?.start ?? 0))
  }

  const blocks: Block[] = input.tracks.map((track) => {
    const parts: Part[] = []
    let cursor = 0
    const gap = (end: number) => {
      if (end - cursor >= GAP_SECONDS) {
        parts.push({
          key: `gap-${cursor}`,
          start: cursor,
          end,
          tone: "poor",
          fill: "gap",
          href: null,
        })
      }
    }
    for (const span of spansByTrack.get(track.index) ?? []) {
      if (!span.audio) continue
      const start = Math.max(span.audio.start, cursor)
      const end = Math.max(span.audio.end, start)
      gap(start)
      const item = itemByIndex.get(span.spine)
      parts.push({
        key: `${span.spine}-${span.firstSentence}`,
        start,
        end,
        tone: toneByIndex.get(span.spine) ?? "muted",
        fill: span.state === "aligned" ? "solid" : "soft",
        href: item?.href ?? null,
      })
      cursor = end
    }
    gap(track.duration)

    const label = trackLabel(track)
    const playable = track.present || track.source !== null
    return {
      key: track.name,
      href: null,
      label,
      title: `${track.name} · ${formatClock(track.duration)}`,
      start: track.offset,
      end: track.offset + track.duration,
      tone: trackTone(track),
      parts,
      dimmed: track.excluded,
      disabled: !playable,
      onClick: (fraction) => {
        const time = fraction * track.duration
        const part = parts.find(
          (entry) => time >= entry.start && time < entry.end,
        )
        const item = input.items.find((entry) => entry.href === part?.href)
        input.play(
          trackClip(input.bookUuid, track, {
            start: time,
            label: item?.label ?? null,
          }),
        )
      },
    }
  })

  const segments: Segment[] = []
  for (const track of input.tracks) {
    for (const span of spansByTrack.get(track.index) ?? []) {
      if (!span.audio) continue
      const item = itemByIndex.get(span.spine)
      if (!item) continue
      const start = track.offset + span.audio.start
      const end = track.offset + span.audio.end
      const last = segments.at(-1)
      if (
        last &&
        last.href === item.href &&
        start - last.end < SEGMENT_JOIN_SECONDS
      ) {
        last.end = Math.max(last.end, end)
        if (span.state === "aligned") last.fill = "solid"
        continue
      }
      segments.push({
        key: `${item.href}-${start}`,
        href: item.href,
        label: item.label,
        start,
        end,
        tone: toneByIndex.get(span.spine) ?? "muted",
        fill: span.state === "aligned" ? "solid" : "soft",
        onClick: () => {
          input.onSelect(item.href)
        },
      })
    }
  }

  return {
    total: input.totalSeconds,
    blocks,
    segments,
    formatTick: formatClock,
    playhead: (playing) =>
      playing ? playing.track.offset + playing.time : null,
  }
}

function buildSpineAxis(input: {
  bookUuid: UUID
  tracks: Track[]
  items: ViewSpineItem[]
  spans: ReportSpan[]
  play: (clip: ReturnType<typeof trackClip>) => void
  onSelect: (href: string) => void
}): Axis {
  const spansByIndex = new Map<number, ReportSpan[]>()
  for (const span of input.spans) {
    const list = spansByIndex.get(span.spine) ?? []
    list.push(span)
    spansByIndex.set(span.spine, list)
  }
  for (const list of spansByIndex.values()) {
    list.sort((a, b) => a.firstSentence - b.firstSentence)
  }

  const offsets = new Map<number, number>()
  let cursor = 0
  const blocks: Block[] = []
  for (const item of input.items) {
    if (item.sentenceCount === 0) continue
    const tone = itemTone(item)
    const start = cursor
    offsets.set(item.index, start)
    const parts: Part[] = (spansByIndex.get(item.index) ?? []).map((span) => ({
      key: `${span.firstSentence}`,
      start: span.firstSentence,
      end: span.lastSentence + 1,
      tone,
      fill:
        span.state === "aligned"
          ? "solid"
          : span.state === "interpolated"
            ? "soft"
            : "unmatched",
      href: item.href,
    }))
    blocks.push({
      key: item.href,
      href: item.href,
      label: item.label,
      title: `${item.label} · ${item.matchedSentenceCount}/${item.sentenceCount}`,
      start,
      end: start + item.sentenceCount,
      tone,
      parts,
      dimmed: item.judgment === "excluded",
      disabled: false,
      onClick: () => {
        input.onSelect(item.href)
      },
    })
    cursor += item.sentenceCount
  }

  const segments: Segment[] = []
  for (const item of input.items) {
    const offset = offsets.get(item.index)
    if (offset === undefined) continue
    for (const span of spansByIndex.get(item.index) ?? []) {
      if (!span.audio) continue
      const track = input.tracks[span.audio.track]
      if (!track) continue
      const start = offset + span.firstSentence
      const end = offset + span.lastSentence + 1
      const last = segments.at(-1)
      if (last && last.key.startsWith(`${track.name}|`) && last.end === start) {
        last.end = end
        continue
      }
      const audio = span.audio
      segments.push({
        key: `${track.name}|${start}`,
        href: item.href,
        label: trackLabel(track),
        start,
        end,
        tone: trackTone(track),
        fill: "solid",
        onClick: () => {
          input.play(
            trackClip(input.bookUuid, track, {
              start: audio.start,
              end: audio.end,
              label: item.label,
            }),
          )
        },
      })
    }
  }

  const playhead = (playing: Playing | null) => {
    if (!playing) return null
    const { track, time } = playing
    const span = input.spans.find(
      (entry) =>
        entry.audio?.track === track.index &&
        time >= entry.audio.start &&
        time < entry.audio.end,
    )
    const offset = span ? offsets.get(span.spine) : undefined
    if (!span?.audio || offset === undefined) return null
    const length = span.audio.end - span.audio.start
    const fraction = length > 0 ? (time - span.audio.start) / length : 0
    return (
      offset +
      span.firstSentence +
      fraction * (span.lastSentence - span.firstSentence + 1)
    )
  }

  return {
    total: cursor,
    blocks,
    segments,
    formatTick: (value) => String(value),
    playhead,
  }
}

function basePx(mode: Mode, total: number): number {
  return mode === "audio"
    ? (total / 3600) * PX_PER_HOUR
    : total * PX_PER_SENTENCE
}

function trackWidthFor(
  mode: Mode,
  total: number,
  zoom: number,
  viewportWidth: number,
): number {
  return Math.max(viewportWidth, basePx(mode, total) * zoom)
}

function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, ZOOM_MIN), ZOOM_MAX)
}

function readStored<T extends string | number>(
  key: string,
  parse: (raw: string) => T | null,
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : (parse(raw) ?? fallback)
  } catch {
    return fallback
  }
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    return
  }
}

type Drag =
  | { mode: "pan"; grip: number }
  | { mode: "resize"; edge: "left" | "right" }

function Minimap({
  blocks,
  total,
  scrollLeft,
  viewportWidth,
  trackWidth,
  label,
  onPan,
  onResize,
}: {
  blocks: Block[]
  total: number
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
      {blocks.map((block) => (
        <span
          key={block.key}
          className={cn(
            "absolute inset-y-0.5 rounded-[1px]",
            TONE_FILL[block.tone],
            block.dimmed && "opacity-30",
          )}
          style={{
            left: `${(block.start / total) * 100}%`,
            width: `calc(${((block.end - block.start) / total) * 100}% - 1px)`,
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
  tracks,
  totalSeconds,
  items,
  spans,
  selectedHref,
  onSelect,
  narrow,
}: {
  bookUuid: UUID
  tracks: Track[]
  totalSeconds: number
  items: ViewSpineItem[]
  spans: ReportSpan[]
  selectedHref: string | null
  onSelect: (href: string) => void
  narrow: boolean
}) {
  const t = useTranslation("AlignmentReport")
  const { play, clip, currentTime } = usePlayer()
  const scroller = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [zoom, setZoom] = useState(() =>
    readStored(
      ZOOM_KEY,
      (raw) => {
        const parsed = Number(raw)
        return Number.isFinite(parsed) && parsed > 0 ? clampZoom(parsed) : null
      },
      1,
    ),
  )
  const [mode, setMode] = useState<Mode>(() =>
    readStored<Mode>(
      MODE_KEY,
      (raw) => (raw === "audio" || raw === "spine" ? raw : null),
      "audio",
    ),
  )

  useEffect(() => {
    store(ZOOM_KEY, String(zoom))
  }, [zoom])

  useEffect(() => {
    store(MODE_KEY, mode)
  }, [mode])

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

  const playingTrack = clip
    ? (tracks.find((track) => track.name === clip.name) ?? null)
    : null
  const playing: Playing | null =
    playingTrack && clip
      ? {
          track: playingTrack,
          time: trackTime(playingTrack, clip, currentTime),
        }
      : null

  const axis = useMemo(() => {
    const playClip = (next: ReturnType<typeof trackClip>) => {
      if (next) play(next)
    }
    return mode === "audio"
      ? buildAudioAxis({
          bookUuid,
          tracks,
          items,
          spans,
          totalSeconds,
          play: playClip,
          onSelect,
        })
      : buildSpineAxis({
          bookUuid,
          tracks,
          items,
          spans,
          play: playClip,
          onSelect,
        })
  }, [mode, bookUuid, tracks, items, spans, totalSeconds, play, onSelect])

  const playhead = axis.playhead(playing)

  const total = axis.total
  const trackWidth = trackWidthFor(mode, total, zoom, viewportWidth)
  const pxPerUnit = total > 0 ? trackWidth / total : 0

  const tickSteps = mode === "audio" ? SECOND_TICKS : SENTENCE_TICKS
  const tickStep =
    tickSteps.find((step) => step * pxPerUnit >= TICK_MIN_PX) ??
    tickSteps[tickSteps.length - 1] ??
    1
  const ticks: number[] = []
  for (let at = 0; at < total; at += tickStep) ticks.push(at)

  const geometry = useRef({ axis, pxPerUnit, viewportWidth })
  geometry.current = { axis, pxPerUnit, viewportWidth }

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
          trackWidthFor(mode, total, next, width),
        )
      })
      return next
    })
  }

  const zoomAround = (factor: number, clientX: number | null) => {
    const element = scroller.current
    if (!element) return
    const { pxPerUnit: ppu } = geometry.current
    const rect = element.getBoundingClientRect()
    const offset = clientX === null ? 0 : clientX - rect.left
    const units = (element.scrollLeft + offset) / ppu
    applyZoom(
      (current) => current * factor,
      (nextWidth) => units * (total > 0 ? nextWidth / total : 0) - offset,
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
    const base = basePx(mode, total)
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
      axis: current,
      pxPerUnit: ppu,
      viewportWidth: width,
    } = geometry.current
    const target =
      current.blocks.find((block) => block.href === selectedHref) ??
      current.segments.find((segment) => segment.href === selectedHref)
    if (!target) return
    const left = target.start * ppu
    const right = target.end * ppu
    if (left >= element.scrollLeft && right <= element.scrollLeft + width) {
      return
    }
    element.scrollTo({ left: Math.max(0, left - 24), behavior: "smooth" })
  }, [selectedHref, mode])

  if (tracks.length === 0 || total <= 0) return null

  const legend = [
    { key: "aligned", swatch: "bg-good opacity-80" },
    { key: "interpolated", swatch: "bg-good opacity-35" },
    { key: "unmatched", swatch: STRIPES },
    { key: "loose", swatch: GAP },
    { key: "selected", swatch: "ring-primary bg-transparent ring-2" },
  ] as const

  const totalSentences = items.reduce(
    (sum, item) => sum + item.sentenceCount,
    0,
  )

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-muted-foreground text-[10px] font-medium tracking-wide">
          {mode === "audio"
            ? t("reel.title", {
                count: tracks.length,
                duration: formatClock(totalSeconds),
              })
            : t("reel.titleSpine", {
                count: axis.blocks.length,
                sentences: totalSentences,
              })}
        </span>
        <span className="text-muted-foreground text-xs">
          {mode === "audio" ? t("reel.hint") : t("reel.hintSpine")}
        </span>
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
            <TooltipButton
              variant="ghost"
              size="icon-xs"
              aria-pressed={mode === "spine"}
              aria-label={
                mode === "audio" ? t("reel.mode.spine") : t("reel.mode.audio")
              }
              tooltip={
                mode === "audio" ? t("reel.mode.spine") : t("reel.mode.audio")
              }
              onClick={() => {
                setMode((current) => (current === "audio" ? "spine" : "audio"))
              }}
            >
              {mode === "audio" ? <icon.BookAlt /> : <icon.Audiobook />}
            </TooltipButton>
          </div>
        </div>
      </div>

      <Minimap
        blocks={axis.blocks}
        total={total}
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
            {axis.segments.map((segment) => {
              const width = (segment.end - segment.start) * pxPerUnit
              const selected = segment.href === selectedHref
              return (
                <button
                  key={segment.key}
                  type="button"
                  title={segment.label}
                  aria-pressed={selected}
                  onClick={segment.onClick}
                  className={cn(
                    "focus-visible:ring-ring/40 absolute inset-y-0 flex flex-col justify-end gap-0.5 overflow-hidden rounded-xs text-left outline-none focus-visible:ring-2",
                    selected && "z-10",
                  )}
                  style={{
                    left: `${segment.start * pxPerUnit}px`,
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
                      selected ? "h-2" : "h-1.5",
                      partClass(segment),
                    )}
                  />
                </button>
              )
            })}
          </div>

          <div className={cn("relative mt-0.5", narrow ? "h-8" : "h-10")}>
            {axis.blocks.map((block) => {
              const span = block.end - block.start
              const width = Math.max(span * pxPerUnit - 2, 3)
              const selected =
                selectedHref !== null &&
                (block.href === selectedHref ||
                  block.parts.some((part) => part.href === selectedHref))
              return (
                <button
                  key={block.key}
                  type="button"
                  disabled={block.disabled}
                  title={
                    block.disabled
                      ? `${block.title} · ${t("reel.notOnDisk")}`
                      : block.title
                  }
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    if (rect.width === 0) return
                    const fraction = Math.min(
                      Math.max((event.clientX - rect.left) / rect.width, 0),
                      1,
                    )
                    block.onClick(fraction)
                  }}
                  className={cn(
                    "bg-muted focus-visible:ring-ring/40 absolute inset-y-0 overflow-hidden rounded-sm text-left outline-none focus-visible:ring-2",
                    block.dimmed && "opacity-40",
                    block.disabled && "cursor-not-allowed opacity-30",
                    selected && "ring-primary z-10 ring-2",
                  )}
                  style={{
                    left: `${block.start * pxPerUnit + 1}px`,
                    width: `${width}px`,
                  }}
                >
                  {block.parts.map((part) => (
                    <span
                      key={part.key}
                      className={cn("absolute inset-y-0", partClass(part))}
                      style={{
                        left: `${(part.start / span) * 100}%`,
                        width: `${((part.end - part.start) / span) * 100}%`,
                      }}
                    />
                  ))}
                  {!narrow && width >= LABEL_MIN_PX && (
                    <span
                      className={cn(
                        "text-foreground/80 absolute bottom-0.5 left-1 max-w-[calc(100%-0.5rem)] truncate text-[10px] tabular-nums",
                        block.dimmed && "line-through",
                      )}
                    >
                      {block.label}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {playhead !== null && (
            <span
              className="bg-primary pointer-events-none absolute top-0 bottom-4 z-20 w-0.5 rounded-full"
              style={{ left: `${playhead * pxPerUnit}px` }}
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
                style={{ left: `${tick * pxPerUnit}px` }}
              >
                {axis.formatTick(tick)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
