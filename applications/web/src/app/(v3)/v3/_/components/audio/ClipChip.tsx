"use client"

import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"

import { type Clip, clipKey, formatClock } from "./clip"
import { usePlayer } from "./store"

export function ClipChip({
  clip,
  className,
}: {
  clip: Clip
  className?: string
}) {
  const { clip: current, playing, play } = usePlayer()
  const isCurrent = current !== null && clipKey(current) === clipKey(clip)
  const isPlaying = isCurrent && playing

  const range =
    clip.start === undefined && clip.end === undefined
      ? null
      : clip.end === undefined
        ? formatClock(clip.start ?? 0)
        : `${formatClock(clip.start ?? 0)}-${formatClock(clip.end)}`

  return (
    <button
      type="button"
      aria-pressed={isCurrent}
      title={clip.sublabel ?? clip.label}
      onClick={() => {
        play(clip)
      }}
      className={cn(
        "focus-visible:ring-ring/30 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.625rem] whitespace-nowrap transition-colors outline-none focus-visible:ring-2 motion-reduce:transition-none",
        isCurrent
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        className,
      )}
    >
      {isPlaying ? (
        <icon.PlayerPause className="size-2.5" />
      ) : (
        <icon.PlayerPlay className="size-2.5" />
      )}
      <span>{clip.name.replace(/\.[^./]+$/, "")}</span>
      {range !== null && <span className="opacity-70">{range}</span>}
    </button>
  )
}
