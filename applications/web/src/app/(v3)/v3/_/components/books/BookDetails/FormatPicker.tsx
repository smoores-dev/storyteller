"use client"

import { ToggleGroup, ToggleGroupItem } from "@v3/_/components/ui/toggle-group"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { IconReadaloud } from "@/components/icons/IconReadaloud"
import { type BookWithRelations } from "@/database/books"
import * as icon from "@/icons"

export type BookFormat = "ebook" | "readaloud" | "audiobook"

export function FormatPicker({
  book,
  value,
  onValueChange,
  disabled = [],
}: {
  book: BookWithRelations
  value: BookFormat
  onValueChange: (format: BookFormat) => void
  disabled?: BookFormat[]
}) {
  const t = useTranslation("UploadDialog")
  const tDetails = useTranslation("BookDetailsPage")

  const formats = [
    {
      format: "ebook",
      Icon: icon.BookAlt,
      label: tDetails("fileInformation.ebook"),
    },
    {
      format: "readaloud",
      Icon: IconReadaloud,
      label: tDetails("fileInformation.readaloud"),
    },
    {
      format: "audiobook",
      Icon: icon.Headphones,
      label: tDetails("fileInformation.audiobook"),
    },
  ] as const

  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(next) => {
        const [format] = next as BookFormat[]
        if (format) onValueChange(format)
      }}
      aria-label={t.plain("formatLabel")}
      spacing={2}
      className="grid w-full grid-cols-3"
    >
      {formats.map(({ format, Icon, label }) => (
        <ToggleGroupItem
          key={format}
          value={format}
          variant="outline"
          disabled={disabled.includes(format)}
          className="aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary h-auto flex-col gap-1 rounded-lg px-2 py-3 whitespace-normal"
        >
          <Icon className="size-5" />
          <span className="text-sm">{label}</span>
          <span className="text-muted-foreground text-[0.625rem] font-normal">
            {book[format] ? t("formatReplaces") : t("formatNew")}
          </span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
