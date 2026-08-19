"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

import { type JsColor } from "@storyteller-platform/okmain"

import { Cover } from "@v3/_/components/books/Cover"
import {
  type ColorPair,
  ColorSourceRow,
  ColorSwatch,
  PaletteStrip,
  rgbToHex,
} from "@v3/_/components/books/coverColorPicker"
import {
  coverSwatches,
  resolveCoverColors,
} from "@v3/_/components/books/coverSwatches"
import { Button } from "@v3/_/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import * as icon from "@/icons"
import { useUpdateBookMutation } from "@/store/api"

type Slot = 0 | 1

const WRITE_CONCURRENCY = 6

function bookPair(book: BookWithRelations): ColorPair | null {
  const swatches = coverSwatches(resolveCoverColors(book))
  if (!swatches.hasColors) return null
  return [swatches.primary.rgb, swatches.secondary.rgb]
}

function selectionColors(books: BookWithRelations[]): JsColor[] {
  const counts = new Map<string, { color: JsColor; count: number }>()

  for (const book of books) {
    for (const color of resolveCoverColors(book)) {
      const key = rgbToHex(color)
      const entry = counts.get(key)
      if (entry) entry.count += 1
      else counts.set(key, { color, count: 1 })
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 24)
    .map((entry) => entry.color)
}

export function BulkCoverColorsDialog({
  books,
  open,
  onOpenChange,
}: {
  books: BookWithRelations[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslation("BookActions.bulkCoverColors")
  const tColors = useTranslation("BookDetailsPage.coverColors")
  const c = useCommon()
  const [updateBook] = useUpdateBookMutation()

  const [slot, setSlot] = useState<Slot>(0)
  const [pair, setPair] = useState<ColorPair | null>(null)
  const [sourceUuid, setSourceUuid] = useState<string | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  const palette = useMemo(() => selectionColors(books), [books])

  const seeded = pair ?? books.map(bookPair).find(Boolean) ?? null

  const applyToAll = async (value: ColorPair | null) => {
    setIsApplying(true)
    try {
      const queue = [...books]
      const workers = Array.from(
        { length: Math.min(WRITE_CONCURRENCY, queue.length) },
        async () => {
          for (let next = queue.pop(); next; next = queue.pop()) {
            await updateBook({
              update: {
                uuid: next.uuid,
                coverColorsOverride: value ? [...value] : null,
              },
            }).unwrap()
          }
        },
      )
      await Promise.all(workers)
      toast.success(t("applied", { count: books.length }))
      onOpenChange(false)
    } catch {
      toast.error(t("failed"))
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { count: books.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <span className="text-muted-foreground mb-1.5 block text-xs">
              {t("copyFrom")}
            </span>
            <div className="max-h-40 overflow-y-auto">
              <div className="flex flex-wrap gap-2 p-0.5">
                {books.map((book) => {
                  const candidate = bookPair(book)
                  if (!candidate) return null

                  return (
                    <button
                      key={book.uuid}
                      type="button"
                      title={book.title}
                      aria-label={book.title}
                      aria-pressed={sourceUuid === book.uuid}
                      onClick={() => {
                        setSourceUuid(book.uuid)
                        setPair(candidate)
                      }}
                      className={cn(
                        "rounded-md ring-offset-2 ring-offset-(--color-background)",
                        sourceUuid === book.uuid && "ring-cover-accent ring-2",
                      )}
                    >
                      <Cover
                        book={book}
                        width={48}
                        interactive={false}
                        fill
                        className="h-16 w-12"
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {seeded && (
            <>
              <div className="grid max-w-xs grid-cols-2 gap-2">
                <ColorSwatch
                  color={seeded[0]}
                  label={tColors("primary")}
                  active={slot === 0}
                  onClick={() => {
                    setSlot(0)
                  }}
                />
                <ColorSwatch
                  color={seeded[1]}
                  label={tColors("secondary")}
                  active={slot === 1}
                  onClick={() => {
                    setSlot(1)
                  }}
                />
              </div>

              {palette.length > 0 && (
                <PaletteStrip
                  label={t("fromSelection")}
                  colors={palette}
                  current={seeded[slot]}
                  onPick={(color) => {
                    setSourceUuid(null)
                    setPair(
                      slot === 0 ? [color, seeded[1]] : [seeded[0], color],
                    )
                  }}
                />
              )}

              <ColorSourceRow
                value={seeded[slot]}
                onPick={(color) => {
                  setSourceUuid(null)
                  setPair(slot === 0 ? [color, seeded[1]] : [seeded[0], color])
                }}
                dropperLabel={tColors.plain("pickFromCover")}
              />
            </>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            disabled={isApplying}
            onClick={() => {
              void applyToAll(null)
            }}
          >
            <icon.Refresh className="mr-1 size-3.5" />
            {t("resetAll")}
          </Button>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={isApplying}
              onClick={() => {
                onOpenChange(false)
              }}
            >
              {c("actions.cancel")}
            </Button>
            <Button
              variant="cover"
              disabled={isApplying || !seeded}
              onClick={() => {
                if (seeded) void applyToAll(seeded)
              }}
            >
              {isApplying ? c("states.saving") : t("apply")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function selectionHasColors(books: BookWithRelations[]): boolean {
  return books.some((book) => resolveCoverColors(book).length > 0)
}
