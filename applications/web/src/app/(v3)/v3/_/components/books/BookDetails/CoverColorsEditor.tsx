"use client"

import { useState } from "react"
import { useWatch } from "react-hook-form"

import { type JsColor } from "@storyteller-platform/okmain"

import { Cover } from "@v3/_/components/books/Cover"
import {
  type ColorPair,
  ColorSourceRow,
  ColorSwatch,
  PaletteStrip,
  coverPalettes,
  sameColor,
} from "@v3/_/components/books/coverColorPicker"
import { WIDTH_BOUND_SLOT } from "@v3/_/components/books/coverFit"
import {
  coverSwatches,
  resolveCoverColors,
} from "@v3/_/components/books/coverSwatches"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@v3/_/components/ui/popover"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { type BookWithRelations } from "@/database/books"
import * as icon from "@/icons"

import { useBookForm } from "./BookFormProvider"

type Slot = 0 | 1

function coverDerivedPair(book: BookWithRelations): ColorPair | null {
  const swatches = coverSwatches(
    resolveCoverColors({ ...book, coverColorsOverride: null }),
  )
  if (!swatches.hasColors) return null
  return [swatches.primary.rgb, swatches.secondary.rgb]
}

function PalettePicker({
  book,
  slot,
  value,
  onPick,
  onSlotChange,
}: {
  book: BookWithRelations
  slot: Slot
  value: ColorPair
  onPick: (color: JsColor) => void
  onSlotChange: (slot: Slot) => void
}) {
  const t = useTranslation("BookDetailsPage.coverColors")
  const palettes = coverPalettes(book, (type) => t.plain(`formats.${type}`))

  return (
    <div className="flex w-72 flex-col gap-3">
      <div className="bg-cover-well flex items-center justify-center rounded-md p-3">
        <div style={{ width: 132 }}>
          <Cover
            book={book}
            width={132}
            interactive={false}
            slotAspect={WIDTH_BOUND_SLOT}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ColorSwatch
          color={value[0]}
          label={t("primary")}
          active={slot === 0}
          onClick={() => {
            onSlotChange(0)
          }}
        />
        <ColorSwatch
          color={value[1]}
          label={t("secondary")}
          active={slot === 1}
          onClick={() => {
            onSlotChange(1)
          }}
        />
      </div>

      {palettes.map((palette) => (
        <PaletteStrip
          key={palette.type}
          label={palette.label}
          colors={palette.colors}
          current={value[slot]}
          onPick={onPick}
        />
      ))}

      <ColorSourceRow
        value={value[slot]}
        onPick={onPick}
        dropperLabel={t.plain("pickFromCover")}
      />
    </div>
  )
}

export function CoverColorsEditor({ book }: { book: BookWithRelations }) {
  const { form, canEdit } = useBookForm()
  const t = useTranslation("BookDetailsPage.coverColors")

  const override = useWatch({
    control: form.control,
    name: "coverColorsOverride",
  })

  const [slot, setSlot] = useState<Slot>(0)
  const [open, setOpen] = useState(false)

  const derived = coverDerivedPair(book)
  const pair = override ?? derived
  if (!pair) return null

  const setColor = (index: Slot, color: JsColor) => {
    form.setValue(
      "coverColorsOverride",
      index === 0 ? [color, pair[1]] : [pair[0], color],
      { shouldDirty: true },
    )
  }

  const slots: { slot: Slot; label: string }[] = [
    { slot: 0, label: t("primary") },
    { slot: 1, label: t("secondary") },
  ]

  return (
    <div className="w-full max-w-md">
      <div className="section-label mb-2 flex items-center gap-1.5">
        <icon.Palette className="size-3.5 stroke-[1.5]" />
        {t("title")}

        {override && (
          <TooltipButton
            type="button"
            variant="real-ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground ml-auto"
            tooltip={t.plain("resetHint")}
            aria-label={t.plain("reset")}
            onClick={() => {
              form.setValue("coverColorsOverride", null, { shouldDirty: true })
            }}
          >
            <icon.Refresh className="size-3.5" />
          </TooltipButton>
        )}
      </div>

      {/* one popover per slot, so the panel anchors to the swatch the user
          reached for and a click is what makes that slot the active one */}
      <div className="grid grid-cols-2 gap-2">
        {slots.map((entry) => (
          <Popover
            key={entry.slot}
            open={open && slot === entry.slot}
            onOpenChange={(next) => {
              if (!canEdit) return
              setOpen(next)
              if (next) setSlot(entry.slot)
            }}
          >
            <PopoverTrigger
              render={
                <ColorSwatch
                  color={pair[entry.slot]}
                  label={entry.label}
                  active={open && slot === entry.slot}
                  marked={
                    !!override &&
                    (!derived ||
                      !sameColor(override[entry.slot], derived[entry.slot]))
                  }
                  onClick={() => {
                    setSlot(entry.slot)
                  }}
                />
              }
            />

            <PopoverContent align="start" className="w-auto p-3">
              <PalettePicker
                book={book}
                slot={entry.slot}
                value={pair}
                onPick={(color) => {
                  setColor(entry.slot, color)
                }}
                onSlotChange={setSlot}
              />
            </PopoverContent>
          </Popover>
        ))}
      </div>
    </div>
  )
}
