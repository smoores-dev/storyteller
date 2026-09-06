"use client"

import { type PointerEvent, useEffect, useRef } from "react"

import { Button } from "@v3/_/components/ui/button"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"

import { formatClock } from "./clip"
import { usePlayer } from "./store"

const RATES = [1, 1.25, 1.5, 2]

export function PlayerDock({ className }: { className?: string } = {}) {
  const t = useTranslation("Player")

  const {
    clip,
    playing,
    currentTime,
    duration,
    rate,
    toggle,
    seek,
    skip,
    setRate,
    wholeFile,
    stop,
    unbounded,
  } = usePlayer()
  const dockRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey) return
      const target = event.target as HTMLElement | null
      const inDock =
        target !== null && (dockRef.current?.contains(target) ?? false)
      if (!inDock && target !== document.body) return
      if (target.isContentEditable) return
      const tag = target.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (event.key === " ") {
        event.preventDefault()
        toggle()
        return
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        skip(-5)
        return
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        skip(5)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [toggle, skip])

  if (!clip) return null

  const total = duration > 0 ? duration : null
  const windowStart = clip.start ?? 0
  const windowEnd = clip.end ?? total ?? 0
  const bounded = clip.end !== undefined
  const percent = (seconds: number) =>
    total === null ? 0 : Math.min(Math.max(seconds / total, 0), 1) * 100

  function seekFromPointer(event: PointerEvent<HTMLDivElement>) {
    if (total === null) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    seek(((event.clientX - rect.left) / rect.width) * total)
  }

  return (
    <div
      ref={dockRef}
      tabIndex={-1}
      role="group"
      aria-label={t("label")}
      className={cn(
        "bg-card/95 border-border animate-in slide-in-from-bottom-2 @container/dock sticky bottom-0 z-40 flex items-center gap-3 border-t px-3 py-2 shadow-lg outline-none supports-backdrop-filter:backdrop-blur-sm motion-reduce:animate-none",
        className,
      )}
    >
      <Button
        variant="secondary"
        size="icon"
        aria-label={playing ? t("pause") : t("play")}
        onClick={() => {
          toggle()
        }}
      >
        {playing ? <icon.PlayerPause /> : <icon.PlayerPlay />}
      </Button>

      <div className="flex max-w-72 min-w-0 shrink flex-col @max-2xl/dock:max-w-32">
        <span className="truncate text-xs font-medium">{clip.label}</span>
        {clip.sublabel !== undefined && (
          <span className="text-muted-foreground truncate text-[0.625rem]">
            {clip.sublabel}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-muted-foreground shrink-0 text-[0.625rem] tabular-nums">
          {formatClock(currentTime)}
        </span>
        <div
          className="group/track relative h-4 min-w-10 flex-1 cursor-pointer touch-none"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            seekFromPointer(event)
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
            seekFromPointer(event)
          }}
        >
          <div className="bg-muted absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full">
            {bounded && total !== null && (
              <div
                className="bg-foreground/15 absolute inset-y-0 rounded-full"
                style={{
                  left: `${percent(windowStart)}%`,
                  width: `${Math.max(percent(windowEnd) - percent(windowStart), 0.5)}%`,
                }}
              />
            )}
            <div
              className="bg-primary absolute inset-y-0 rounded-full transition-[left,width] duration-150 motion-reduce:transition-none"
              style={{
                left: `${bounded && !unbounded ? percent(windowStart) : 0}%`,
                width: `${Math.max(percent(currentTime) - (bounded && !unbounded ? percent(windowStart) : 0), 0)}%`,
              }}
            />
            <div
              className="border-background bg-primary absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-[left] duration-150 motion-reduce:transition-none"
              style={{ left: `${percent(currentTime)}%` }}
            />
          </div>
        </div>
        <span className="text-muted-foreground shrink-0 text-[0.625rem] tabular-nums">
          {total === null ? "--:--" : formatClock(total)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <TooltipButton
          variant="ghost"
          size="xs"
          tooltip={t("back10")}
          aria-label={t("back10")}
          className="@max-2xl/dock:hidden"
          onClick={() => {
            skip(-10)
          }}
        >
          <icon.PlayerSkipBack10 />
        </TooltipButton>
        <TooltipButton
          variant="ghost"
          size="xs"
          aria-label={t("forward10")}
          tooltip={t("forward10")}
          className="@max-2xl/dock:hidden"
          onClick={() => {
            skip(10)
          }}
        >
          <icon.PlayerSkipForward10 />
        </TooltipButton>
        {bounded && (
          <Button
            variant="ghost"
            size="xs"
            aria-pressed={unbounded}
            className={cn("max-[719px]:hidden", unbounded && "text-primary")}
            onClick={() => {
              wholeFile()
            }}
          >
            {t("wholeFile")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="xs"
          aria-label={t("speed")}
          onClick={() => {
            setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1)
          }}
        >
          {rate}x
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("close")}
          onClick={() => {
            stop()
          }}
        >
          <icon.Close />
        </Button>
      </div>
    </div>
  )
}
