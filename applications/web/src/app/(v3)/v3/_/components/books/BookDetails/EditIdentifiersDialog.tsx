"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@v3/_/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuItem,
  FilterableMenuSeparator,
  FilterableMenuTrigger,
} from "@v3/_/components/ui/filterable-menu"
import { Input } from "@v3/_/components/ui/input"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import {
  type BookWithRelations,
  type IdentifierRelation,
} from "@/database/books"
import {
  getCoreIdentifier,
  validateIdentifier,
} from "@/database/identifierKinds"
import * as icon from "@/icons"
import {
  useCreateIdentifierTypeMutation,
  useListIdentifierTypesQuery,
  useUpdateBookIdentifiersMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

const NEW_TYPE = "__new__"

type Format = "ebook" | "audiobook" | "readaloud"

const FORMAT_COLUMNS = {
  ebook: "ebookUuid",
  audiobook: "audiobookUuid",
  readaloud: "readaloudUuid",
} as const satisfies Record<Format, keyof IdentifierRelation>

type Row = {
  id: number
  typeUuid: string
  newTypeName: string
  value: string
}

export function EditIdentifiersDialog({
  book,
  format,
  formatLabel,
  open,
  onOpenChange,
}: {
  book: BookWithRelations
  format: Format
  formatLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslation("BookDetailsPage")
  const c = useCommon()

  const { data: types = [] } = useListIdentifierTypesQuery(undefined, {
    skip: !open,
  })
  const [createType] = useCreateIdentifierTypeMutation()
  const [updateIdentifiers, { isLoading: isSaving }] =
    useUpdateBookIdentifiersMutation()

  const nextId = useRef(0)
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    if (!open) return
    const current = book[format]?.identifiers ?? []
    setRows(
      current.map((identifier) => ({
        id: nextId.current++,
        typeUuid: identifier.uuid,
        newTypeName: "",
        value: identifier.value,
      })),
    )
  }, [open, book, format])

  const typeItems = useMemo(
    () =>
      types.map((type) => ({
        value: type.uuid as string,
        label: getCoreIdentifier(type.kind)?.displayName ?? type.name,
      })),
    [types],
  )

  const typeByUuid = useMemo(
    () =>
      new Map<string, (typeof types)[number]>(
        types.map((type) => [type.uuid, type]),
      ),
    [types],
  )

  const patchRow = useCallback((id: number, patch: Partial<Row>) => {
    setRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }, [])

  const addRow = useCallback(() => {
    setRows((rows) => [
      ...rows,
      { id: nextId.current++, typeUuid: "", newTypeName: "", value: "" },
    ])
  }, [])

  const removeRow = useCallback((id: number) => {
    setRows((rows) => rows.filter((row) => row.id !== id))
  }, [])

  const rowError = useCallback(
    (row: Row): string | null => {
      if (!row.value.trim()) return null
      const type = typeByUuid.get(row.typeUuid)
      if (!type?.kind) return null
      if (validateIdentifier({ kind: type.kind }, row.value)) return null
      const name = getCoreIdentifier(type.kind)?.displayName ?? type.name
      return t.plain("identifiers.invalidValue", { name })
    },
    [typeByUuid, t],
  )

  const isRowComplete = (row: Row) =>
    !!row.value.trim() &&
    (row.typeUuid === NEW_TYPE ? !!row.newTypeName.trim() : !!row.typeUuid)

  const canSave =
    rows.every((row) => isRowComplete(row) && !rowError(row)) && !isSaving

  const handleSave = useCallback(async () => {
    const formatRow = book[format]
    if (!formatRow) return

    const resolvedNewTypes = new Map<string, UUID>()
    for (const row of rows) {
      if (row.typeUuid !== NEW_TYPE) continue
      const name = row.newTypeName.trim()
      const key = name.toLowerCase()
      if (resolvedNewTypes.has(key)) continue

      const existing = types.find((type) => type.name.toLowerCase() === key)
      if (existing) {
        resolvedNewTypes.set(key, existing.uuid)
        continue
      }

      const created = await createType({ name }).unwrap()
      resolvedNewTypes.set(key, created.uuid)
    }

    const next: IdentifierRelation[] = []
    const seen = new Set<string>()
    const push = (relation: IdentifierRelation) => {
      const key = [
        relation.identifierTypeUuid,
        relation.value,
        relation.ebookUuid ?? "",
        relation.audiobookUuid ?? "",
        relation.readaloudUuid ?? "",
      ].join("|")
      if (seen.has(key)) return
      seen.add(key)
      next.push(relation)
    }

    for (const identifier of book.identifiers) {
      push({ identifierTypeUuid: identifier.uuid, value: identifier.value })
    }

    for (const other of ["ebook", "audiobook", "readaloud"] as const) {
      if (other === format) continue
      const relation = book[other]
      if (!relation) continue
      for (const identifier of relation.identifiers) {
        push({
          identifierTypeUuid: identifier.uuid,
          value: identifier.value,
          [FORMAT_COLUMNS[other]]: relation.uuid,
        })
      }
    }

    for (const row of rows) {
      const typeUuid =
        row.typeUuid === NEW_TYPE
          ? resolvedNewTypes.get(row.newTypeName.trim().toLowerCase())
          : (row.typeUuid as UUID)
      if (!typeUuid) continue

      push({
        identifierTypeUuid: typeUuid,
        value: row.value.trim(),
        [FORMAT_COLUMNS[format]]: formatRow.uuid,
      })
    }

    await updateIdentifiers({ bookUuid: book.uuid, identifiers: next }).unwrap()
    onOpenChange(false)
  }, [book, format, rows, types, createType, updateIdentifiers, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("identifiers.edit")}</DialogTitle>
          <DialogDescription>
            {t("identifiers.editDescription", { format: formatLabel })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-4">
          {rows.length === 0 && (
            <p className="text-muted-foreground py-2 text-center text-sm">
              {t("identifiers.empty")}
            </p>
          )}

          {rows.map((row) => {
            const error = rowError(row)

            return (
              <div key={row.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <IdentifierTypeMenu
                    items={typeItems}
                    value={row.typeUuid}
                    placeholder={t.plain("identifiers.type")}
                    newTypeLabel={t.plain("identifiers.newType")}
                    onChange={(typeUuid) => {
                      patchRow(row.id, { typeUuid })
                    }}
                  />

                  <Input
                    value={row.value}
                    onChange={(e) => {
                      patchRow(row.id, { value: e.target.value })
                    }}
                    placeholder={t.plain("identifiers.value")}
                    aria-label={t.plain("identifiers.value")}
                    aria-invalid={!!error}
                    className="h-7 flex-1 font-mono text-xs"
                  />

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground shrink-0"
                    aria-label={c.plain("actions.remove")}
                    onClick={() => {
                      removeRow(row.id)
                    }}
                  >
                    <icon.Close className="size-3.5" />
                  </Button>
                </div>

                {row.typeUuid === NEW_TYPE && (
                  <Input
                    value={row.newTypeName}
                    onChange={(e) => {
                      patchRow(row.id, { newTypeName: e.target.value })
                    }}
                    placeholder={t.plain("identifiers.newTypeName")}
                    aria-label={t.plain("identifiers.newTypeName")}
                    className="h-7 w-40 text-xs"
                  />
                )}

                {error && <p className="text-destructive text-xs">{error}</p>}
              </div>
            )
          })}

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground w-fit"
            onClick={addRow}
          >
            <icon.Plus className="mr-1 size-3.5" />
            {t("identifiers.add")}
          </Button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false)
            }}
            disabled={isSaving}
          >
            {c("actions.cancel")}
          </Button>

          <Button
            type="button"
            disabled={!canSave}
            onClick={() => {
              void handleSave()
            }}
          >
            {isSaving ? c("states.saving") : c("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function IdentifierTypeMenu({
  items,
  value,
  placeholder,
  newTypeLabel,
  onChange,
}: {
  items: { value: string; label: string }[]
  value: string
  placeholder: string
  newTypeLabel: string
  onChange: (value: string) => void
}) {
  const current = items.find((item) => item.value === value)
  const label =
    value === NEW_TYPE ? newTypeLabel : current?.label ?? placeholder

  return (
    <FilterableMenu>
      <FilterableMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={placeholder}
            className="bg-input/20 dark:bg-input/30 border-input w-40 shrink-0 justify-between rounded-md font-normal"
          >
            <span
              className={cn("truncate", !current && "text-muted-foreground")}
            >
              {label}
            </span>
            <icon.ChevronDown className="size-3 shrink-0" />
          </Button>
        }
      />
      <FilterableMenuContent align="start" searchable={items.length > 8}>
        {items.map((item) => (
          <FilterableMenuItem
            key={item.value}
            textValue={item.label}
            onSelect={() => {
              onChange(item.value)
            }}
          >
            {item.label}
            {item.value === value && <icon.Check className="ml-auto" />}
          </FilterableMenuItem>
        ))}

        <FilterableMenuSeparator />

        <FilterableMenuItem
          textValue={newTypeLabel}
          icon={<icon.Add className="size-3.5" />}
          onSelect={() => {
            onChange(NEW_TYPE)
          }}
        >
          {newTypeLabel}
        </FilterableMenuItem>
      </FilterableMenuContent>
    </FilterableMenu>
  )
}
