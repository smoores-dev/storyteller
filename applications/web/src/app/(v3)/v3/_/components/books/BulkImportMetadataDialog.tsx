"use client"

import { useEffect, useRef, useState } from "react"

import { type BookMetadataProvider } from "@storyteller-platform/nodekit/types"

import { Button } from "@v3/_/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { Spinner } from "@v3/_/components/ui/spinner"
import { V3Link } from "@v3/_/components/v3-link"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import {
  ImportDialogShell,
  ImportSearchInput,
  bookByline,
  useImportSearch,
} from "@/app/(v3)/v3/_/components/books/BookDetails/ImportDialog"
import {
  MetadataImportPanel,
  SEARCH_REGION,
  defaultSearchQuery,
  searchProvidersFor,
} from "@/app/(v3)/v3/_/components/books/BookDetails/MetadataImportPanel"
import {
  HardcoverTokenHint,
  MetadataUnavailable,
  PROVIDERS_SETTINGS_HREF,
} from "@/app/(v3)/v3/_/components/metadata/provider-notice"
import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import { PROVIDER_LABELS } from "@/externalSource"
import * as icon from "@/icons"
import { type AutoImportStatus } from "@/metadataAutoImport"
import {
  api,
  useAutoImportBookMetadataMutation,
  useGetMetadataProvidersQuery,
  usePrefetch,
} from "@/store/api"
import { useAppDispatch } from "@/store/appState"

export type BulkImportMode = "review" | "auto"

type RowStatus = "pending" | "running" | "failed" | AutoImportStatus

type Row = {
  book: BookWithRelations
  status: RowStatus
  fieldCount: number
}

const NEEDS_REVIEW: ReadonlySet<RowStatus> = new Set([
  "unsure",
  "noMatch",
  "failed",
])

export function BulkImportMetadataDialog({
  books,
  mode,
  open,
  onOpenChange,
}: {
  books: BookWithRelations[]
  mode: BulkImportMode
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <BulkImportContent
          books={books}
          mode={mode}
          onOpenChange={onOpenChange}
        />
      )}
    </Dialog>
  )
}

function BulkImportContent({
  books,
  mode,
  onOpenChange,
}: {
  books: BookWithRelations[]
  mode: BulkImportMode
  onOpenChange: (open: boolean) => void
}) {
  const [reviewBooks, setReviewBooks] = useState<BookWithRelations[] | null>(
    mode === "review" ? books : null,
  )

  if (reviewBooks) {
    return <ReviewStepper books={reviewBooks} onOpenChange={onOpenChange} />
  }

  return (
    <AutoImportContent
      books={books}
      onOpenChange={onOpenChange}
      onReview={setReviewBooks}
    />
  )
}

function ReviewStepper({
  books,
  onOpenChange,
}: {
  books: BookWithRelations[]
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslation("BookDetailsPage.metadataImport")
  const [index, setIndex] = useState(0)
  const prefetchSearch = usePrefetch("metadataSearch")

  const book = books[index]
  const next = books[index + 1]
  const search = useImportSearch(book)

  useEffect(() => {
    if (!next) return
    const query = defaultSearchQuery(next)
    for (const provider of searchProvidersFor(next)) {
      prefetchSearch({ provider, query, region: SEARCH_REGION })
    }
  }, [next, prefetchSearch])

  if (!book) return null

  const advance = () => {
    if (index + 1 < books.length) setIndex(index + 1)
    else onOpenChange(false)
  }

  return (
    <ImportDialogShell
      title={
        <>
          {t("title")}
          <span className="text-muted-foreground text-sm font-normal tabular-nums">
            {t("step", { index: index + 1, count: books.length })}
          </span>
        </>
      }
      description={bookByline(book)}
      search={<ImportSearchInput search={search} />}
    >
      <MetadataImportPanel
        key={book.uuid}
        book={book}
        query={search.term}
        onClose={() => {
          onOpenChange(false)
        }}
        onImported={advance}
        step={{
          index,
          count: books.length,
          onSkip: advance,
          onBack:
            index > 0
              ? () => {
                  setIndex(index - 1)
                }
              : undefined,
        }}
      />
    </ImportDialogShell>
  )
}

function AutoImportContent({
  books,
  onOpenChange,
  onReview,
}: {
  books: BookWithRelations[]
  onOpenChange: (open: boolean) => void
  onReview: (books: BookWithRelations[]) => void
}) {
  const t = useTranslation("BookActions.bulkMetadataImport")
  const tConfidence = useTranslation(
    "BookDetailsPage.metadataImport.confidence",
  )
  const c = useCommon()
  const dispatch = useAppDispatch()

  const { data: providers, isLoading: loadingProviders } =
    useGetMetadataProvidersQuery()
  const [autoImport] = useAutoImportBookMetadataMutation()

  const [rows, setRows] = useState<Row[]>(() =>
    books.map((book) => ({ book, status: "pending", fieldCount: 0 })),
  )
  const [running, setRunning] = useState(false)
  const rowsRef = useRef(rows)
  const stopRef = useRef(false)

  useEffect(() => {
    return () => {
      stopRef.current = true
    }
  }, [])

  const patchRow = (index: number, patch: Partial<Row>) => {
    rowsRef.current = rowsRef.current.map((row, i) =>
      i === index ? { ...row, ...patch } : row,
    )
    setRows(rowsRef.current)
  }

  const run = async () => {
    setRunning(true)
    for (const [index, row] of rowsRef.current.entries()) {
      if (stopRef.current) break
      if (row.status !== "pending") continue
      patchRow(index, { status: "running" })
      try {
        const result = await autoImport({ bookUuid: row.book.uuid }).unwrap()
        patchRow(index, {
          status: result.status,
          fieldCount: result.fields.length,
          book: result.book,
        })
      } catch {
        patchRow(index, { status: "failed" })
      }
    }
    dispatch(
      api.util.invalidateTags([
        "Books",
        "Creators",
        "Authors",
        "Narrators",
        "Series",
        "Tags",
        "Identifiers",
      ]),
    )
    setRunning(false)
  }

  const audioBooks = books.some((book) => book.audiobook || book.readaloud)
  const hardcoverReady = !!providers?.hardcover.tokenSet
  const activeProviders: BookMetadataProvider[] = [
    ...(audioBooks ? (["audnexus"] as const) : []),
    ...(hardcoverReady ? (["hardcover"] as const) : []),
  ]

  const done = rows.filter(
    (row) => row.status !== "pending" && row.status !== "running",
  ).length
  const applied = rows.filter((row) => row.status === "applied").length
  const toReview = rows.filter((row) => NEEDS_REVIEW.has(row.status))
  const started = done > 0 || running
  const finished = done === rows.length

  return (
    <DialogContent className="flex max-h-[min(44rem,90vh)] flex-col gap-0 p-0 sm:max-w-xl">
      <DialogHeader className="border-b px-6 py-4">
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>
          {t("description", { count: books.length })}
        </DialogDescription>
      </DialogHeader>

      {loadingProviders ? (
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      ) : !providers?.available ? (
        <div className="flex justify-center p-6">
          <MetadataUnavailable />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {!started && (
            <div className="space-y-1 border-b px-6 py-3 text-sm">
              {activeProviders.map((provider) => (
                <p key={provider}>
                  {t("threshold", {
                    provider: PROVIDER_LABELS[provider],
                    confidence: tConfidence.plain(
                      providers.thresholds[provider],
                    ),
                  })}
                </p>
              ))}
              {!hardcoverReady && <HardcoverTokenHint />}
              <p className="text-muted-foreground">
                {t.rich("changeInSettings", {
                  link: (chunks) => (
                    <V3Link
                      href={PROVIDERS_SETTINGS_HREF}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {chunks}
                    </V3Link>
                  ),
                })}
              </p>
            </div>
          )}

          <ul className="scroll-y min-h-0 flex-1 divide-y">
            {rows.map((row) => (
              <li
                key={row.book.uuid}
                className="flex items-center gap-3 px-6 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {row.book.title}
                </span>
                <RowStatusLabel row={row} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <DialogFooter className="flex-row items-center border-t px-6 py-3">
        <span className="text-muted-foreground flex-1 text-sm tabular-nums">
          {finished
            ? t("summary", { applied, review: toReview.length })
            : started
              ? t("progress", { done, count: rows.length })
              : null}
        </span>
        {running ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              stopRef.current = true
            }}
          >
            {t("stop")}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false)
              }}
            >
              {finished ? c("actions.done") : c("actions.cancel")}
            </Button>
            {finished && toReview.length > 0 && (
              <Button
                type="button"
                onClick={() => {
                  onReview(toReview.map((row) => row.book))
                }}
              >
                {t("review", { count: toReview.length })}
              </Button>
            )}
            {!finished && (
              <Button
                type="button"
                disabled={!providers?.available || !activeProviders.length}
                onClick={() => {
                  stopRef.current = false
                  void run()
                }}
              >
                {t("start")}
              </Button>
            )}
          </>
        )}
      </DialogFooter>
    </DialogContent>
  )
}

function RowStatusLabel({ row }: { row: Row }) {
  const t = useTranslation("BookActions.bulkMetadataImport.status")

  if (row.status === "running") {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
        <Spinner className="size-3" />
        {t("running")}
      </span>
    )
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-xs",
        row.status === "applied" && "text-emerald-700 dark:text-emerald-400",
        row.status === "failed" && "text-destructive",
        (row.status === "pending" ||
          row.status === "unsure" ||
          row.status === "noMatch" ||
          row.status === "notSearched") &&
          "text-muted-foreground",
      )}
    >
      {row.status === "applied" && <icon.Check className="size-3.5" />}
      {row.status === "applied"
        ? t("applied", { count: row.fieldCount })
        : t(row.status)}
    </span>
  )
}
