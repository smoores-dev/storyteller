"use client"

import { type ReactNode, useEffect, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { SwipePanels } from "@v3/_/components/ui/swipe-panels"
import { Tabs, TabsList, TabsTrigger } from "@v3/_/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@v3/_/components/ui/tooltip"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { CoverImportPanel } from "@/app/(v3)/v3/_/components/books/BookDetails/CoverImportPanel"
import {
  MetadataImportPanel,
  defaultSearchQuery,
} from "@/app/(v3)/v3/_/components/books/BookDetails/MetadataImportPanel"
import { SearchInput } from "@/app/(v3)/v3/_/components/books/SearchInput"
import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import * as icon from "@/icons"

export type ImportTab = "metadata" | "covers"

const IMPORT_TABS = ["metadata", "covers"] as const satisfies ImportTab[]

const SEARCH_DEBOUNCE_MS = 1000

export function ImportDialog({
  book,
  tab,
  onTabChange,
}: {
  book: BookWithRelations
  tab: ImportTab | null
  onTabChange: (tab: ImportTab | null) => void
}) {
  const t = useTranslation("BookDetailsPage.importDialog")
  const search = useImportSearch(book)
  const [tabTerms, setTabTerms] = useState<Record<ImportTab, string>>(() => ({
    metadata: search.term,
    covers: search.term,
  }))
  if (tab && tabTerms[tab] !== search.term) {
    setTabTerms({ ...tabTerms, [tab]: search.term })
  }
  const close = () => {
    onTabChange(null)
  }

  return (
    <Dialog
      open={tab !== null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      {tab && (
        <ImportDialogShell
          title={t(tab === "metadata" ? "metadataTitle" : "coversTitle")}
          titleHidden
          description={bookByline(book)}
          search={<ImportSearchInput search={search} />}
          tabs={
            <Tabs
              value={tab}
              onValueChange={(value) => {
                onTabChange(value as ImportTab)
              }}
            >
              <TabsList className="h-9">
                {IMPORT_TABS.map((value) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="px-3 text-sm"
                  >
                    {value === "metadata" ? (
                      <icon.FileImport className="size-4" />
                    ) : (
                      <icon.Image className="size-4" />
                    )}
                    {t(value)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          }
        >
          <SwipePanels
            value={tab}
            onValueChange={onTabChange}
            lazy
            className="flex flex-1 flex-col"
            panels={[
              {
                value: "metadata",
                content: (
                  <MetadataImportPanel
                    book={book}
                    query={tabTerms.metadata}
                    onClose={close}
                  />
                ),
              },
              {
                value: "covers",
                content: (
                  <CoverImportPanel
                    book={book}
                    query={tabTerms.covers}
                    onClose={close}
                  />
                ),
              },
            ]}
          />
        </ImportDialogShell>
      )}
    </Dialog>
  )
}

export function bookByline(book: BookWithRelations) {
  return [book.title, book.authors[0]?.name].filter(Boolean).join(", ")
}

type ImportSearch = {
  query: string
  term: string
  setQuery: (query: string) => void
  commit: () => void
}

export function useImportSearch(
  book: BookWithRelations | undefined,
): ImportSearch {
  const [typed, setTyped] = useState<{
    uuid: string
    query: string
    term: string
  } | null>(null)
  const [opened, setOpened] = useState(
    () => book && { uuid: book.uuid, query: defaultSearchQuery(book) },
  )
  if (book && opened?.uuid !== book.uuid) {
    setOpened({ uuid: book.uuid, query: defaultSearchQuery(book) })
  }
  const fallback =
    opened && opened.uuid === book?.uuid
      ? opened.query
      : book
        ? defaultSearchQuery(book)
        : ""
  const current = book && typed?.uuid === book.uuid ? typed : null
  const query = current?.query ?? fallback
  const term = current?.term ?? fallback

  useEffect(() => {
    if (!typed || typed.query === typed.term) return
    const timer = setTimeout(() => {
      setTyped((state) => state && { ...state, term: state.query })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [typed])

  return {
    query,
    term,
    setQuery: (next) => {
      if (book) setTyped({ uuid: book.uuid, query: next, term })
    },
    commit: () => {
      if (book) setTyped({ uuid: book.uuid, query, term: query })
    },
  }
}

export function ImportSearchInput({ search }: { search: ImportSearch }) {
  const t = useTranslation("BookDetailsPage.importDialog")
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        search.commit()
      }}
      className="order-last flex basis-full sm:order-none sm:max-w-sm sm:flex-1 sm:basis-auto"
    >
      <SearchInput
        value={search.query}
        onChange={search.setQuery}
        placeholder={t.plain("searchPlaceholder")}
        aria-label={t.plain("searchPlaceholder")}
      />
    </form>
  )
}

export function ImportDialogShell({
  title,
  titleHidden = false,
  description,
  tabs,
  search,
  children,
}: {
  title: ReactNode
  titleHidden?: boolean
  description: ReactNode
  tabs?: ReactNode
  search?: ReactNode
  children: ReactNode
}) {
  return (
    <DialogContent className="flex h-[min(52rem,92vh)] flex-col gap-0 p-0 sm:max-w-[min(90rem,calc(100vw-2rem))]">
      <DialogHeader className="gap-1.5 border-b px-6 py-3">
        <div className="mr-8 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2 md:mr-16">
          <DialogTitle
            className={cn(
              "flex min-w-0 items-baseline gap-2",
              titleHidden && "sr-only",
            )}
          >
            {title}
          </DialogTitle>
          {tabs}
          {search}
        </div>
        <DialogDescription className="truncate">
          {description}
        </DialogDescription>
      </DialogHeader>
      <ExperimentalMark />
      {children}
    </DialogContent>
  )
}

function ExperimentalMark() {
  const t = useTranslation("BookDetailsPage.importDialog")
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={t.plain("experimental")}
        render={
          <button
            type="button"
            className="text-primary hover:bg-primary/10 absolute top-2 right-2 inline-flex size-7 cursor-help items-center justify-center rounded-md transition-colors md:right-10"
          />
        }
      >
        <icon.Flask className="size-4" />
      </TooltipTrigger>
      <TooltipContent>{t("experimental")}</TooltipContent>
    </Tooltip>
  )
}
