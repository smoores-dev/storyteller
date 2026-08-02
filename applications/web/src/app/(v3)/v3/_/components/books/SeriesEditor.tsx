import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { useBookForm } from "./BookDetails/BookFormProvider"
import { RelationFormField } from "./RelationFormField"

function seriesKey(s: { uuid?: string; name: string }): string {
  return s.uuid ?? `new:${s.name}`
}

export function SeriesEditor({ className }: { className?: string }) {
  const { form } = useBookForm()
  const tActions = useTranslation("BookActions")
  const c = useCommon()

  const setPosition = (key: string, position: number | null) => {
    const current = form.getValues("series")
    form.setValue(
      "series",
      current.map((s) => (seriesKey(s) === key ? { ...s, position } : s)),
      { shouldDirty: true },
    )
  }

  return (
    <RelationFormField
      name="series"
      source="series"
      entryId={seriesKey}
      label={c("fields.label.series")}
      itemId={(item) => item.uuid}
      toChip={(s) => ({
        uuid: seriesKey(s),
        name: s.name,
        position: s.position,
      })}
      entryFromPick={(item, current) => ({
        uuid: item.uuid,
        name: item.name,
        position: null,
        featured: current.length === 0,
      })}
      createEntry={(name, current) =>
        current.some((s) => s.name === name)
          ? null
          : { name, position: null, featured: current.length === 0 }
      }
      badgeVariant="outline"
      searchPlaceholder={tActions.plain("search")}
      className={className}
      renderBadgeExtra={(chip) => (
        <span className="relative z-10 flex items-center gap-0.5">
          <span aria-hidden>#</span>
          <input
            type="number"
            step="any"
            value={chip.position ?? ""}
            aria-label="Series position"
            onClick={(e) => {
              e.stopPropagation()
            }}
            onChange={(e) => {
              const v = e.target.value.trim()
              setPosition(chip.uuid, v === "" ? null : Number(v))
            }}
            className={cn(
              "w-8 border-b border-dashed bg-transparent text-center outline-none",
              "focus-visible:border-solid",
              "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
            )}
          />
        </span>
      )}
    />
  )
}
