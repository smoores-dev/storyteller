"use client"

// TODO: is not used atm, maybe reomve?

import { useHotkey } from "@tanstack/react-hotkeys"
import dynamic from "next/dynamic"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { Drawer } from "vaul-base"

import { SiteHeader } from "@v3/_/components/site-header"
import {
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
  PageHeader,
  PageLayout,
  PageMain,
  PagePanel,
  PageSidebar,
} from "@v3/_/components/ui/page-layout"
import { useSidebar } from "@v3/_/components/ui/sidebar"
import { useUserPreferences } from "@v3/_/components/user-preferences-provider"
import {
  ESCAPE_PRIORITY,
  useEscapeHandler,
} from "@v3/_/hooks/use-escape-cascade"
import { useLayoutAnimations } from "@v3/_/hooks/use-layout-animations"
import { useIsMobile } from "@v3/_/hooks/use-mobile"
import { usePanelWidthDriver } from "@v3/_/hooks/use-panel-width-driver"

import { BookDetailsSkeleton } from "@/app/(v3)/v3/_/components/books/BookDetails/BookDetailsSkeleton"
import {
  GRID_CARD_WIDTHS,
  GRID_SPACING_PX,
} from "@/app/(v3)/v3/_/components/books/Grid/BookGrid"
import {
  BOOK_COLLECTION_ID,
  BOOK_DETAIL_PANEL_ID,
} from "@/app/(v3)/v3/_/components/books/keyboard-nav"
import { PanelResizeProvider } from "@/app/(v3)/v3/_/components/books/panel-resize-context"
import { type BookWithRelations } from "@/database/books"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { uiSettingsSlice } from "@/store/slices/uiSettingsSlice"
import { type UUID } from "@/uuid"

import { useCoverScope } from "./CoverScope"

const DynamicBookDetailsContent = dynamic(
  () =>
    import("@/app/(v3)/v3/_/components/books/BookDetails/BookDetailsPage").then(
      (mod) => mod.BookDetailsContent,
    ),
  {
    ssr: false,
    loading: () => <BookDetailsSkeleton compact={true} />,
  },
)

type BookListLayoutProps = {
  sidebar?: ReactNode
  sidebarWidth?: number
  onSidebarWidthChange?: (width: number) => void

  headerBreadcrumbs: ({ label: string; url?: string } | { render: ReactNode })[]
  headerActions?: ReactNode

  children: ReactNode

  selectedBookUuid: string | null
  // the matching row from the list query. forwarded to the detail content,
  // which seeds the getBook cache from it so the panel needs no extra fetch.
  selectedBook?: BookWithRelations
  onClosePanel: () => void
  // step through the list from the panel. undefined at the list boundaries.
  nextBook?: () => void
  previousBook?: () => void
}

export function BookListLayout({
  sidebar,
  sidebarWidth,
  onSidebarWidthChange,
  headerBreadcrumbs,
  headerActions,
  children,
  selectedBookUuid,
  selectedBook,
  onClosePanel,
  nextBook,
  previousBook,
}: BookListLayoutProps) {
  const isMobile = useIsMobile()
  const dispatch = useAppDispatch()

  const focusCollection = useCallback(() => {
    document.getElementById(BOOK_COLLECTION_ID)?.focus()
  }, [])

  // "go to books": jump focus straight into the collection from anywhere
  useHotkey("G", focusCollection, { ignoreInputs: true })

  const panelWidth = useAppSelector(
    (state) => state.uiSettings.detailPanelWidth,
  )
  const bookLayout = useAppSelector((state) => state.uiSettings.bookLayout)

  const panelOpen = !!selectedBookUuid
  const animate = useLayoutAnimations() && !isMobile

  const handlePanelWidthChange = useCallback(
    (width: number) => {
      dispatch(uiSettingsSlice.actions.setDetailPanelWidth(width))
    },
    [dispatch],
  )

  const { animatePanelOpen } = useUserPreferences()
  const cardWidth =
    GRID_CARD_WIDTHS[useAppSelector((state) => state.uiSettings.gridCardSize)]
  const gridGap =
    GRID_SPACING_PX[useAppSelector((state) => state.uiSettings.gridSpacing)]
  const pageLayoutRef = useRef<HTMLDivElement>(null)

  const GRID_PADDING = 48 // PageContent p-6 (24px each side)

  // TODO: remove?
  const snapChromeWidth = useCallback(
    (rawWidth: number, otherChrome: number, minW: number, maxW: number) => {
      const layoutWidth =
        pageLayoutRef.current?.offsetWidth ?? window.innerWidth

      const pitch = cardWidth + gridGap
      const available = layoutWidth - otherChrome - GRID_PADDING

      const gridWidth = available - rawWidth
      const idealCols = Math.max(1, Math.round((gridWidth + gridGap) / pitch))

      // walk outward from the ideal column count until we find one whose
      // chrome width falls within [minW, maxW]. at most one step needed
      // in each direction since the pitch is large relative to the bounds.
      for (let delta = 0; delta <= idealCols; delta++) {
        for (const d of delta === 0 ? [0] : [-delta, delta]) {
          const cols = idealCols + d
          if (cols < 1) continue

          const chrome = available - (cols * pitch - gridGap)
          if (chrome >= minW && chrome <= maxW) return chrome
        }
      }

      return Math.max(
        minW,
        Math.min(maxW, available - (idealCols * pitch - gridGap)),
      )
    },
    [cardWidth, gridGap, GRID_PADDING],
  )

  const snapPanelWidth = useCallback(
    (raw: number) =>
      snapChromeWidth(
        raw,
        sidebar ? sidebarWidth ?? 280 : 0,
        MIN_PANEL_WIDTH,
        MAX_PANEL_WIDTH,
      ),
    [snapChromeWidth, sidebar, sidebarWidth],
  )

  const driver = usePanelWidthDriver({
    open: panelOpen && !isMobile,
    storedWidth: panelWidth,
    animate,
    // `animate` keeps the grid FLIP on; this only toggles the open/close slide,
    // so both feels can be compared from the preference.
    animateOpenClose: animate && animatePanelOpen,
    slideMode: "transform",
    chromeEl: pageLayoutRef,
    snapOnRelease:
      !animate && bookLayout === "grid" ? snapPanelWidth : undefined,
    commit: handlePanelWidthChange,
  })

  const { state: sidebarState } = useSidebar()
  const [sidebarResizing, setSidebarResizing] = useState(false)
  const prevSidebarState = useRef(sidebarState)
  useLayoutEffect(() => {
    if (prevSidebarState.current === sidebarState) return
    prevSidebarState.current = sidebarState
    setSidebarResizing(true)
    const id = setTimeout(() => {
      setSidebarResizing(false)
    }, 260)
    return () => {
      clearTimeout(id)
    }
  }, [sidebarState])

  // keep the closing panel's content mounted while it slides shut
  // very annoying
  const lastSelectedRef = useRef<{
    uuid: string
    book: BookWithRelations | undefined
  } | null>(null)
  useEffect(() => {
    if (selectedBookUuid) {
      lastSelectedRef.current = { uuid: selectedBookUuid, book: selectedBook }
    }
  }, [selectedBookUuid, selectedBook])

  const shownUuid =
    selectedBookUuid ??
    (animate && driver.visible ? lastSelectedRef.current?.uuid ?? null : null)
  const shownBook = selectedBookUuid
    ? selectedBook
    : lastSelectedRef.current?.book

  // re-snap the stored panel width so the grid starts with whole columns. runs
  // on mount, when the panel opens/closes, when the card size changes, or when
  // the layout resizes (window resize, app sidebar toggle). animated mode
  // skips this: the grid is fluid there, so any width yields full rows.
  const snapRef = useRef({
    panelWidth,
    sidebarWidth,
    sidebar,
    dispatch,
  })
  snapRef.current = {
    panelWidth,
    sidebarWidth,
    sidebar,
    dispatch,
  }

  const [layoutWidth, setLayoutWidth] = useState(0)

  useEffect(() => {
    const el = pageLayoutRef.current
    if (!el) return

    setLayoutWidth(el.offsetWidth)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setLayoutWidth(Math.round(entry.contentRect.width))
    })

    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (layoutWidth === 0 || animate) return

    const { panelWidth, sidebarWidth, sidebar, dispatch } = snapRef.current
    const currentSidebar = sidebar ? sidebarWidth ?? 280 : 0

    if (panelOpen) {
      const snapped = snapChromeWidth(
        panelWidth,
        currentSidebar,
        MIN_PANEL_WIDTH,
        MAX_PANEL_WIDTH,
      )

      if (Math.abs(snapped - panelWidth) > 1) {
        dispatch(uiSettingsSlice.actions.setDetailPanelWidth(snapped))
      }
    }
  }, [panelOpen, cardWidth, layoutWidth, snapChromeWidth, animate])

  const handlePanelKeyDown = useCallback((e: React.KeyboardEvent) => {
    const returnFocus = () => {
      document.getElementById(BOOK_COLLECTION_ID)?.focus()
    }

    if (e.key === "Escape") {
      e.preventDefault()
      // returning focus is the cancel action; don't also close the panel
      e.stopPropagation()
      returnFocus()
      return
    }

    if (e.key === "ArrowLeft") {
      const t = e.target as HTMLElement
      const tag = t.tagName
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t.isContentEditable ||
        t.getAttribute("role") === "slider"
      ) {
        return
      }
      e.preventDefault()
      returnFocus()
    }
  }, [])

  const coverScopeProps = useCoverScope(shownBook)
  useEscapeHandler(ESCAPE_PRIORITY.closePanel, onClosePanel, panelOpen)

  if (isMobile) {
    return (
      <>
        <PageLayout>
          <PageMain>
            <SkipToBooksLink />
            <PageHeader>
              <SiteHeader
                breadcrumbs={headerBreadcrumbs}
                actions={headerActions}
              />
            </PageHeader>

            {children}
          </PageMain>
        </PageLayout>

        <BookDetailDrawer
          selectedBookUuid={selectedBookUuid}
          selectedBook={selectedBook}
          onClose={onClosePanel}
          nextBook={nextBook}
          previousBook={previousBook}
        />
      </>
    )
  }

  return (
    <PanelResizeProvider
      value={{
        live: driver.dragging || driver.sliding || sidebarResizing,
        sliding: driver.phase !== null,
        pendingWidthDelta: driver.phase === "opening" ? -panelWidth : 0,
      }}
    >
      <PageLayout ref={pageLayoutRef}>
        {sidebar && (
          <PageSidebar
            width={sidebarWidth ?? 280}
            {...(onSidebarWidthChange && {
              onWidthChange: onSidebarWidthChange,
            })}
          >
            {sidebar}
          </PageSidebar>
        )}

        <PageMain>
          <SkipToBooksLink />
          <PageHeader>
            <SiteHeader
              breadcrumbs={headerBreadcrumbs}
              actions={headerActions}
            />
          </PageHeader>

          {children}
        </PageMain>

        <PagePanel
          open={driver.visible}
          width={panelWidth}
          panelRef={driver.panelRef}
          onResizeStart={driver.startDrag}
          dragging={driver.dragging}
          colors={coverScopeProps}
        >
          {shownUuid && (
            <div
              id={BOOK_DETAIL_PANEL_ID}
              role="region"
              aria-label="Book details"
              tabIndex={-1}
              onKeyDown={handlePanelKeyDown}
              className="flex h-full w-full flex-col outline-none"
            >
              <DynamicBookDetailsContent
                uuid={shownUuid as UUID}
                initialBook={shownBook}
                compact
                onClose={onClosePanel}
                nextBook={nextBook}
                previousBook={previousBook}
              />
            </div>
          )}
        </PagePanel>
      </PageLayout>
    </PanelResizeProvider>
  )
}

// a11y skip link
export function SkipToBooksLink() {
  return (
    <a
      href={`#${BOOK_COLLECTION_ID}`}
      onClick={(e) => {
        e.preventDefault()
        document.getElementById(BOOK_COLLECTION_ID)?.focus()
      }}
      className="bg-background focus:ring-primary sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:border focus:px-3 focus:py-2 focus:text-sm focus:shadow focus:ring-2 focus:outline-none"
    >
      Skip to books
    </a>
  )
}

// mobile
export function BookDetailDrawer({
  selectedBookUuid,
  selectedBook,
  onClose,
  nextBook,
  previousBook,
}: {
  selectedBookUuid: string | null
  selectedBook?: BookWithRelations
  onClose: () => void
  nextBook?: () => void
  previousBook?: () => void
}) {
  // keep the closing drawer's content mounted while it slides shut; vaul
  // unmounts the portal itself once the exit animation finishes
  const lastSelectedRef = useRef<{
    uuid: string
    book: BookWithRelations | undefined
  } | null>(null)
  useEffect(() => {
    if (selectedBookUuid) {
      lastSelectedRef.current = { uuid: selectedBookUuid, book: selectedBook }
    }
  }, [selectedBookUuid, selectedBook])

  const shownUuid = selectedBookUuid ?? lastSelectedRef.current?.uuid ?? null
  const shownBook = selectedBookUuid
    ? selectedBook
    : lastSelectedRef.current?.book

  return (
    <Drawer.Root
      open={!!selectedBookUuid}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />

        <Drawer.Content className="bg-background fixed right-0 bottom-0 left-0 z-40 flex h-[85svh] flex-col overflow-hidden rounded-t-2xl">
          <div
            id="book-detail-drawer-handle"
            className="bg-muted-foreground/20 relative z-10 mx-auto mt-4 -mb-6 h-1.5 w-12 shrink-0 rounded-full"
          />

          <Drawer.Title className="sr-only">Book Details</Drawer.Title>

          {shownUuid && (
            <DynamicBookDetailsContent
              uuid={shownUuid as UUID}
              initialBook={shownBook}
              compact
              onClose={onClose}
              nextBook={nextBook}
              previousBook={previousBook}
            />
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
