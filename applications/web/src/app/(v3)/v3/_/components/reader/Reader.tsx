"use client"

import type { EpubNavigator } from "@readium/navigator"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Tile } from "@v3/_/components/books/Cover"
import { Button } from "@v3/_/components/ui/button"
import { Spinner } from "@v3/_/components/ui/spinner"
import { useDocumentVisibility } from "@v3/_/hooks/use-document-visibility"
import { usePrevious } from "@v3/_/hooks/use-previous"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import type { BookWithRelations } from "@/database/books"
import * as icon from "@/icons"
import { isRtlPublication, isVerticalPublication } from "@/reader/helpers"
import { readerPlayer } from "@/services/AudioPlayerService"
import { nextPagePressed, previousPagePressed } from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { getActiveFrame } from "@/store/readerRegistry"
import {
  applyReaderTheme,
  getInitialHydratedPreferences,
  removeReaderTheme,
  selectPreference,
} from "@/store/slices/preferencesSlice"
import {
  type ReadingMode,
  readingSessionSlice,
  selectActiveFrameUrl,
  selectCurrentBook,
  selectCurrentLocator,
  selectIsLoadingPublication,
  selectReaderError,
  selectReaderErrorMessage,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"

import { usePiPWindow } from "./PipProvider"
import { MINI_PLAYER_HEIGHT, MINI_PLAYER_WIDTH } from "./constants"
import { getClientXY } from "./hooks/mouseHelpers"
import { useNavigator } from "./hooks/useNavigator"
import { NavigatorEventsProvider } from "./hooks/useNavigatorEvents"
import { useReaderKeyboard } from "./hooks/useReaderKeyboard"
import { ReaderFooter } from "./readerParts/ReaderFooter"
import { ReaderHeader } from "./readerParts/ReaderHeader"
import { useWakeLock } from "./useWakeLock"

const EDGE_BUTTON_CLASS =
  "group hover:text-reader-text-muted focus-visible:text-reader-text absolute inset-y-0 flex w-[10%] items-center justify-center border-none bg-transparent text-transparent transition-colors duration-200 outline-none md:w-[5%]"

const ReaderComponent = ({
  book,
  mode,
  startHref,
}: {
  book: BookWithRelations
  mode?: ReadingMode | undefined
  startHref?: string | undefined
}) => {
  const dispatch = useAppDispatch()
  const containerRef = useRef<HTMLDivElement>(null)

  const navigatorRef = useRef<EpubNavigator | null>(null)
  const currentReadingBook = useAppSelector(selectCurrentBook)

  const actualMode = useAppSelector(selectReadingMode)
  const reducedMotion = useReducedMotion()
  const t = useTranslation("Reader")

  const isThemeApplied = useRef(false)
  if (!isThemeApplied.current) {
    applyReaderTheme(getInitialHydratedPreferences(book.uuid), book, document)
    isThemeApplied.current = true
  }

  useEffect(() => {
    return () => {
      if (actualMode === "epub") {
        dispatch(readingSessionSlice.actions.closeBook())
      }

      removeReaderTheme(document)
      isThemeApplied.current = false
    }
  }, [dispatch, actualMode])

  const publicationLoading = useAppSelector(selectIsLoadingPublication)
  const readerError = useAppSelector(selectReaderError)
  const readerErrorMessage = useAppSelector(selectReaderErrorMessage)

  const appliedStartHrefRef = useRef<string | null>(null)

  useEffect(() => {
    const requestedHref =
      startHref && !startHref.includes("#") && window.location.hash
        ? `${startHref}${window.location.hash}`
        : startHref
    const pendingStartHref =
      requestedHref && appliedStartHrefRef.current !== requestedHref
        ? requestedHref
        : undefined

    if (currentReadingBook?.uuid === book.uuid && !pendingStartHref) {
      dispatch(
        readingSessionSlice.actions.setSyncing(actualMode === "readaloud"),
      )
      return
    }

    if (publicationLoading) {
      return
    }

    dispatch(
      readingSessionSlice.actions.startBook({
        book,
        requestedMode: mode ?? "epub",
        startHref: pendingStartHref,
      }),
    )

    if (pendingStartHref) {
      appliedStartHrefRef.current = pendingStartHref
      const url = new URL(window.location.href)
      url.searchParams.delete("href")
      url.hash = ""
      window.history.replaceState(null, "", url)
    }
  }, [
    startHref,
    book,
    currentReadingBook?.uuid,
    dispatch,
    actualMode,
    mode,
    publicationLoading,
  ])

  const { isLoading: navigatorLoading, loadNavigator } = useNavigator({
    book,
    containerRef,
    navigatorRef,
  })

  const currentLocator = useAppSelector(selectCurrentLocator)

  const documentVisibility = useDocumentVisibility()
  const previousDocumentVisibility = usePrevious(documentVisibility)

  useWakeLock((error) => {
    console.warn("Wake lock unavailable", error)
  })
  const { requestPipWindow, pipWindow } = usePiPWindow()

  useEffect(() => {
    if (
      previousDocumentVisibility &&
      previousDocumentVisibility === documentVisibility
    ) {
      return
    }

    if (documentVisibility === "hidden") {
      readerPlayer().setUpdateInterval(5_000)
      const shouldShowPip =
        (mode === "readaloud" || mode === "audiobook") &&
        !pipWindow &&
        readerPlayer().getState().playing
      if (shouldShowPip) {
        void requestPipWindow(MINI_PLAYER_WIDTH, MINI_PLAYER_HEIGHT)
      }
      return
    }

    readerPlayer().setUpdateInterval(200)

    const frame = getActiveFrame()
    // @ts-expect-error private properties, mirrors frameUtils.isFrameValid
    if (frame && (frame.destroyed || frame.hidden)) {
      void loadNavigator(currentLocator)
    }
  }, [
    documentVisibility,
    previousDocumentVisibility,
    loadNavigator,
    pipWindow,
    requestPipWindow,
    currentLocator,
    mode,
  ])

  const memoizedContainerRef = useMemo(() => {
    if (actualMode === "audiobook") {
      return (
        <motion.div
          drag
          className="relative mx-auto flex h-full items-center justify-center [&>iframe]:relative [&>iframe]:h-full [&>iframe]:w-full"
          dragElastic={0.12}
          dragMomentum={true}
          dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <Tile
            image={
              book.audiobook?.cover ??
              book.ebook?.cover ??
              book.readaloud?.cover
            }
            size={400}
            alt={book.title}
            type="audiobook"
            fit="cover"
            className="my-8 size-[200px] shadow-lg"
          />
        </motion.div>
      )
    }

    return (
      <div
        ref={containerRef}
        suppressHydrationWarning
        className="relative mx-auto h-full [&_iframe]:relative [&_iframe]:h-full [&_iframe]:w-full"
      />
    )
  }, [actualMode, book])

  const [isFullscreen, setIsFullscreen] = useState(false)
  const canFullscreen =
    typeof document !== "undefined" && document.fullscreenEnabled

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement !== null)
    }
    onFullscreenChange()
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange)
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }
    void document.documentElement.requestFullscreen()
  }, [])

  const layout = useAppSelector((state) => selectPreference(state, "layout"))
  const activeFrameUrl = useAppSelector(selectActiveFrameUrl)
  const scrollsVertically = layout === "scrollable" && !isVerticalPublication()
  const rtl = !publicationLoading && isRtlPublication()

  const [hideUi, setHideUi] = useState(false)
  const toggleUI = useCallback((event: MouseEvent | TouchEvent) => {
    const [middleX, middleY] = getClientXY(event)
    if (middleX === undefined || middleY === undefined) return

    if (
      middleX > window.innerWidth / 3 &&
      middleX < (window.innerWidth / 3) * 2 &&
      middleY > window.innerHeight / 8 &&
      middleY < (window.innerHeight / 8) * 7
    ) {
      setHideUi((prev) => !prev)
    }

    return false
  }, [])

  const revealUi = useCallback(() => {
    setHideUi(false)
  }, [])

  useReaderKeyboard({
    bookId: book.uuid,
    ...(canFullscreen ? { onToggleFullscreen: toggleFullscreen } : {}),
    ...(hideUi ? { onRevealUi: revealUi } : {}),
  })

  const [hoverOverUi, setHoverOverUi] = useState(false)
  const handleUIMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!hideUi) return

      const [middleX, middleY] = getClientXY(event)
      if (middleX === undefined || middleY === undefined) return

      if (middleY < 60 || middleY > window.innerHeight - 60) {
        setHoverOverUi(true)
      } else {
        setHoverOverUi(false)
      }

      return false
    },
    [hideUi],
  )

  const showUi = !hideUi || hoverOverUi

  const listeners = useMemo(() => {
    return {
      clickOrTap: [{ handler: toggleUI, priority: 90 }],
      mouseMove: [{ handler: handleUIMouseMove, priority: 50 }],
    }
  }, [toggleUI, handleUIMouseMove])

  const showLoading =
    actualMode !== "audiobook" &&
    (navigatorLoading || publicationLoading) &&
    !readerError

  return (
    <NavigatorEventsProvider
      activeFrameKey={activeFrameUrl}
      listeners={listeners}
    >
      <div className="bg-reader-bg text-reader-text relative flex h-full max-h-screen w-full max-w-[100vw] flex-col overflow-clip">
        <ReaderHeader
          book={book}
          isVisible={showUi}
          {...(canFullscreen
            ? { isFullscreen, onToggleFullscreen: toggleFullscreen }
            : {})}
        />

        <div
          className={cn(
            "relative mx-auto h-full w-full flex-1 touch-manipulation md:touch-auto",
            scrollsVertically ? "-mt-12 -mb-20 md:-mb-16" : "my-4",
          )}
        >
          {memoizedContainerRef}
          {actualMode !== "audiobook" && (
            <>
              <button
                type="button"
                aria-label={t.plain(
                  rtl ? "toolbar.previousPage" : "toolbar.nextPage",
                )}
                className={cn(EDGE_BUTTON_CLASS, "right-0")}
                onClick={() => {
                  dispatch(rtl ? previousPagePressed() : nextPagePressed())
                }}
              >
                <icon.ChevronRight
                  size="lg"
                  className="transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-active:scale-90"
                />
              </button>
              <button
                type="button"
                aria-label={t.plain(
                  rtl ? "toolbar.nextPage" : "toolbar.previousPage",
                )}
                className={cn(EDGE_BUTTON_CLASS, "left-0")}
                onClick={() => {
                  dispatch(rtl ? nextPagePressed() : previousPagePressed())
                }}
              >
                <icon.ChevronLeft
                  size="lg"
                  className="transition-transform duration-200 ease-out group-hover:-translate-x-0.5 group-active:scale-90"
                />
              </button>
            </>
          )}
        </div>

        <AnimatePresence>
          {showLoading && (
            <motion.div
              key="reader-loading"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: reducedMotion ? 0 : 0.25,
                ease: "easeOut",
              }}
              className="bg-reader-bg absolute inset-0 z-10 flex items-center justify-center"
            >
              <Spinner className="text-reader-text-muted size-6" />
            </motion.div>
          )}
        </AnimatePresence>

        {readerError && (
          <div className="bg-reader-bg absolute inset-0 z-10 flex items-center justify-center">
            <div className="text-reader-text mx-8 flex max-w-md flex-col items-center gap-3 text-center">
              <icon.AlertCircle className="text-reader-accent size-8" />
              <h2 className="font-heading text-xl font-semibold">
                {t(`error.${readerError}`)}
              </h2>
              {readerErrorMessage && (
                <p className="text-reader-text-secondary text-sm">
                  {readerErrorMessage}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  className="border-reader-border text-reader-text hover:bg-reader-surface-hover"
                  onClick={() => {
                    dispatch(readingSessionSlice.actions.clearReaderError())
                    dispatch(
                      readingSessionSlice.actions.startBook({
                        book,
                        requestedMode: mode ?? "epub",
                      }),
                    )
                  }}
                >
                  {t("error.tryAgain")}
                </Button>
                <Button
                  className="bg-reader-accent text-reader-bg hover:bg-reader-accent-hover"
                  onClick={() => {
                    dispatch(readingSessionSlice.actions.clearReaderError())
                    window.history.back()
                  }}
                >
                  {t("error.goBack")}
                </Button>
              </div>
            </div>
          </div>
        )}

        <ReaderFooter book={book} isVisible={showUi} />
      </div>
    </NavigatorEventsProvider>
  )
}

export const Reader = dynamic(() => Promise.resolve(ReaderComponent), {
  ssr: false,
  loading: () => (
    <div className="bg-reader-bg flex h-full w-full items-center justify-center">
      <Spinner className="text-reader-text-muted size-6" />
    </div>
  ),
})
