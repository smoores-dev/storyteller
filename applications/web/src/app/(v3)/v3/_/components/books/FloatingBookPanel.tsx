"use client"

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

import {
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
  ResizeHandle,
} from "@v3/_/components/ui/page-layout"
import {
  ESCAPE_PRIORITY,
  useEscapeHandler,
} from "@v3/_/hooks/use-escape-cascade"
import { useBookInSidePanel } from "@v3/_/hooks/use-open-book"
import {
  PANEL_SLIDE_DURATION,
  PANEL_SLIDE_EASING,
  usePanelWidthDriver,
} from "@v3/_/hooks/use-panel-width-driver"

import { DynamicBookDetailsContent } from "@/app/(v3)/v3/_/components/books/BookDetails/DynamicBookDetailsContent"
import { useIsMobile } from "@/app/(v3)/v3/_/hooks/use-mobile"
import { cn } from "@/cn"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { uiSettingsSlice } from "@/store/slices/uiSettingsSlice"
import { type UUID } from "@/uuid"

import { BookDetailDrawer } from "./BookListPage"

const FloatingBookPanelClaimContext = createContext<(() => () => void) | null>(
  null,
)

export function useClaimBookPanel() {
  const claim = useContext(FloatingBookPanelClaimContext)
  useEffect(() => claim?.(), [claim])
}

export function FloatingBookPanelProvider({
  children,
}: {
  children: ReactNode
}) {
  const [claims, setClaims] = useState(0)

  const claim = useCallback(() => {
    setClaims((count) => count + 1)
    return () => {
      setClaims((count) => count - 1)
    }
  }, [])

  return (
    <FloatingBookPanelClaimContext.Provider value={claim}>
      {children}
      <FloatingBookPanel suppressed={claims > 0} />
    </FloatingBookPanelClaimContext.Provider>
  )
}

const CLOSE_DURATION_MS = PANEL_SLIDE_DURATION

function FloatingBookPanel({ suppressed }: { suppressed: boolean }) {
  const isMobile = useIsMobile()
  const { selectedBookUuid, setSelectedBookUuid } = useBookInSidePanel()

  const storedWidth = useAppSelector(
    (state) => state.uiSettings.detailPanelWidth,
  )
  const width = Math.max(
    MIN_PANEL_WIDTH,
    Math.min(MAX_PANEL_WIDTH, storedWidth),
  )

  const open = !suppressed && !!selectedBookUuid

  const dispatch = useAppDispatch()
  const commitWidth = useCallback(
    (nextWidth: number) => {
      dispatch(uiSettingsSlice.actions.setDetailPanelWidth(nextWidth))
    },
    [dispatch],
  )
  const driver = usePanelWidthDriver({
    open: open && !isMobile,
    storedWidth: width,
    animate: false,
    commit: commitWidth,
  })

  const handleClose = useCallback(() => {
    void setSelectedBookUuid(null)
  }, [setSelectedBookUuid])

  useEscapeHandler(ESCAPE_PRIORITY.closePanel, handleClose, open)

  const lastUuidRef = useRef<string | null>(null)
  useEffect(() => {
    if (selectedBookUuid) lastUuidRef.current = selectedBookUuid
  }, [selectedBookUuid])

  const [rendered, setRendered] = useState(open)
  const [slidIn, setSlidIn] = useState(false)

  useEffect(() => {
    if (open) {
      setRendered(true)
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSlidIn(true)
        })
      })
      return () => {
        cancelAnimationFrame(raf)
      }
    }

    setSlidIn(false)
    const timeout = setTimeout(() => {
      setRendered(false)
    }, CLOSE_DURATION_MS)
    return () => {
      clearTimeout(timeout)
    }
  }, [open])

  if (isMobile) {
    return (
      <BookDetailDrawer
        selectedBookUuid={open ? selectedBookUuid : null}
        onClose={handleClose}
      />
    )
  }

  const shownUuid = selectedBookUuid ?? lastUuidRef.current
  if (!rendered || !shownUuid) return null

  return (
    <div
      ref={driver.panelRef}
      role="dialog"
      aria-label="Book details"
      className={cn(
        "bg-card fixed top-2 right-2 bottom-2 z-50 flex max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl shadow-2xl",
        "transition-transform",
        slidIn ? "translate-x-0" : "translate-x-[calc(100%+1rem)]",
      )}
      style={{
        width,
        transitionDuration: `${PANEL_SLIDE_DURATION}ms`,
        transitionTimingFunction: PANEL_SLIDE_EASING,
      }}
    >
      <ResizeHandle
        side="left"
        dragging={driver.dragging}
        onPointerDown={driver.startDrag}
        className="absolute inset-y-0 left-[7.5px] border-0"
      />
      <DynamicBookDetailsContent
        uuid={shownUuid as UUID}
        compact
        onClose={handleClose}
      />
    </div>
  )
}
