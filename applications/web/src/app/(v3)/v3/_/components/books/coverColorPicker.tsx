"use client"

import { useEffect, useState } from "react"

import { type JsColor } from "@storyteller-platform/okmain"

import { TooltipButton } from "@v3/_/components/ui/tooltip-button"

import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import * as icon from "@/icons"

import { type CoverType } from "./coverSwatches"

export type ColorPair = [JsColor, JsColor]

export function rgbToHex({ r, g, b }: JsColor): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`
}

export function hexToRgb(hex: string): JsColor | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m?.[1]) return null
  const int = parseInt(m[1], 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

export function sameColor(a: JsColor, b: JsColor): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b
}

export function coverPalettes(
  book: BookWithRelations,
  label: (type: CoverType) => string,
): { type: CoverType; label: string; colors: JsColor[] }[] {
  return (["ebook", "audiobook", "readaloud"] as const)
    .map((type) => ({
      type,
      label: label(type),
      colors: book[type]?.cover?.colors ?? [],
    }))
    .filter((entry) => entry.colors.length > 0)
}

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> }

export function useEyeDropper(): (() => Promise<JsColor | null>) | null {
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    setSupported("EyeDropper" in window)
  }, [])

  if (!supported) return null

  return async () => {
    const Ctor = (window as unknown as { EyeDropper: EyeDropperCtor })
      .EyeDropper
    try {
      const result = await new Ctor().open()
      return hexToRgb(result.sRGBHex)
    } catch {
      return null
    }
  }
}

export function ColorSwatch({
  color,
  label,
  active,
  marked,
  onClick,
  className,
}: {
  color: JsColor
  label: string
  active: boolean
  marked?: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`${label} — ${rgbToHex(color)}`}
      className={cn("flex flex-col items-stretch gap-1 text-left", className)}
    >
      <span
        className={cn(
          "block h-10 rounded-md ring-1 ring-black/10 transition-shadow ring-inset dark:ring-white/15",
          active && "ring-cover-accent ring-2",
        )}
        style={{ background: rgbToHex(color) }}
      />
      <span className="text-muted-foreground flex items-center gap-1 text-[0.6875rem] leading-none">
        {label}
        {marked && (
          <span
            aria-hidden
            className="bg-cover-accent size-1 shrink-0 rounded-full"
          />
        )}
      </span>
    </button>
  )
}

export function PaletteStrip({
  label,
  colors,
  current,
  onPick,
}: {
  label: string
  colors: JsColor[]
  current: JsColor
  onPick: (color: JsColor) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[0.6875rem] leading-none">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {colors.map((color, index) => (
          <button
            key={`${index}-${rgbToHex(color)}`}
            type="button"
            title={rgbToHex(color)}
            aria-label={rgbToHex(color)}
            onClick={() => {
              onPick(color)
            }}
            className={cn(
              "size-6 rounded-sm ring-1 ring-black/10 ring-inset dark:ring-white/15",
              sameColor(color, current) && "ring-cover-accent ring-2",
            )}
            style={{ background: rgbToHex(color) }}
          />
        ))}
      </div>
    </div>
  )
}

export function ColorSourceRow({
  value,
  onPick,
  dropperLabel,
}: {
  value: JsColor
  onPick: (color: JsColor) => void
  dropperLabel: string
}) {
  const pickWithDropper = useEyeDropper()
  const [hex, setHex] = useState(() => rgbToHex(value))

  useEffect(() => {
    setHex(rgbToHex(value))
  }, [value])

  const commit = (next: string) => {
    setHex(next)
    const rgb = hexToRgb(next)
    if (rgb) onPick(rgb)
  }

  return (
    <div className="flex items-center gap-1.5">
      {pickWithDropper && (
        <TooltipButton
          type="button"
          variant="outline"
          size="icon-sm"
          tooltip={dropperLabel}
          aria-label={dropperLabel}
          onClick={() => {
            void pickWithDropper().then((color) => {
              if (color) onPick(color)
            })
          }}
        >
          <icon.Dropper className="size-4" />
        </TooltipButton>
      )}

      <input
        type="color"
        value={hex}
        aria-label={`${dropperLabel} (picker)`}
        onChange={(e) => {
          commit(e.target.value)
        }}
        className="border-input size-8 cursor-pointer rounded-md border bg-transparent p-0.5"
      />

      <input
        type="text"
        value={hex}
        spellCheck={false}
        aria-label="Hex"
        onChange={(e) => {
          commit(e.target.value)
        }}
        className="border-input focus-visible:border-ring w-24 rounded-md border bg-transparent px-2 py-1 font-mono text-xs outline-none"
      />
    </div>
  )
}
