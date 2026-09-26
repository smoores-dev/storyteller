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

import { AddToShelfList } from "@/app/(v3)/v3/_/components/books/ActionMenu/AddToShelfList"
import { SetStatusList } from "@/app/(v3)/v3/_/components/books/ActionMenu/SetStatusList"
import { useProcessingRun } from "@/app/(v3)/v3/_/components/books/BookDetails/useProcessingRun"
import {
  BulkCoverColorsDialog,
  selectionHasColors,
} from "@/app/(v3)/v3/_/components/books/BulkCoverColorsDialog"
import { CreateCollectionDialog } from "@/app/(v3)/v3/_/components/books/CreateCollectionDialog"
import { CreateSeriesDialog } from "@/app/(v3)/v3/_/components/books/CreateSeriesDialog"
import { CreateTagDialog } from "@/app/(v3)/v3/_/components/books/CreateTagDialog"
import { DeleteBooksDialog } from "@/app/(v3)/v3/_/components/books/DeleteBooksDialog"
import {
  RelationEditList,
  membershipFromBooks,
} from "@/app/(v3)/v3/_/components/books/relation-picker/RelationEditList"
import { ShelfEditor } from "@/app/(v3)/v3/_/components/shelves/ShelfEditor"
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
  useGetBooksCacheUsageQuery,
  useGetCurrentUserQuery,
  useMergeBooksMutation,
  useRecomputeAlignmentReportsMutation,
  useRelocateToInternalMutation,
  useScanBooksMutation,
  useUpgradeBookEpubMutation,
} from "@/store/api"
import { formatBytes } from "@/strings"
import { type UUID } from "@/uuid"

type Mode = "single" | "bulk"

export type BookActionEntry = {
  key: string
  label: string
  icon?: ReactNode
  keywords?: string
  onSelect?: (modifiers?: ActivationModifiers) => void
  submenu?: ReactNode | ((ctx: { close: () => void }) => ReactNode)
  submenuSearchable?: boolean
  submenuSearchPlaceholder?: string
  variant?: "destructive"
  separatorBefore?: boolean
  disabled?: boolean
  title?: string
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
                title={entry.title}
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
              title={entry.title}
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
  const [clearCache] = useClearBooksCacheMutation()
  const [recomputeAlignmentReports] = useRecomputeAlignmentReportsMutation()
  const [upgradeEpub] = useUpgradeBookEpubMutation()
  const [deleteBooks, { isLoading: isDeleting }] = useDeleteBooksMutation()
  const [mergeBooks, { isLoading: isMerging }] = useMergeBooksMutation()
  const [relocateToInternal] = useRelocateToInternalMutation()
  const [bulkRelocateToInternal] = useBulkRelocateToInternalMutation()

  const processingRun = useProcessingRun(books)
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false)
  const [createCollectionName, setCreateCollectionName] = useState("")
  const [createSeriesOpen, setCreateSeriesOpen] = useState(false)
  const [createSeriesName, setCreateSeriesName] = useState("")
  const [createTagOpen, setCreateTagOpen] = useState(false)
  const [createTagName, setCreateTagName] = useState("")
  const [createShelfOpen, setCreateShelfOpen] = useState(false)
  const [createShelfName, setCreateShelfName] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [coverColorsOpen, setCoverColorsOpen] = useState(false)

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

  const handleRecomputeAlignmentReports = useCallback(async () => {
    try {
      const { count } = await recomputeAlignmentReports({ bookUuids }).unwrap()
      toast.success(t("recomputeAlignmentReportsDone", { count }))
    } catch (error) {
      console.error(error)
      toast.error(t("recomputeAlignmentReportsFailed"), {
        description: (error as Error).message,
      })
    }
  }, [recomputeAlignmentReports, bookUuids, t])

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
      ...books.flatMap((b) =>
        b.authors.map((author) => ({ ...author, role: "aut" as const })),
      ),
      ...books.flatMap((b) =>
        b.narrators.map((narrator) => ({ ...narrator, role: "nrt" as const })),
      ),
      ...books.flatMap((b) => b.creators),
    ]

    const uniqueCreators = allCreators.reduce<Record<string, CreatorRelation>>(
      (acc, curr) => {
        acc[`${curr.uuid}:${curr.role}`] = curr
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
    confirmLabel: t("clearCache"),
    variant: "destructive",
  })
  const { data: cacheUsage, isFetching: isMeasuringCache } =
    useGetBooksCacheUsageQuery(
      { bookUuids },
      {
        skip: !clearCacheAction.dialogProps.open,
        refetchOnMountOrArgChange: true,
      },
    )
  const cacheUsageLine =
    !cacheUsage || isMeasuringCache
      ? t("clearCacheMeasuring")
      : cacheUsage.bytes === 0
        ? t("clearCacheEmpty", { count })
        : t("clearCacheUsage", { size: formatBytes(cacheUsage.bytes) })

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
        key: "shelves",
        label: t.plain("editShelves"),
        keywords: t.plain("addToShelf"),
        icon: <icon.BookmarkPlus className="size-4" />,
        submenuSearchable: true,
        submenuSearchPlaceholder: t.plain("search"),
        submenu: () => (
          <AddToShelfList
            bookUuids={bookUuids}
            onCreate={(name) => {
              setCreateShelfName(name)
              setCreateShelfOpen(true)
            }}
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
      submenu: () => <SetStatusList books={books} bookUuids={bookUuids} />,
    })

    if (canUpdate && selectionHasColors(books)) {
      entries.push({
        key: "coverColors",
        label: t.plain("bulkCoverColors.title"),
        icon: <icon.Palette className="size-4" />,
        onSelect: () => {
          setCoverColorsOpen(true)
        },
      })
    }

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
    const unprocessable = processingRun.blockedBooks
    const blockedTitle = (titles: string[]) =>
      titles.length > 0
        ? t.plain("processingUnavailable", { books: titles.join(", ") })
        : undefined

    entries.push({
      key: "processing",
      separatorBefore: true,
      label: tp.plain("menuTitle"),
      icon: <icon.Progress className="size-4" />,
      disabled: !processingRun.canProcessAny,
      title: blockedTitle(unprocessable.map((b) => b.title)),
      submenuSearchable: false,
      submenu: ({ close }) => (
        <>
          {processingRun.positions.map((position) => (
            <FilterableMenuItem
              key={position.key}
              disabled={position.disabled}
              title={count > 1 ? blockedTitle(position.blockedBy) : undefined}
              onSelect={(event) => {
                processingRun.start(position.restart, {
                  shiftKey: !!event?.shiftKey,
                })
                close()
              }}
              className={actionRowClassName}
            >
              {position.icon}
              {tp(position.labelKey)}
            </FilterableMenuItem>
          ))}
        </>
      ),
    })

    entries.push({
      key: "clearCache",
      label: t.plain("clearCache"),
      icon: <icon.Refresh className="size-4" />,
      onSelect: (modifiers) => {
        clearCacheAction.confirm(modifiers)
      },
    })

    if (books.some((b) => b.alignmentSummary)) {
      entries.push({
        key: "recomputeAlignmentReports",
        label: t.plain("recomputeAlignmentReports"),
        icon: <icon.ReportAnalytics className="size-4" />,
        onSelect: () => void handleRecomputeAlignmentReports(),
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

  if (canUpdate && mode === "single" && bookUuids[0]) {
    const bookUuid = bookUuids[0]
    entries.push({
      key: "debugBundle",
      label: "Download debug bundle",
      icon: <icon.Bug className="size-4" />,
      onSelect: () => {
        window.location.href = `/api/v2/books/${bookUuid}/debug/bundle`
      },
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
      <BulkCoverColorsDialog
        open={coverColorsOpen}
        onOpenChange={setCoverColorsOpen}
        books={books}
      />
      <ConfirmDialog
        {...clearCacheAction.dialogProps}
        description={`${t("clearCacheDescription")} ${cacheUsageLine}`}
      />
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

      {mode === "bulk" && (
        <ShelfEditor
          open={createShelfOpen}
          onOpenChange={setCreateShelfOpen}
          shelf={null}
          initialName={createShelfName}
          initialBooks={bookUuids}
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
