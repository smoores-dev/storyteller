"use client"

import { Button } from "@v3/_/components/ui/button"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"

import { type Clip, clipKey } from "./clip"
import { usePlayer } from "./store"

export function PlayButton({
  clip,
  className,
}: {
  clip: Clip
  className?: string
}) {
  const { clip: current, playing, play } = usePlayer()
  const isCurrent = current !== null && clipKey(current) === clipKey(clip)
  const isPlaying = isCurrent && playing

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={isPlaying ? `Pause ${clip.label}` : `Play ${clip.label}`}
      aria-pressed={isCurrent}
      className={cn(isCurrent && "text-primary", className)}
      onClick={() => {
        play(clip)
      }}
    >
      {isPlaying ? <icon.PlayerPause /> : <icon.PlayerPlay />}
    </Button>
  )
}
