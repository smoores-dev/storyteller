"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { type JsColor } from "@storyteller-platform/okmain"

import { Button } from "@v3/_/components/ui/button"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"

import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import * as icon from "@/icons"
import { useUpdateBookMutation } from "@/store/api"

function rgbToHex({ r, g, b }: JsColor): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`
}

function hexToRgb(hex: string): JsColor | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m?.[1]) return null
  const int = parseInt(m[1], 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

function samePalette(a: JsColor[], b: JsColor[]): boolean {
  if (a.length !== b.length) return false
  return a.every((c, i) => {
    const o = b[i]
    return !!o && c.r === o.r && c.g === o.g && c.b === o.b
  })
}

function resolvedPalette(book: BookWithRelations): JsColor[] {
  return (
    book.coverColorsOverride ??
    book.ebook?.coverColors ??
    book.audiobook?.coverColors ??
    book.readaloud?.coverColors ??
    []
  )
}

function formatPalettes(
  book: BookWithRelations,
): { key: string; label: string; colors: JsColor[] }[] {
  return (
    [
      { key: "ebook", label: "E-book", colors: book.ebook?.coverColors },
      {
        key: "audiobook",
        label: "Audiobook",
        colors: book.audiobook?.coverColors,
      },
      {
        key: "readaloud",
        label: "Read-along",
        colors: book.readaloud?.coverColors,
      },
    ] as const
  )
    .filter((f): f is typeof f & { colors: JsColor[] } => !!f.colors?.length)
    .map((f) => ({ key: f.key, label: f.label, colors: f.colors }))
}

export function CoverColorsEditor({ book }: { book: BookWithRelations }) {
  const [updateBook, { isLoading }] = useUpdateBookMutation()
  const [draft, setDraft] = useState<JsColor[]>(() => resolvedPalette(book))

  const persistedKey = JSON.stringify([
    book.coverColorsOverride ?? null,
    book.ebook?.coverColors ?? null,
    book.audiobook?.coverColors ?? null,
    book.readaloud?.coverColors ?? null,
  ])
  useEffect(() => {
    setDraft(resolvedPalette(book))
  }, [book, persistedKey])

  const hasOverride = book.coverColorsOverride != null
  const dirty = !samePalette(draft, resolvedPalette(book))
  const formats = formatPalettes(book)

  const recolor = (index: number, hex: string) => {
    const rgb = hexToRgb(hex)
    if (!rgb) return
    setDraft((d) => d.map((c, i) => (i === index ? rgb : c)))
  }
  const remove = (index: number) => {
    setDraft((d) => d.filter((_, i) => i !== index))
  }
  const move = (index: number, dir: -1 | 1) => {
    setDraft((d) => {
      const next = index + dir
      const a = d[index]
      const b = d[next]
      if (!a || !b) return d
      const copy = [...d]
      copy[index] = b
      copy[next] = a
      return copy
    })
  }
  const makePrimary = (index: number) => {
    setDraft((d) => {
      if (index === 0) return d
      const copy = [...d]
      const [picked] = copy.splice(index, 1)
      if (!picked) return d
      copy.unshift(picked)
      return copy
    })
  }
  const add = () => {
    setDraft((d) => [...d, d[0] ?? { r: 136, g: 136, b: 136 }])
  }

  const save = async () => {
    const res = await updateBook({
      update: { uuid: book.uuid, coverColorsOverride: draft },
    })
    if ("error" in res && res.error) {
      toast.error("Could not save cover colors")
    } else {
      toast.success("Cover colors saved")
    }
  }

  const reread = async () => {
    const res = await updateBook({
      update: { uuid: book.uuid, coverColorsOverride: null },
    })
    if ("error" in res && res.error) {
      toast.error("Could not reset cover colors")
    } else {
      toast.success("Reread colors from cover")
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="section-label mb-2">
        <icon.Palette className="size-3.5 stroke-[1.5]" />
        Cover colors
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {draft.map((color, index) => (
          <div
            key={index}
            className="group/swatch relative flex flex-col items-center"
          >
            <label
              className={cn(
                "relative block size-9 cursor-pointer rounded-md ring-1 ring-black/10 ring-inset dark:ring-white/15",
                index === 0 && "ring-cover-accent ring-2",
              )}
              style={{ background: rgbToHex(color) }}
              title={index === 0 ? "Primary" : "Click to recolor"}
            >
              <input
                type="color"
                value={rgbToHex(color)}
                onChange={(e) => {
                  recolor(index, e.target.value)
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              {index === 0 && (
                <icon.Star className="fill-cover-accent text-cover-accent absolute -top-1.5 -right-1.5 size-3.5" />
              )}
            </label>

            <div className="mt-0.5 flex items-center opacity-0 transition-opacity group-hover/swatch:opacity-100">
              <button
                type="button"
                aria-label="Move earlier"
                disabled={index === 0}
                onClick={() => {
                  move(index, -1)
                }}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <icon.ChevronLeft className="size-3.5" />
              </button>
              {index !== 0 && (
                <button
                  type="button"
                  aria-label="Make primary"
                  onClick={() => {
                    makePrimary(index)
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <icon.Star className="size-3" />
                </button>
              )}
              <button
                type="button"
                aria-label="Remove"
                onClick={() => {
                  remove(index)
                }}
                className="text-muted-foreground hover:text-bad"
              >
                <icon.Close className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Move later"
                disabled={index === draft.length - 1}
                onClick={() => {
                  move(index, 1)
                }}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <icon.ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        ))}

        <TooltipButton
          type="button"
          variant="outline"
          size="icon-sm"
          className="size-9 rounded-md border-dashed"
          onClick={add}
          aria-label="Add color"
          tooltip="Add color"
        >
          <icon.Plus className="size-4" />
        </TooltipButton>
      </div>

      {formats.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {formats.map((f) => (
            <div key={f.key} className="flex items-center gap-2">
              <span className="text-muted-foreground w-20 shrink-0 text-xs">
                {f.label}
              </span>
              <div className="flex flex-wrap gap-1">
                {f.colors.map((c, i) => (
                  <span
                    key={i}
                    className="size-4 rounded-sm ring-1 ring-black/10 ring-inset dark:ring-white/15"
                    style={{ background: rgbToHex(c) }}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-xs"
                onClick={() => {
                  setDraft(f.colors)
                }}
              >
                Use
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant="cover"
          size="sm"
          onClick={() => void save()}
          disabled={isLoading || !dirty || draft.length === 0}
        >
          Save colors
        </Button>
        <TooltipButton
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void reread()}
          disabled={isLoading || !hasOverride}
          aria-label="Reread colors from cover"
          tooltip="Discard the override and re-derive colors from the covers"
        >
          <icon.Refresh className="mr-1 size-3.5" />
          Reread from cover
        </TooltipButton>
      </div>
    </div>
  )
}
