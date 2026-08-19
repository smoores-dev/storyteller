"use client"

import { parseHotkey, useHotkey } from "@tanstack/react-hotkeys"
import { useRouter } from "next/navigation"
import { type ReactNode, useCallback, useMemo, useState } from "react"

import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { useUserPreferences } from "@/app/(v3)/v3/_/components/user-preferences-provider"
import { useVersionBasePath } from "@/app/(v3)/v3/_/components/version-context"
import { useDebounce } from "@/app/(v3)/v3/_/hooks/use-debounce"
import { useBookInSidePanel } from "@/app/(v3)/v3/_/hooks/use-open-book"
import { cn } from "@/cn"
import { IconReadaloud } from "@/components/icons/IconReadaloud"
import { type BookWithRelations } from "@/database/books"
import { usePermissions } from "@/hooks/usePermissions"
import * as icon from "@/icons"
import { type StyledIcon } from "@/icons"
import { api } from "@/store/api"

import { Cover } from "./books/Cover"
import { CreateCollectionDialog } from "./books/CreateCollectionDialog"
import {
  BUILTIN_SIDEBAR_ITEMS,
  COLLECTION_ICON,
  SHELF_ICON,
} from "./nav/sidebar-items"
import { ShelfEditor } from "./shelves/ShelfEditor"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog"
import {
  type ActivationModifiers,
  FilterableMenuGroup,
  FilterableMenuItem,
  FilterableMenuLabel,
  FilterableMenuSurface,
} from "./ui/filterable-menu"
import { Skeleton } from "./ui/skeleton"

type NavCommand = {
  key: string
  label: string
  icon: StyledIcon
  href: string
}

export const COMMAND_SEARCH_HOTKEY = "Mod+K"
export const COMMAND_SEARCH_HOTKEY_PARSED = parseHotkey(COMMAND_SEARCH_HOTKEY)

function useNavCommands(): NavCommand[] {
  const tSidebar = useTranslation("AppSidebar")
  const tLibrary = useTranslation("LibraryPage")
  const c = useCommon()
  const permissions = usePermissions()

  return useMemo(
    () => [
      ...BUILTIN_SIDEBAR_ITEMS.filter(
        (item) => !item.permission || !!permissions?.[item.permission],
      ).map((item) => ({
        key: item.key,
        label:
          item.labelNs === "AppSidebar"
            ? tSidebar.plain(item.labelKey)
            : tLibrary.plain(item.labelKey),
        icon: item.icon,
        href: item.href,
      })),
      {
        key: "shelves",
        label: c.plain("Nouns.shelf", { count: 2 }),
        icon: SHELF_ICON,
        href: "/shelves",
      },
      {
        key: "collections",
        label: tSidebar.plain("collections"),
        icon: COLLECTION_ICON,
        href: "/collections",
      },
      {
        key: "settings",
        label: tSidebar.plain("settings"),
        icon: icon.Settings,
        href: "/settings",
      },
      {
        key: "preferences",
        label: tSidebar.plain("account"),
        icon: icon.AdjustmentsHorizontal,
        href: "/preferences",
      },
    ],
    [permissions, tSidebar, tLibrary, c],
  )
}

const rowClassName = "gap-3 rounded-lg px-2 py-1.5"

function BookRow({
  book,
  onSelect,
}: {
  book: BookWithRelations
  onSelect: (book: BookWithRelations, modifiers?: ActivationModifiers) => void
}) {
  const isSynced = book.readaloud?.status === "ALIGNED"
  const authors = book.authors.map((a) => a.name).join(", ")

  return (
    <FilterableMenuItem
      filter={false}
      textValue={book.title}
      onSelect={(modifiers) => {
        onSelect(book, modifiers)
      }}
      className={rowClassName}
    >
      <div className="flex h-12 w-9 shrink-0 items-center justify-center">
        <Cover book={book} width={36} interactive={false} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="font-heading truncate text-sm">{book.title}</div>
        {authors && (
          <div className="text-muted-foreground truncate text-xs">
            {authors}
          </div>
        )}
      </div>

      <div className="text-muted-foreground flex shrink-0 items-center gap-1.5">
        {isSynced ? (
          <IconReadaloud className="text-cover-accent size-3.5" />
        ) : (
          <>
            {book.audiobook && <icon.Headphones className="size-3.5" />}
            {book.ebook && <icon.BookAlt className="size-3.5" />}
          </>
        )}
      </div>
    </FilterableMenuItem>
  )
}

function LoadingBookRows({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={`loading-${idx}`}
          className="flex items-center gap-3 px-2 py-1.5"
        >
          <Skeleton className="h-12 w-9 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="bg-muted text-muted-foreground rounded px-1 py-px font-sans text-[0.625rem]">
      {children}
    </kbd>
  )
}

function CommandPalette({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (kind: "shelf" | "collection", name: string) => void
}) {
  const t = useTranslation("CommandPalette")
  const router = useRouter()
  const basePath = useVersionBasePath()
  const navCommands = useNavCommands()

  const { bookOpenTarget } = useUserPreferences()
  const { setSelectedBookUuid } = useBookInSidePanel()

  const openBook = useCallback(
    (book: BookWithRelations, modifiers?: ActivationModifiers) => {
      const inverted = modifiers?.shiftKey
      const target =
        (bookOpenTarget === "panel") !== !!inverted ? "panel" : "page"
      if (target === "panel") {
        void setSelectedBookUuid(book.uuid)
      } else {
        router.push(`${basePath}/books/${book.uuid}`)
      }
    },
    [bookOpenTarget, setSelectedBookUuid, router, basePath],
  )

  const navigateTo = useCallback(
    (href: string) => {
      router.push(`${basePath}${href}`)
    },
    [router, basePath],
  )

  return (
    <FilterableMenuSurface
      onClose={onClose}
      searchPlaceholder={t.plain("searchPlaceholder")}
      searchBefore={
        <icon.Search className="text-muted-foreground size-4 shrink-0" />
      }
      searchWrapperClassName="mb-0 flex items-center gap-2.5 px-3.5 py-1"
      searchInputClassName="h-10 px-0 text-sm md:h-10 md:text-sm"
      className="flex min-w-0 flex-col"
    >
      {({ query }) => (
        <PaletteResults
          query={query}
          navCommands={navCommands}
          openBook={openBook}
          navigateTo={navigateTo}
          onCreate={onCreate}
        />
      )}
    </FilterableMenuSurface>
  )
}

function PaletteResults({
  query,
  navCommands,
  openBook,
  navigateTo,
  onCreate,
}: {
  query: string
  navCommands: NavCommand[]
  openBook: (book: BookWithRelations, modifiers?: ActivationModifiers) => void
  navigateTo: (href: string) => void
  onCreate: (kind: "shelf" | "collection", name: string) => void
}) {
  const t = useTranslation("CommandPalette")
  const { bookOpenTarget } = useUserPreferences()

  const trimmed = query.trim()
  const debouncedSearch = useDebounce(trimmed, 200)
  const searching = trimmed !== ""

  const { data: searchData, isFetching: isSearchFetching } =
    api.endpoints.listInfiniteBooks.useInfiniteQuery(
      { search: debouncedSearch, limit: 8 },
      { skip: !debouncedSearch },
    )
  const { data: recentData, isFetching: isRecentFetching } =
    api.endpoints.listInfiniteBooks.useInfiniteQuery({
      limit: 6,
      orderBy: "lastRead",
      orderDirection: "desc",
    })

  const books = searching
    ? debouncedSearch
      ? searchData?.pages.flat() ?? []
      : []
    : recentData?.pages.flat() ?? []
  const isLoadingBooks = searching
    ? isSearchFetching || debouncedSearch !== trimmed
    : isRecentFetching && !recentData

  const q = trimmed.toLowerCase()
  const matchedNav = searching
    ? navCommands
        .filter((cmd) => cmd.label.toLowerCase().includes(q))
        .sort(
          (a, b) =>
            Number(b.label.toLowerCase().startsWith(q)) -
            Number(a.label.toLowerCase().startsWith(q)),
        )
    : navCommands

  const navPrimary =
    searching && matchedNav.some((cmd) => cmd.label.toLowerCase().startsWith(q))

  const showBooksSection =
    !searching || isLoadingBooks || books.length > 0 || matchedNav.length === 0

  const booksSection = showBooksSection && (
    <>
      <FilterableMenuGroup>
        <FilterableMenuLabel>
          {searching ? t("sectionBooks") : t("sectionRecent")}
        </FilterableMenuLabel>
      </FilterableMenuGroup>
      <FilterableMenuGroup>
        {isLoadingBooks ? (
          <LoadingBookRows />
        ) : books.length === 0 ? (
          <div className="text-muted-foreground px-2 py-3 text-center text-xs">
            {t("empty")}
          </div>
        ) : (
          books.map((book) => (
            <BookRow key={book.uuid} book={book} onSelect={openBook} />
          ))
        )}
      </FilterableMenuGroup>
    </>
  )

  const gotoSection = matchedNav.length > 0 && (
    <FilterableMenuGroup>
      <FilterableMenuLabel>{t("sectionGoto")}</FilterableMenuLabel>
      {matchedNav.map((cmd) => (
        <FilterableMenuItem
          key={cmd.key}
          filter={false}
          icon={<cmd.icon className="text-muted-foreground" />}
          onSelect={() => {
            navigateTo(cmd.href)
          }}
          className={rowClassName}
        >
          <span className="truncate text-xs">{cmd.label}</span>
        </FilterableMenuItem>
      ))}
    </FilterableMenuGroup>
  )

  const createSection = (
    <FilterableMenuGroup>
      <FilterableMenuLabel>{t("sectionActions")}</FilterableMenuLabel>
      <FilterableMenuItem
        filter={false}
        icon={<icon.Plus className="text-muted-foreground" />}
        onSelect={() => {
          onCreate("shelf", trimmed)
        }}
        className={rowClassName}
      >
        <span className="truncate text-xs">
          {trimmed
            ? t("createShelfNamed", { name: trimmed })
            : t("createShelf")}
        </span>
      </FilterableMenuItem>
      <FilterableMenuItem
        filter={false}
        icon={<icon.Plus className="text-muted-foreground" />}
        onSelect={() => {
          onCreate("collection", trimmed)
        }}
        className={rowClassName}
      >
        <span className="truncate text-xs">
          {trimmed
            ? t("createCollectionNamed", { name: trimmed })
            : t("createCollection")}
        </span>
      </FilterableMenuItem>
    </FilterableMenuGroup>
  )

  return (
    <>
      <div className="scroll-y max-h-[min(26rem,60vh)] min-w-0 scroll-py-2 overflow-x-hidden overscroll-contain px-1.5 pb-1.5">
        {/* create rows always sort last so the auto-highlight never lands on
            them unless they're the only rows */}
        {navPrimary ? (
          <>
            {gotoSection}
            {booksSection}
            {createSection}
          </>
        ) : searching ? (
          <>
            {booksSection}
            {gotoSection}
            {createSection}
          </>
        ) : (
          <>
            {booksSection}
            {createSection}
            {gotoSection}
          </>
        )}
      </div>

      <div className="text-muted-foreground flex items-center gap-3 border-t px-3.5 py-2 text-[0.6875rem]">
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> {t("hintOpen")}
        </span>
        <span className="flex items-center gap-1">
          <Kbd>⇧↵</Kbd>{" "}
          {bookOpenTarget === "panel" ? t("hintOpenPage") : t("hintOpenPanel")}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd>esc</Kbd> {t("hintClose")}
        </span>
      </div>
    </>
  )
}

export function CommandSearch() {
  const [open, setOpen] = useState(false)
  const [pendingCreate, setPendingCreate] = useState<{
    kind: "shelf" | "collection"
    name: string
  } | null>(null)

  useHotkey(COMMAND_SEARCH_HOTKEY, () => {
    setOpen((prev) => !prev)
  })

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  const handleCreate = useCallback(
    (kind: "shelf" | "collection", name: string) => {
      setOpen(false)
      setPendingCreate({ kind, name })
    },
    [],
  )

  const closeCreate = useCallback((nextOpen: boolean) => {
    if (!nextOpen) setPendingCreate(null)
  }, [])

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "top-14 translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg",
          )}
        >
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">
            Search for books or run a command
          </DialogDescription>
          {/* mounted only while open so query + highlight reset on close */}
          {open && <CommandPalette onClose={close} onCreate={handleCreate} />}
        </DialogContent>
      </Dialog>

      <ShelfEditor
        open={pendingCreate?.kind === "shelf"}
        onOpenChange={closeCreate}
        initialName={pendingCreate?.name}
      />
      <CreateCollectionDialog
        open={pendingCreate?.kind === "collection"}
        onOpenChange={closeCreate}
        initialName={pendingCreate?.name ?? ""}
      />
    </>
  )
}

export function useCommandSearch() {
  const openSearch = useCallback(() => {
    const event = new KeyboardEvent("keydown", {
      key: COMMAND_SEARCH_HOTKEY_PARSED.key,
      metaKey: COMMAND_SEARCH_HOTKEY_PARSED.meta,
      shiftKey: COMMAND_SEARCH_HOTKEY_PARSED.shift,
      altKey: COMMAND_SEARCH_HOTKEY_PARSED.alt,
      ctrlKey: COMMAND_SEARCH_HOTKEY_PARSED.ctrl,
      bubbles: true,
    })
    document.dispatchEvent(event)
  }, [])

  return { openSearch }
}
