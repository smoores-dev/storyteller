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
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuItem,
  FilterableMenuTrigger,
} from "../ui/filterable-menu"

import {
  FilterPreview,
  ShelfFilterEditor,
  hasUnknownFields,
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
      toast.error(apiErrorMessage(error) ?? "Failed to preview filter")
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

  const orderByOptions = useMemo(() => {
    return SORTABLE_FIELDS.map((key) => ({
      value: key,
      label: c.plain(`fields.label.${key}` as "fields.label.title"),

      icon: <icon.FieldIcon field={key} variant="base" />,
    })) satisfies { value: ShelfOrderBy; label: string }[]
  }, [c])

  const currentOrderOption = orderByOptions.find((o) => o.value === orderBy)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        forceRender={true}
        className="top-10 flex max-h-[90vh] translate-y-0 flex-col overflow-hidden sm:max-w-xl lg:max-w-4xl"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="shrink-0">
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
              "min-h-0 flex-1 gap-4 overflow-x-hidden overflow-y-auto py-4",
              selectionMode === "filter"
                ? "flex flex-col lg:grid lg:grid-cols-[1fr_14rem] lg:gap-6"
                : "flex flex-col",
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
                    <FilterableMenu
                    // value={orderBy}
                    // items={orderByOptions}
                    // onValueChange={(v) => {
                    //   if (!v) return
                    //   form.setValue("orderBy", v as ShelfOrderBy)
                    // }}
                    >
                      <FilterableMenuTrigger
                        className="flex h-7 text-xs"
                        render={
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-2 text-xs"
                          >
                            {currentOrderOption?.icon}
                            {currentOrderOption?.label}
                            {orderDirection === "asc" ? (
                              <icon.ArrowUp className="size-3" />
                            ) : (
                              <icon.ArrowDown className="size-3" />
                            )}
                          </Button>
                        }
                      />
                      <FilterableMenuContent>
                        {orderByOptions.map((o) => (
                          <FilterableMenuItem
                            key={o.value}
                            icon={o.icon}
                            closeOnClick={false}
                            onSelect={() => {
                              form.setValue("orderBy", o.value as ShelfOrderBy)
                              if (orderBy === o.value) {
                                if (orderDirection === "asc") {
                                  form.setValue("orderDirection", "desc")
                                } else {
                                  form.setValue("orderDirection", "asc")
                                }
                              } else {
                                form.setValue("orderDirection", "desc")
                              }
                            }}
                          >
                            {o.label}
                            {currentOrderOption?.value === o.value &&
                              (orderDirection === "asc" ? (
                                <icon.ArrowUp className="size-3" />
                              ) : (
                                <icon.ArrowDown className="size-3" />
                              ))}
                          </FilterableMenuItem>
                        ))}
                      </FilterableMenuContent>
                    </FilterableMenu>
                  </div>

                  {/* <Select
                    value={orderDirection}
                    onValueChange={(v) => {
                      form.setValue("orderDirection", v as "asc" | "desc")
                    }}
                    items={orderDirectionOptions}
                  >
                    <SelectTrigger className="h-7 w-fit text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="w-fit">
                      {orderDirectionOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select> */}

                  <div className="flex items-center gap-1.5">
                    <Label className="text-muted-foreground text-xs">
                      {t.plain("limit")}
                    </Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      className="h-7 w-fit text-xs"
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
                  hasUnknownFields={hasUnknownFields(filter)}
                />
              </aside>
            )}
          </div>

          <DialogFooter className="bg-background shrink-0 border-t pt-3">
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
