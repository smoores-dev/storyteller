"use client"

import { useReducedMotion } from "motion/react"

import { cn } from "@v3/_/lib/utils"

import { type ProcessingView, STAGE_SEQUENCE, overallProgress } from "./shared"

const SEGMENTS = 16
const MAX_TILT = 40
const ORANGE = "#f97316"

export function ProgressVisualization({
  view,
  percent,
  className,
}: {
  view: ProcessingView
  percent?: number
  className?: string
}) {
  const reduce = useReducedMotion()

  if (reduce) {
    return (
      <InlineRow percent={percent} className={className}>
        <StaticProgressBar view={view} />
      </InlineRow>
    )
  }

  return (
    <InlineRow percent={percent} className={className}>
      <div
        className={cn(
          "flex h-6 flex-1 items-center justify-between gap-[3px]",
          view.status === "paused" && "opacity-50",
        )}
        aria-hidden
      >
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <Segment key={i} index={i} view={view} />
        ))}
      </div>
    </InlineRow>
  )
}

function InlineRow({
  percent,
  className,
  children,
}: {
  percent?: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {children}
      {percent != undefined && (
        <span className="text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums">
          {percent}%
        </span>
      )}
    </div>
  )
}

function Segment({ index, view }: { index: number; view: ProcessingView }) {
  const { stage, stageProgress, status } = view
  const stageIndex = stage ? STAGE_SEQUENCE.indexOf(stage) : -1

  const sweep = stageProgress * SEGMENTS
  const local = Math.min(Math.max(sweep - index, 0), 1)
  let lean = (index % 2 === 0 ? 1 : -1) * MAX_TILT

  let base = "var(--muted)"
  let fillColor = "var(--muted-foreground)"
  let fill = 0
  let tiltFactor = 0

  if (status === "error") {
    base = "var(--destructive)"
    fillColor = "var(--destructive)"
    fill = 1
    tiltFactor = 0
  } else if (status === "done" || stageIndex < 0) {
    base = status === "done" ? "var(--primary)" : "var(--muted)"
    fillColor = "var(--primary)"
    fill = status === "done" ? 1 : 0
    tiltFactor = 0
  } else if (stage === "SPLIT_TRACKS") {
    base = "var(--muted)"
    fillColor = "var(--muted-foreground)"
    fill = local
    tiltFactor = local
  } else if (stage === "TRANSCRIBE_CHAPTERS") {
    base = "var(--muted-foreground)"
    fillColor = ORANGE
    fill = local
    tiltFactor = 1
  } else {
    base = ORANGE
    fillColor = "var(--primary)"
    fill = local
    tiltFactor = 1 - local
  }
  lean = lean * ((index % 5 || 1) / 4)

  const rotation = 90 + lean * tiltFactor

  return (
    <span
      className="relative h-4 w-[3px] shrink-0 origin-center overflow-hidden rounded-full transition-transform duration-500 ease-out"
      style={{
        backgroundColor: base,
        transform: `rotate(${rotation}deg)`,
        transitionDelay: `${index * 10}ms`,
      }}
    >
      <span
        className="absolute inset-x-0 bottom-0 rounded-full transition-all duration-500 ease-out"
        style={{
          height: `${fill * 100}%`,
          backgroundColor: fillColor,
          transitionDelay: `${index * 10}ms`,
        }}
      />
    </span>
  )
}

export function StaticProgressBar({
  view,
  className,
}: {
  view: ProcessingView
  className?: string
}) {
  const pct = Math.round(overallProgress(view) * 100)

  const tint = view.status === "error" ? "bg-destructive" : "bg-primary"

  return (
    <div
      className={cn(
        "bg-muted h-2 w-full flex-1 overflow-hidden rounded-full",
        view.status === "paused" && "opacity-50",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full transition-all", tint)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
