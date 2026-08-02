"use client"

import { Fragment, type ReactNode, useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@v3/_/components/ui/button"
import {
  ConfirmDialog,
  useConfirmAction,
} from "@v3/_/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@v3/_/components/ui/radio-group"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { useProcessingRun } from "@/app/(v3)/v3/_/components/books/BookDetails/useProcessingRun"
import { CreateCollectionDialog } from "@/app/(v3)/v3/_/components/books/CreateCollectionDialog"
import { CreateSeriesDialog } from "@/app/(v3)/v3/_/components/books/CreateSeriesDialog"
import { CreateTagDialog } from "@/app/(v3)/v3/_/components/books/CreateTagDialog"
import { DeleteBooksDialog } from "@/app/(v3)/v3/_/components/books/DeleteBooksDialog"
import {
  RelationEditList,
  membershipFromBooks,
} from "@/app/(v3)/v3/_/components/books/relation-picker/RelationEditList"
import {
  type ActivationModifiers,
  FilterableMenuItem,
  FilterableMenuSeparator,
  FilterableMenuSub,
  FilterableMenuSubContent,
  FilterableMenuSubTrigger,
} from "@/app/(v3)/v3/_/components/ui/filterable-menu"
import { type BookWithRelations, type CreatorRelation } from "@/database/books"
import { usePermissions } from "@/hooks/usePermissions"
import * as icon from "@/icons"
import {
  useAddBooksToCollectionsMutation,
  useBulkRelocateToInternalMutation,
  useClearBooksCacheMutation,
  useDeleteBooksMutation,
  useGetCurrentUserQuery,
  useMergeBooksMutation,
  useProcessBookMutation,
  useRelocateToInternalMutation,
  useScanBooksMutation,
  useUpgradeBookEpubMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

type Mode = "single" | "bulk"

export type BookActionEntry = {
  key: string
  label: string
  icon?: ReactNode
  keywords?: string
  onSelect?: (modifiers?: ActivationModifiers) => void
  submenu?: ReactNode | ((ctx: { close: () => void }) => ReactNode)
  // submenus holding a relation list want their own search box
  submenuSearchable?: boolean
  submenuSearchPlaceholder?: string
  variant?: "destructive"
  separatorBefore?: boolean
  disabled?: boolean
}

const actionRowClassName =
  "focus:bg-accent hover:bg-accent flex min-h-7 w-full cursor-default items-center gap-2 rounded-md px-2 py-1 text-left text-xs/relaxed outline-hidden select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5"

export function ActionEntryList({ entries }: { entries: BookActionEntry[] }) {
  return (
    <>
      {entries.map((entry) => (
        <Fragment key={entry.key}>
          {entry.separatorBefore && <FilterableMenuSeparator />}
          {entry.submenu ? (
            <FilterableMenuSub>
              <FilterableMenuSubTrigger
                icon={entry.icon}
                textValue={entry.label}
                keywords={entry.keywords}
                disabled={entry.disabled}
              >
                {entry.label}
              </FilterableMenuSubTrigger>
              <FilterableMenuSubContent
                searchable={entry.submenuSearchable}
                searchPlaceholder={entry.submenuSearchPlaceholder}
              >
                {entry.submenu}
              </FilterableMenuSubContent>
            </FilterableMenuSub>
          ) : (
            <FilterableMenuItem
              icon={entry.icon}
              textValue={entry.label}
              keywords={entry.keywords}
              variant={entry.variant}
              disabled={entry.disabled}
              onSelect={entry.onSelect}
            >
              {entry.label}
            </FilterableMenuItem>
          )}
        </Fragment>
      ))}
    </>
  )
}

export function useBookActionItems({
  books,
  mode,
  onAfterDestructive,
}: {
  books: BookWithRelations[]
  mode: Mode
  onAfterDestructive?: () => void
}) {
  const t = useTranslation("BookActions")
  const tp = useTranslation("Processing")
  const c = useCommon()
  const permissions = usePermissions()
  const canUpdate = !!permissions?.bookUpdate
  const canDelete = !!permissions?.bookDelete
  const canProcess = !!permissions?.bookProcess
  const canCreateCollection = !!permissions?.collectionCreate

  const bookUuids = books.map((b) => b.uuid)
  const count = books.length

  const { data: currentUser } = useGetCurrentUserQuery()

  const [addToCollections] = useAddBooksToCollectionsMutation()
  const [scanBooks] = useScanBooksMutation()
  const [processBook] = useProcessBookMutation()
  const [clearCache] = useClearBooksCacheMutation()
  const [upgradeEpub] = useUpgradeBookEpubMutation()
  const [deleteBooks, { isLoading: isDeleting }] = useDeleteBooksMutation()
  const [mergeBooks, { isLoading: isMerging }] = useMergeBooksMutation()
  const [relocateToInternal] = useRelocateToInternalMutation()
  const [bulkRelocateToInternal] = useBulkRelocateToInternalMutation()

  const processingRun = useProcessingRun(
    mode === "single" ? books[0] : undefined,
  )
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false)
  const [createCollectionName, setCreateCollectionName] = useState("")
  const [createSeriesOpen, setCreateSeriesOpen] = useState(false)
  const [createSeriesName, setCreateSeriesName] = useState("")
  const [createTagOpen, setCreateTagOpen] = useState(false)
  const [createTagName, setCreateTagName] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)

  const epubBooks = books.filter((b) => b.ebook)

  const handleScan = useCallback(() => {
    void scanBooks({ bookUuids, force: true })
  }, [scanBooks, bookUuids])

  const handleCollectionCreated = useCallback(
    (uuid: string) => {
      void addToCollections({ collections: [uuid as UUID], books: bookUuids })
    },
    [addToCollections, bookUuids],
  )

  const handleDelete = useCallback(
    async (preventReImport: boolean) => {
      await deleteBooks({ books: bookUuids, preventReImport }).unwrap()
      setDeleteOpen(false)
      onAfterDestructive?.()
    },
    [deleteBooks, bookUuids, onAfterDestructive],
  )

  const handleClearCache = useCallback(async () => {
    await clearCache({ bookUuids }).unwrap()
  }, [clearCache, bookUuids])

  const handleProcess = useCallback(async () => {
    await Promise.all(
      bookUuids.map((uuid) => processBook({ uuid, restart: false }).unwrap()),
    )
  }, [processBook, bookUuids])

  const handleUpgrade = useCallback(async () => {
    await Promise.all(
      epubBooks.map((b) => upgradeEpub({ uuid: b.uuid }).unwrap()),
    )
    toast.success(t("upgradeStarted"))
  }, [upgradeEpub, epubBooks, t])

  const [relocateOpen, setRelocateOpen] = useState(false)
  const [relocateMode, setRelocateMode] = useState<
    "copy" | "move" | "hardlink"
  >("copy")
  const [isRelocating, setIsRelocating] = useState(false)

  const handleRelocateToInternal = useCallback(async () => {
    setIsRelocating(true)
    try {
      if (books.length === 1 && books[0]) {
        await relocateToInternal({
          uuid: books[0].uuid,
          mode: relocateMode,
        }).unwrap()
      } else {
        await bulkRelocateToInternal({ bookUuids, mode: relocateMode }).unwrap()
      }

      toast.success(t("relocateToInternalSuccess"))
      setRelocateOpen(false)
    } catch (error) {
      console.error(error)
      toast.error(t("relocateToInternalFailed"), {
        description: (error as Error).message,
      })
    } finally {
      setIsRelocating(false)
    }
  }, [
    books,
    bookUuids,
    relocateMode,
    relocateToInternal,
    bulkRelocateToInternal,
    t,
  ])

  const canMerge = useMemo(() => {
    return (
      mode === "bulk" &&
      books.length === 2 &&
      books.some((b) => b.audiobook) &&
      books.some((b) => b.ebook)
    )
  }, [books, mode])

  const handleMerge = useCallback(async () => {
    if (!canMerge) return

    const ebookBook = books.find((b) => b.ebook)
    const audiobookBook = books.find((b) => b.audiobook)
    if (!ebookBook || !audiobookBook) return

    const allCreators = [
      ...books.flatMap((b) => b.authors),
      ...books.flatMap((b) => b.narrators),
      ...books.flatMap((b) => b.creators),
    ]

    const uniqueCreators = allCreators.reduce<Record<UUID, CreatorRelation>>(
      (acc, curr) => {
        acc[curr.uuid] = curr
        return acc
      },
      {},
    )

    const uniqueCollections = [
      ...new Set(books.flatMap((b) => b.collections.map((c) => c.uuid))),
    ]
    const uniqueTags = [
      ...new Set(books.flatMap((b) => b.tags.map((t) => t.name))),
    ]
    const uniqueSeries = [
      ...new Set(books.flatMap((b) => b.series.map((s) => ({ name: s.name })))),
    ]

    try {
      await mergeBooks({
        update: {
          title: ebookBook.title || audiobookBook.title,
          subtitle: ebookBook.subtitle || audiobookBook.subtitle,
          language: ebookBook.language || audiobookBook.language,
          description: ebookBook.description || audiobookBook.description,
          publicationDate:
            ebookBook.publicationDate || audiobookBook.publicationDate,
        },
        relations: {
          creators: Object.values(uniqueCreators),
          series: uniqueSeries,
          collections: uniqueCollections,
          tags: uniqueTags,
          ...((ebookBook.status || audiobookBook.status) &&
            currentUser && {
              status: {
                statusUuid: (ebookBook.status?.uuid ||
                  audiobookBook.status?.uuid) as UUID,
                userId: currentUser.id,
              },
            }),
        },
        from: bookUuids,
      }).unwrap()
      toast.success(t("mergeSuccess"))
    } catch (error) {
      console.error(error)
      toast.error(t("mergeFailed"), { description: (error as Error).message })
    }

    onAfterDestructive?.()
  }, [
    canMerge,
    books,
    onAfterDestructive,
    mergeBooks,
    currentUser,
    bookUuids,
    t,
  ])

  const clearCacheAction = useConfirmAction({
    onConfirm: handleClearCache,
    title: t("clearCacheTitle", { count }),
    description: t("clearCacheDescription"),
    confirmLabel: t("clearCache"),
    variant: "destructive",
  })

  const processAction = useConfirmAction({
    onConfirm: handleProcess,
    title: t("processTitle", { count }),
    description: t("processDescription"),
    confirmLabel: c("states.processing"),
  })

  const upgradeAction = useConfirmAction({
    onConfirm: handleUpgrade,
    title: t("upgradeTitle", { count: epubBooks.length }),
    description: t("upgradeDescription"),
    confirmLabel: t("upgradeEpub"),
  })

  const mergeAction = useConfirmAction({
    onConfirm: handleMerge,
    title:
      books.length === 2
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          t("mergeTitle", {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            target1: books[0]!.title,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            target2: books[1]!.title,
          })
        : t("merge"),
    description: t("mergeDescription"),
    confirmLabel: t("merge"),
    variant: "destructive",
  })

  const entries: BookActionEntry[] = []

  if (mode === "bulk") {
    if (canUpdate) {
      entries.push({
        key: "collections",
        label: t.plain("editCollections"),
        icon: <icon.Folder className="size-4" />,
        submenuSearchable: true,
        submenuSearchPlaceholder: t.plain("search"),
        submenu: () => (
          <RelationEditList
            source="collections"
            bookUuids={bookUuids}
            membership={membershipFromBooks(books, "collections")}
            enabled
            {...(canCreateCollection && {
              onCreate: (name: string) => {
                setCreateCollectionName(name)
                setCreateCollectionOpen(true)
              },
              createLabel: () => t.plain("newCollection"),
            })}
          />
        ),
      })

      entries.push({
        key: "series",
        label: t.plain("editSeries"),
        icon: <icon.Library className="size-4" />,
        submenuSearchable: true,
        submenuSearchPlaceholder: t.plain("search"),
        submenu: () => (
          <RelationEditList
            source="series"
            bookUuids={bookUuids}
            membership={membershipFromBooks(books, "series")}
            enabled
            onCreate={(name) => {
              setCreateSeriesName(name)
              setCreateSeriesOpen(true)
            }}
            createLabel={() => t.plain("newSeries")}
          />
        ),
      })

      entries.push({
        key: "tags",
        label: t.plain("editTags"),
        icon: <icon.TagAdd className="size-4" />,
        submenuSearchable: true,
        submenuSearchPlaceholder: t.plain("search"),
        submenu: () => (
          <RelationEditList
            source="tags"
            bookUuids={bookUuids}
            membership={membershipFromBooks(books, "tags")}
            enabled
            onCreate={(name) => {
              setCreateTagName(name)
              setCreateTagOpen(true)
            }}
            createLabel={() => t.plain("newTag")}
          />
        ),
      })

      entries.push({
        key: "authors",
        label: t.plain("editAuthors"),
        icon: <icon.User className="size-4" />,
        submenuSearchable: true,
        submenuSearchPlaceholder: t.plain("search"),
        submenu: () => (
          <RelationEditList
            source="authors"
            bookUuids={bookUuids}
            membership={membershipFromBooks(books, "authors")}
            enabled
            createLabel={(s) => t.plain("newAuthor", { input: `"${s}"` })}
          />
        ),
      })

      entries.push({
        key: "narrators",
        label: t.plain("editNarrators"),
        icon: <icon.Microphone className="size-4" />,
        submenuSearchable: true,
        submenuSearchPlaceholder: t.plain("search"),
        submenu: () => (
          <RelationEditList
            source="narrators"
            bookUuids={bookUuids}
            membership={membershipFromBooks(books, "narrators")}
            enabled
            createLabel={(s) => t.plain("newNarrator", { input: `"${s}"` })}
          />
        ),
      })

      entries.push({
        key: "translators",
        label: t.plain("editTranslators"),
        icon: <icon.Language className="size-4" />,
        submenuSearchable: true,
        submenuSearchPlaceholder: t.plain("search"),
        submenu: () => (
          <RelationEditList
            source="translators"
            bookUuids={bookUuids}
            membership={membershipFromBooks(books, "translators")}
            enabled
            createLabel={(s) => t.plain("newTranslator", { input: `"${s}"` })}
          />
        ),
      })
    }

    entries.push({
      key: "statuses",
      label: t.plain("setStatus"),
      icon: <icon.BookAlt className="size-4" />,
      submenuSearchable: true,
      submenuSearchPlaceholder: t.plain("search"),
      submenu: () => (
        <RelationEditList
          source="statuses"
          bookUuids={bookUuids}
          membership={membershipFromBooks(books, "statuses")}
          enabled
        />
      ),
    })

    if (canMerge) {
      entries.push({
        key: "merge",
        label: t.plain("merge"),
        icon: <icon.Merge className="size-4" />,
        onSelect: (modifiers) => {
          mergeAction.confirm(modifiers)
        },
      })
    }
  }

  if (
    canUpdate &&
    epubBooks.length > 0 &&
    epubBooks.some((b) => b.ebook?.isEpub2 || b.readaloud?.isEpub2)
  ) {
    entries.push({
      key: "upgradeEpub",
      label: t.plain("upgradeEpub"),
      icon: <icon.Upgrade className="size-4" />,
      onSelect: (modifiers) => {
        upgradeAction.confirm(modifiers)
      },
    })
  }

  if (canProcess) {
    const singleBook = mode === "single" ? books[0] : undefined
    const hasProcessable =
      mode === "bulk"
        ? books.some((b) => b.audiobook || b.ebook)
        : !!singleBook &&
          ((!!singleBook.ebook &&
            !singleBook.ebook.missing &&
            !!singleBook.audiobook &&
            !singleBook.audiobook.missing) ||
            !!singleBook.readaloud)

    if (hasProcessable) {
      if (mode === "single") {
        entries.push({
          key: "processing",
          separatorBefore: true,
          label: tp.plain("menuTitle"),
          icon: <icon.Progress className="size-4" />,
          submenu: ({ close }) => (
            <div className="flex flex-col">
              {processingRun.positions.map((position) => (
                <button
                  key={position.key}
                  type="button"
                  disabled={position.disabled}
                  onClick={() => {
                    processingRun.start(position.restart)
                    close()
                  }}
                  className={actionRowClassName}
                >
                  {position.icon}
                  {tp(position.labelKey)}
                </button>
              ))}
            </div>
          ),
        })
      } else {
        entries.push({
          key: "process",
          separatorBefore: true,
          label: c.plain("states.processing"),
          icon: <icon.Progress className="size-4" />,
          onSelect: (modifiers) => {
            processAction.confirm(modifiers)
          },
        })
      }

      entries.push({
        key: "clearCache",
        label: t.plain("clearCache"),
        icon: <icon.Refresh className="size-4" />,
        onSelect: (modifiers) => {
          clearCacheAction.confirm(modifiers)
        },
      })
    }
  }

  if (canUpdate) {
    entries.push({
      key: "relocateToInternal",
      label: t.plain("relocateToInternal"),
      icon: <icon.Download className="size-4" />,
      onSelect: () => {
        setRelocateOpen(true)
      },
    })
  }

  if (canProcess) {
    entries.push({
      key: "scan",
      label: c.plain("actions.scan"),
      icon: <icon.Scan className="size-4" />,
      onSelect: handleScan,
    })
  }

  if (canDelete) {
    entries.push({
      key: "delete",
      separatorBefore: true,
      variant: "destructive",
      disabled: isDeleting,
      label: isDeleting
        ? c.plain("states.deleting")
        : c.plain("actions.delete"),
      icon: <icon.Trash className="size-4" />,
      onSelect: (modifiers) => {
        // shift skips the confirm; delete straight away without preventing
        // re-import (the checkbox default)
        if (modifiers?.shiftKey) {
          void handleDelete(false)
          return
        }
        setDeleteOpen(true)
      },
    })
  }

  const dialogs = (
    <>
      <DeleteBooksDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        books={books}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
      <ConfirmDialog {...clearCacheAction.dialogProps} />
      <ConfirmDialog {...processAction.dialogProps} />
      <ConfirmDialog {...upgradeAction.dialogProps} />
      <ConfirmDialog {...mergeAction.dialogProps} isLoading={isMerging} />

      <Dialog open={relocateOpen} onOpenChange={setRelocateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("relocateToInternalTitle", { count })}</DialogTitle>
            <DialogDescription>
              {t("relocateToInternalDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <p className="text-sm font-medium">{t("relocateModeLabel")}</p>

            <RadioGroup
              value={relocateMode}
              onValueChange={(v) => {
                setRelocateMode(v as "copy" | "move" | "hardlink")
              }}
              className="gap-2"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="copy" />
                {t("relocateModeCopy")}
              </label>

              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="move" />
                {t("relocateModeMove")}
              </label>

              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="hardlink" />
                {t("relocateModeHardlink")}
              </label>
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRelocateOpen(false)
              }}
              disabled={isRelocating}
            >
              {c("actions.cancel")}
            </Button>

            <Button
              onClick={() => void handleRelocateToInternal()}
              disabled={isRelocating}
            >
              {isRelocating ? c("states.loading") : c("actions.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canCreateCollection && (
        <CreateCollectionDialog
          open={createCollectionOpen}
          onOpenChange={setCreateCollectionOpen}
          initialName={createCollectionName}
          onCreated={handleCollectionCreated}
        />
      )}

      {canUpdate && (
        <>
          <CreateSeriesDialog
            open={createSeriesOpen}
            onOpenChange={setCreateSeriesOpen}
            initialName={createSeriesName}
            books={bookUuids}
          />
          <CreateTagDialog
            open={createTagOpen}
            onOpenChange={setCreateTagOpen}
            initialName={createTagName}
            books={bookUuids}
          />
        </>
      )}

      {processingRun.dialog}
    </>
  )

  return { entries, dialogs }
}
