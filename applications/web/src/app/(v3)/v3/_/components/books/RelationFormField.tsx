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

// the book-form fields that hold a list of related entities
export type RelationFieldName =
  | "authors"
  | "narrators"
  | "tags"
  | "collections"
  | "series"

type Entry<N extends RelationFieldName> = BookFormValues[N][number]

type RelationFormFieldProps<N extends RelationFieldName, C> = {
  name: N
  source: RelationSource
  /** stable identity of a form entry (name for name-lists, uuid otherwise) */
  entryId: (entry: Entry<N>) => string
  /** identity of a picker item, comparable against entryId */
  itemId: (item: RelationItem) => string
  /** chip for an entry; its uuid is overridden with entryId for removal */
  toChip: (entry: Entry<N>) => C
  /** form entry for a picked item (`current` for e.g. featured-when-first) */
  entryFromPick: (item: RelationItem, current: Entry<N>[]) => Entry<N>
  /**
   * form entry for a created-by-name item; return null to ignore (duplicate).
   * omit together with onCreate to disable creation.
   */
  createEntry?: (name: string, current: Entry<N>[]) => Entry<N> | null
  /** replaces createEntry when creation needs a flow (collection dialog) */
  onCreate?: (name: string) => void
  createLabel?: (search: string) => string
  searchPlaceholder: string
  /** small uppercase label above the chips (authors/narrators use it) */
  label?: string
  badgeVariant?: "outline" | "secondary"
  renderBadgeExtra?: (chip: C) => ReactNode
  className?: string
  /** extra nodes rendered alongside the add menu (e.g. a create dialog) */
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
    // rhf cannot relate BookFormValues[N] to its conditional FieldPathValue
    // for a generic N, so the value is cast; N is a plain top-level key.
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
      <span className="text-muted-foreground mb-1.5 block text-xs font-medium uppercase">
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

// RelationChipEditor's `source` prop only feeds a group css class; authors and
// narrators both live under the "creators" group.
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
