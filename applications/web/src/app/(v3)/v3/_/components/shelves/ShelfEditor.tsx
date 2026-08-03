"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@v3/_/components/ui/button"
import { ColorPicker } from "@v3/_/components/ui/color-picker"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { IconPicker } from "@v3/_/components/ui/icon-picker"
import { Input } from "@v3/_/components/ui/input"
import { Label } from "@v3/_/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { Textarea } from "@v3/_/components/ui/textarea"
import { useDebounce } from "@v3/_/hooks/use-debounce"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { apiErrorMessage } from "@v3/_/lib/api-error"
import { cn } from "@v3/_/lib/utils"

import { type BookWithRelations } from "@/database/books"
import { type ShelfWithBooks } from "@/database/shelves"
import * as icon from "@/icons"
import {
  SHELF_ORDER_BY_FIELDS,
  type ShelfFilterNode,
  type ShelfOrderBy,
} from "@/shelves"
import { SORTABLE_FIELDS } from "@/sort"
import {
  getCoverUrl,
  useCreateUserShelfMutation,
  useGetBookQuery,
  useListInfiniteBooksInfiniteQuery,
  usePreviewShelfFilterMutation,
  useUpdateUserShelfMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

import {
  FilterPreview,
  ShelfFilterEditor,
  isFilterValid,
} from "./ShelfFilterEditor"

const shelfFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  orderBy: z.enum(SHELF_ORDER_BY_FIELDS),
  orderDirection: z.enum(["asc", "desc"]),
  limitCount: z.number().nullable(),
})

type ShelfFormValues = z.infer<typeof shelfFormSchema>

type ShelfEditorProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  shelf?: ShelfWithBooks | null
  onSaved?: (shelf: ShelfWithBooks) => void
  initialFilter?: ShelfFilterNode | null
  initialName?: string
  initialBooks?: string[]
}

type SelectionMode = "filter" | "manual"

export function ShelfEditor({
  open,
  onOpenChange,
  shelf,
  onSaved,
  initialFilter,
  initialName,
  initialBooks,
}: ShelfEditorProps) {
  const t = useTranslation("ShelfEditor")
  const c = useCommon()
  const isEditing = !!shelf

  const initialMode: SelectionMode =
    shelf?.filter !== null
      ? "filter"
      : shelf.books.length > 0
        ? "manual"
        : "filter"

  const [selectionMode, setSelectionMode] = useState<SelectionMode>(initialMode)

  const [filter, setFilter] = useState<ShelfFilterNode | null>(
    shelf?.filter ?? null,
  )

  const [selectedBookUuids, setSelectedBookUuids] = useState<string[]>(
    shelf?.books.map((b) => b.bookUuid) ?? initialBooks ?? [],
  )

  const initialBooksKey = initialBooks?.join(",") ?? ""

  const [shelfIcon, setShelfIcon] = useState<string | null>(shelf?.icon ?? null)
  const [shelfColor, setShelfColor] = useState<string | null>(
    shelf?.color ?? null,
  )

  const form = useForm<ShelfFormValues>({
    resolver: zodResolver(shelfFormSchema),
    defaultValues: {
      name: shelf?.name ?? "",
      description: shelf?.description ?? "",
      orderBy: shelf?.orderBy ?? "createdAt",
      orderDirection: shelf?.orderDirection ?? "desc",
      limitCount: shelf?.limitCount ?? null,
    },
  })

  useEffect(() => {
    if (open && shelf) {
      form.reset({
        name: shelf.name,
        description: shelf.description ?? "",
        orderBy: shelf.orderBy,
        orderDirection: shelf.orderDirection,
        limitCount: shelf.limitCount ?? null,
      })

      setFilter(shelf.filter ?? null)
      setSelectedBookUuids(shelf.books.map((b) => b.bookUuid))
      setShelfIcon(shelf.icon ?? null)
      setShelfColor(shelf.color ?? null)

      setSelectionMode(
        shelf.filter !== null
          ? "filter"
          : shelf.books.length > 0
            ? "manual"
            : "filter",
      )
    } else if (open && !shelf) {
      form.reset({
        name: initialName ?? "",
        description: "",
        orderBy: "createdAt",
        orderDirection: "desc",
        limitCount: null,
      })

      setFilter(initialFilter ?? null)
      setSelectedBookUuids(initialBooksKey ? initialBooksKey.split(",") : [])
      setShelfIcon(null)
      setShelfColor(null)
      setSelectionMode(initialBooksKey ? "manual" : "filter")
    }
  }, [open, shelf, form, initialFilter, initialName, initialBooksKey])

  const [createShelf, { isLoading: isCreating }] = useCreateUserShelfMutation()
  const [updateShelf, { isLoading: isUpdating }] = useUpdateUserShelfMutation()

  const isSaving = isCreating || isUpdating

  const handleSubmit = form.handleSubmit(async (data: ShelfFormValues) => {
    try {
      const payload = {
        name: data["name"].trim(),
        description: data["description"]?.trim() || null,
        filter: selectionMode === "filter" ? filter : null,
        orderBy: data["orderBy"],
        orderDirection: data["orderDirection"],
        limitCount: data["limitCount"],
        books: selectionMode === "manual" ? selectedBookUuids : [],
        icon: shelfIcon,
        color: shelfColor,
      }

      if (isEditing) {
        const updated = await updateShelf({
          uuid: shelf.uuid,
          ...payload,
        }).unwrap()

        onSaved?.(updated)
      } else {
        const created = await createShelf(payload).unwrap()
        onSaved?.(created)
      }

      onOpenChange(false)
    } catch (error) {
      toast.error("Failed to save shelf", {
        description: apiErrorMessage(error),
      })
    }
  })

  const handleModeChange = (mode: SelectionMode) => {
    setSelectionMode(mode)

    if (mode === "filter") {
      setSelectedBookUuids([])
    } else {
      setFilter(null)
    }
  }

  const addBook = (uuid: string) => {
    if (!selectedBookUuids.includes(uuid)) {
      setSelectedBookUuids([...selectedBookUuids, uuid])
    }
  }

  const removeBook = (uuid: string) => {
    setSelectedBookUuids(selectedBookUuids.filter((u) => u !== uuid))
  }

  const orderBy = useWatch({ control: form.control, name: "orderBy" })
  const orderDirection = useWatch({
    control: form.control,
    name: "orderDirection",
  })
  const limitCount = useWatch({ control: form.control, name: "limitCount" })

  const [previewBooks, setPreviewBooks] = useState<BookWithRelations[]>([])
  const [previewFilter, { isLoading: isLoadingPreview }] =
    usePreviewShelfFilterMutation()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filterValid = selectionMode === "filter" && isFilterValid(filter)

  const runPreview = useCallback(async () => {
    if (!filterValid) {
      setPreviewBooks([])
      return
    }

    if (!filter) return

    try {
      const books = await previewFilter({
        filter,
        orderBy,
        orderDirection,
        limit: limitCount ? Math.min(limitCount, 20) : undefined,
      }).unwrap()

      setPreviewBooks(books)
    } catch (error) {
      console.error("Failed to preview filter:", error)
    }
  }, [filter, filterValid, orderBy, orderDirection, limitCount, previewFilter])

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      void runPreview()
    }, 400)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [runPreview])

  const hasNonDefaultSort =
    orderBy !== "createdAt" || orderDirection !== "desc" || limitCount !== null

  // the full registry sort vocabulary (same as the books-page SortControl),
  // labelled from the shared Common.fields.label bundle.
  const orderByOptions = useMemo(() => {
    return SORTABLE_FIELDS.map((key) => ({
      value: key,
      label: c.plain(`fields.label.${key}` as "fields.label.title"),
    })) satisfies { value: ShelfOrderBy; label: string }[]
  }, [c])

  const orderDirectionOptions = useMemo(() => {
    return (["desc", "asc"] as const).map((key) => ({
      value: key,
      label: t.plain(`orderDirection.${key}` as "orderDirection.desc"),
    })) satisfies { value: "asc" | "desc"; label: string }[]
  }, [t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        forceRender={true}
        className="top-10 max-h-[90vh] translate-y-0 overflow-x-hidden overflow-y-auto sm:max-w-xl lg:max-w-4xl"
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? t.plain("editTitle") : t.plain("createTitle")}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? t.plain("editDescription")
                : t.plain("createDescription")}
            </DialogDescription>
          </DialogHeader>

          <div
            className={cn(
              "flex flex-col gap-4 py-4",
              selectionMode === "filter" &&
                "lg:grid lg:grid-cols-[1fr_14rem] lg:gap-6",
            )}
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="shelf-name">{t.plain("name")}</Label>
                <Input
                  id="shelf-name"
                  {...form.register("name")}
                  placeholder={t.plain("namePlaceholder")}
                />
                {form.formState.errors.name && (
                  <span className="text-destructive text-xs">
                    {t.plain("nameRequired")}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="shelf-description">
                  {t.plain("description")}
                </Label>
                <Textarea
                  id="shelf-description"
                  {...form.register("description")}
                  placeholder={t.plain("descriptionPlaceholder")}
                  rows={2}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{t.plain("iconAndColor")}</Label>
                <div className="flex items-center gap-2">
                  <IconPicker
                    value={shelfIcon}
                    onChange={setShelfIcon}
                    color={shelfColor}
                  />
                  <ColorPicker value={shelfColor} onChange={setShelfColor} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label>{t.plain("bookSelection")}</Label>

                  <div className="flex items-center gap-2">
                    {filter !== null && selectionMode === "filter" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFilter(null)
                        }}
                        className="h-6 gap-1 text-xs"
                      >
                        <icon.Close className="size-3" />
                        {t.plain("clearFilter")}
                      </Button>
                    )}

                    <div className="bg-muted flex rounded-md p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          handleModeChange("filter")
                        }}
                        className={`rounded px-2 py-1 text-xs transition-colors ${
                          selectionMode === "filter"
                            ? "bg-background shadow-sm"
                            : "text-muted-foreground"
                        }`}
                      >
                        {t.plain("dynamicFilter")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleModeChange("manual")
                        }}
                        className={`rounded px-2 py-1 text-xs transition-colors ${
                          selectionMode === "manual"
                            ? "bg-background shadow-sm"
                            : "text-muted-foreground"
                        }`}
                      >
                        {t.plain("manual")}
                      </button>
                    </div>
                  </div>
                </div>

                {selectionMode === "filter" && (
                  <ShelfFilterEditor filter={filter} onChange={setFilter} />
                )}

                {selectionMode === "manual" && (
                  <div className="flex flex-col gap-2">
                    {selectedBookUuids.length > 0 && (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedBookUuids([])
                          }}
                          className="h-6 gap-1 text-xs"
                        >
                          <icon.Close className="size-3" />
                          {t.plain("clearSelection")}
                        </Button>
                      </div>
                    )}

                    <BookSelector
                      selectedBookUuids={selectedBookUuids}
                      onAdd={addBook}
                      onRemove={removeBook}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label>{t.plain("sortAndLimit")}</Label>

                  {hasNonDefaultSort && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        form.setValue("orderBy", "createdAt")
                        form.setValue("orderDirection", "desc")
                        form.setValue("limitCount", null)
                      }}
                      className="h-6 gap-1 text-xs"
                    >
                      <icon.Close className="size-3" />
                      {c.plain("actions.reset")}
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-muted-foreground text-xs">
                      {t.plain("sortBy")}
                    </Label>
                    <Select
                      value={orderBy}
                      onValueChange={(v) => {
                        if (!v) return
                        form.setValue("orderBy", v)
                      }}
                      items={orderByOptions}
                    >
                      <SelectTrigger className="h-7 w-[130px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {orderByOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Select
                    value={orderDirection}
                    onValueChange={(v) => {
                      form.setValue("orderDirection", v as "asc" | "desc")
                    }}
                    items={orderDirectionOptions}
                  >
                    <SelectTrigger className="h-7 w-[100px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {orderDirectionOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-1.5">
                    <Label className="text-muted-foreground text-xs">
                      {t.plain("limit")}
                    </Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      className="h-7 w-16 text-xs"
                      value={limitCount ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value

                        if (raw === "") {
                          form.setValue("limitCount", null)
                          return
                        }

                        const parsed = parseInt(raw, 10)
                        if (!isNaN(parsed)) {
                          form.setValue("limitCount", parsed)
                        }
                      }}
                      placeholder={t.plain("limitAll")}
                    />
                  </div>
                </div>
              </div>
            </div>

            {selectionMode === "filter" && (
              <aside className="border-border lg:border-l lg:pl-4">
                <FilterPreview
                  books={previewBooks}
                  isLoading={isLoadingPreview}
                  isInvalid={!filterValid}
                />
              </aside>
            )}
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
              {c.plain("actions.cancel")}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <icon.Loader className="mr-2 size-4 animate-spin" />}
              {isEditing ? c.plain("actions.save") : c.plain("actions.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type BookSelectorProps = {
  selectedBookUuids: string[]
  onAdd: (uuid: string) => void
  onRemove: (uuid: string) => void
}

export function BookSelector({
  selectedBookUuids,
  onAdd,
  onRemove,
}: BookSelectorProps) {
  const t = useTranslation("ShelfEditor")
  const c = useCommon()
  const [searchQuery, setSearchQuery] = useState("")
  const debouncedSearch = useDebounce(searchQuery.trim(), 200)

  const { data: searchData, isFetching: isLoading } =
    useListInfiniteBooksInfiniteQuery(
      { limit: 10, search: debouncedSearch },
      { skip: !debouncedSearch },
    )

  const searchResults = useMemo(() => {
    if (!debouncedSearch) return []
    return (searchData?.pages[0] ?? []).filter(
      (book) => !selectedBookUuids.includes(book.uuid),
    )
  }, [searchData, debouncedSearch, selectedBookUuids])

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <icon.Search className="text-muted-foreground absolute top-1/2 left-2 size-4 -translate-y-1/2" />
        <Input
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
          }}
          placeholder={t.plain("searchBooks")}
          className="pl-8"
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <icon.Loader className="size-4 animate-spin" />
        </div>
      )}

      {searchQuery.trim() && searchResults.length === 0 && !isLoading && (
        <div className="text-muted-foreground py-2 text-center text-sm">
          {t.plain("noBooksFound")}
        </div>
      )}

      {searchResults.length > 0 && (
        <div className="scroll-y flex max-h-[140px] flex-col gap-0.5">
          {searchResults.map((book) => (
            <BookListItem
              key={book.uuid}
              book={book}
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => {
                    onAdd(book.uuid)
                  }}
                >
                  <icon.Add className="size-3" />
                </Button>
              }
            />
          ))}
        </div>
      )}

      {selectedBookUuids.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label className="text-muted-foreground text-xs">
            {c.plain("selectedCount", { count: selectedBookUuids.length })}
          </Label>

          <div className="scroll-y flex max-h-[140px] flex-col gap-0.5">
            {selectedBookUuids.map((uuid) => (
              <SelectedBookItem
                key={uuid}
                uuid={uuid as UUID}
                onRemove={onRemove}
              />
            ))}
          </div>
        </div>
      )}

      {selectedBookUuids.length === 0 && !searchQuery.trim() && (
        <div className="text-muted-foreground py-2 text-center text-xs">
          {t.plain("searchToAdd")}
        </div>
      )}
    </div>
  )
}

function SelectedBookItem({
  uuid,
  onRemove,
}: {
  uuid: UUID
  onRemove: (uuid: string) => void
}) {
  const { data: book } = useGetBookQuery({ uuid })

  if (!book) return null

  return (
    <BookListItem
      book={book}
      action={
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            onRemove(book.uuid)
          }}
        >
          <icon.Close className="size-3" />
        </Button>
      }
    />
  )
}

type BookListItemProps = {
  book: BookWithRelations
  action: React.ReactNode
}

function BookListItem({ book, action }: BookListItemProps) {
  const authorNames = book.authors.map((a) => a.name).join(", ")

  return (
    <div className="hover:bg-muted/50 flex items-center gap-2 rounded-md py-1 pr-1 pl-1">
      <img
        src={getCoverUrl(book.uuid, { height: 32, updatedAt: book.updatedAt })}
        alt=""
        className="h-8 w-6 rounded object-cover"
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{book.title}</div>
        {authorNames && (
          <div className="text-muted-foreground truncate text-xs">
            {authorNames}
          </div>
        )}
      </div>

      {action}
    </div>
  )
}
