"use client"

import { type ReactNode, useMemo, useState } from "react"
import { useWatch } from "react-hook-form"

import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuTrigger,
} from "@v3/_/components/ui/filterable-menu"
import { useTranslation } from "@v3/_/hooks/use-translation"

import {
  type RelationItem,
  type RelationSource,
} from "@/app/(v3)/v3/_/hooks/use-relation-items"

import { useBookForm } from "./BookDetails/BookFormProvider"
import { type BookFormValues } from "./BookDetails/schema"
import {
  RelationAddButton,
  RelationChipEditor,
  type RelationChipItem,
} from "./RelationChipEditor"
import { RelationSelectList } from "./relation-picker/RelationSelectList"

export type RelationFieldName =
  | "authors"
  | "narrators"
  | "creators"
  | "tags"
  | "collections"
  | "series"

type Entry<N extends RelationFieldName> = BookFormValues[N][number]

type RelationFormFieldProps<N extends RelationFieldName, C> = {
  name: N
  source: RelationSource
  entryId: (entry: Entry<N>) => string
  itemId: (item: RelationItem) => string
  toChip: (entry: Entry<N>) => C
  entryFromPick: (item: RelationItem, current: Entry<N>[]) => Entry<N>
  createEntry?: (name: string, current: Entry<N>[]) => Entry<N> | null
  onCreate?: (name: string) => void
  createLabel?: (search: string) => string
  searchPlaceholder: string
  label?: string
  badgeVariant?: "outline" | "secondary"
  renderBadgeExtra?: (chip: C) => ReactNode
  className?: string
  children?: ReactNode
}

export function RelationFormField<
  N extends RelationFieldName,
  C extends RelationChipItem,
>({
  name,
  source,
  entryId,
  itemId,
  toChip,
  entryFromPick,
  createEntry,
  onCreate,
  createLabel,
  searchPlaceholder,
  label,
  badgeVariant = "outline",
  renderBadgeExtra,
  className,
  children,
}: RelationFormFieldProps<N, C>) {
  const { form } = useBookForm()
  const tLabels = useTranslation("Labels")

  const values = useWatch({
    control: form.control,
    name,
  }) as Entry<N>[]

  const mutate = (fn: (current: Entry<N>[]) => Entry<N>[]) => {
    const current = form.getValues(name) as Entry<N>[]
    form.setValue(name, fn(current) as never, { shouldDirty: true })
  }

  const applied = useMemo(() => new Set(values.map(entryId)), [values, entryId])
  const chips = useMemo(
    () => values.map((entry) => ({ ...toChip(entry), uuid: entryId(entry) })),
    [values, toChip, entryId],
  )

  const handlePick = (item: RelationItem) => {
    const id = itemId(item)
    mutate((current) =>
      current.some((entry) => entryId(entry) === id)
        ? current.filter((entry) => entryId(entry) !== id)
        : [...current, entryFromPick(item, current)],
    )
  }

  const handleCreate =
    onCreate ??
    (createEntry
      ? (created: string) => {
          mutate((current) => {
            const entry = createEntry(created, current)
            if (!entry) return current
            const id = entryId(entry)
            if (current.some((e) => entryId(e) === id)) return current
            return [...current, entry]
          })
        }
      : undefined)

  const defaultCreateLabel = (s: string) =>
    tLabels.plain("create.withInput", { input: `"${s}"` })

  const editor = (
    <RelationChipEditor
      items={chips}
      badgeVariant={badgeVariant}
      source={chipSource(source)}
      editMode
      emptyText=""
      canInteract
      onRemoveItem={(chip) => {
        mutate((current) =>
          current.filter((entry) => entryId(entry) !== chip.uuid),
        )
      }}
      renderBadgeExtra={renderBadgeExtra}
      className={className}
    >
      <RelationAddMenu
        source={source}
        applied={applied}
        itemId={itemId}
        onPick={handlePick}
        onCreate={handleCreate}
        createLabel={createLabel ?? defaultCreateLabel}
        searchPlaceholder={searchPlaceholder}
      />
      {children}
    </RelationChipEditor>
  )

  if (!label) return editor

  return (
    <div className="mt-3">
      <span className="text-tinted-subtle mb-1.5 block text-xs font-medium">
        {label}
      </span>
      {editor}
    </div>
  )
}

function RelationAddMenu({
  source,
  applied,
  itemId,
  onPick,
  onCreate,
  createLabel,
  searchPlaceholder,
}: {
  source: RelationSource
  applied: Set<string>
  itemId: (item: RelationItem) => string
  onPick: (item: RelationItem) => void
  onCreate?: (name: string) => void
  createLabel: (search: string) => string
  searchPlaceholder: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <FilterableMenu open={open} onOpenChange={setOpen}>
      <FilterableMenuTrigger render={<RelationAddButton />} />
      <FilterableMenuContent searchPlaceholder={searchPlaceholder}>
        <RelationSelectList
          source={source}
          enabled={open}
          stateOf={(item) => (applied.has(itemId(item)) ? "primary" : "none")}
          onSelect={onPick}
          create={onCreate ? { label: createLabel, onCreate } : undefined}
        />
      </FilterableMenuContent>
    </FilterableMenu>
  )
}

function chipSource(
  source: RelationSource,
): "tags" | "collections" | "series" | "creators" | "statuses" {
  switch (source) {
    case "tags":
      return "tags"
    case "collections":
      return "collections"
    case "series":
      return "series"
    case "statuses":
      return "statuses"
    default:
      return "creators"
  }
}
