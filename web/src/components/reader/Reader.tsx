"use client"

import { useDocumentVisibility, usePrevious } from "@mantine/hooks"
import type { EpubNavigator } from "@readium/navigator"
import {
  IconChevronLeft,
  IconChevronRight,
  IconLoader2,
} from "@tabler/icons-react"
import classNames from "classnames"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { cn } from "@/cn"
import { AudiobookCoverImage } from "@/components/books/BookThumbnailImage"
import type { BookWithRelations } from "@/database/books"
import { AudioPlayer } from "@/services/AudioPlayerService"
import { nextPagePressed, previousPagePressed } from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { getActiveFrame } from "@/store/readerRegistry"
import {
  applyThemeToDocument,
  getInitialHydratedPreferences,
  removeThemeFromDocument,
  selectPreference,
} from "@/store/slices/preferencesSlice"
import {
  type ReadingMode,
  readingSessionSlice,
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

const ReaderComponent = ({
  book,
  mode,
}: {
  book: BookWithRelations
  mode?: ReadingMode | undefined
}) => {
  const dispatch = useAppDispatch()
  const containerRef = useRef<HTMLDivElement>(null)

  const navigatorRef = useRef<EpubNavigator | null>(null)
  const currentReadingBook = useAppSelector(selectCurrentBook)

  const actualMode = useAppSelector(selectReadingMode)

  const isThemeApplied = useRef(false)
  if (!isThemeApplied.current) {
    const preferences = getInitialHydratedPreferences(book.uuid)

    applyThemeToDocument(preferences, document)
    isThemeApplied.current = true
  }

  useEffect(() => {
    return () => {
      if (actualMode === "epub") {
        dispatch(readingSessionSlice.actions.closeBook())
      }

      removeThemeFromDocument(document)
      isThemeApplied.current = false
    }
  }, [dispatch, actualMode])

  const publicationLoading = useAppSelector(selectIsLoadingPublication)
  const readerError = useAppSelector(selectReaderError)
  const readerErrorMessage = useAppSelector(selectReaderErrorMessage)

  useEffect(() => {
    // we are returning from the mini player to the same book
    if (currentReadingBook?.uuid === book.uuid) {
      // turn syncing back on
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
      }),
    )
  }, [
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

  // TODO: maybe stop navigating as well?
  const documentVisibility = useDocumentVisibility()

  const previousDocumentVisibility = usePrevious(documentVisibility)

  const documentRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    documentRef.current = document.body
  }, [])

  const { acquireWakeLock } = useWakeLock(documentRef, {
    onError: (error) => {
      console.error("ERROR", error)
    },
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
      AudioPlayer.setUpdateInterval(5_000)
      if (!pipWindow) {
        void requestPipWindow(MINI_PLAYER_WIDTH, MINI_PLAYER_HEIGHT)
      }
    } else {
      AudioPlayer.setUpdateInterval(200)
      // technically superfluous bc it should happen in useWakeLock above, but just in case
      void acquireWakeLock()

      // sometimes when tab is not active, readium either premeptively destroys the frame or never "undestroys" it
      // this is rather heavy handed, but the easiest way to do it is to just reload the navigator
      const frame = getActiveFrame()
      if (!frame) return
      // @ts-expect-error private property, but no other way to check if the frame is destroyed or hidden
      if (!frame.destroyed && !frame.hidden) {
        return
      }

      // manually reload the navigator to reshow the frame
      // TODO: maybe there's a better way to do this
      void loadNavigator(currentLocator)
    }
  }, [
    documentVisibility,
    previousDocumentVisibility,
    loadNavigator,
    pipWindow,
    requestPipWindow,
    acquireWakeLock,
    currentLocator,
  ])

  const memoizedContainerRef = useMemo(() => {
    if (actualMode === "audiobook") {
      return (
        <div className="relative mx-auto flex h-full items-center justify-center [&>iframe]:relative [&>iframe]:h-full [&>iframe]:w-full">
          <div className="my-8">
            <AudiobookCoverImage book={book} height="200" width="200" />
          </div>
        </div>
      )
    }

    return (
      <div
        ref={containerRef}
        suppressHydrationWarning
        className={cn(
          "relative mx-auto h-full [&>iframe]:relative [&>iframe]:h-full [&>iframe]:w-full",
        )}
      />
    )
  }, [actualMode, book])

  const [isFullscreen, setIsFullscreen] = useState(false)

  const setFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      void document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])

  useReaderKeyboard(book.uuid)

  const layout = useAppSelector((state) => selectPreference(state, "layout"))

  const activeFrame = getActiveFrame()

  const [hideUi, setHideUi] = useState(false)
  const toggleUI = useCallback((event: MouseEvent | TouchEvent) => {
    const [middleX, middleY] = getClientXY(event)
    if (middleX === undefined || middleY === undefined) return

    // check if tap is in middleish of screen
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

  const [hoverOverUi, setHoverOverUi] = useState(false)
  // to show the ui when its hidden and the user is hovering over the top or bottom of the screen
  const handleUIMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!hideUi) return

      const [middleX, middleY] = getClientXY(event)
      if (middleX === undefined || middleY === undefined) return

      // top or bottom 60px
      if (middleY < 60 || middleY > window.innerHeight - 60) {
        setHoverOverUi(true)
      } else {
        setHoverOverUi(false)
      }

      return false
    },
    [hideUi],
  )

  const showUi = useMemo(() => {
    return !hideUi || hoverOverUi
  }, [hideUi, hoverOverUi])

  const listeners = useMemo(() => {
    return {
      clickOrTap: [{ handler: toggleUI, priority: 90 }],
      mouseMove: [{ handler: handleUIMouseMove, priority: 50 }],
    }
  }, [toggleUI, handleUIMouseMove])

  return (
    <>
      <NavigatorEventsProvider activeFrame={activeFrame} listeners={listeners}>
        <div className="bg-reader-bg text-reader-text relative flex h-full max-h-[100vh] w-full max-w-[100vw] flex-col overflow-clip">
          <ReaderHeader
            book={book}
            isVisible={showUi}
            isFullscreen={isFullscreen}
            onToggleFullscreen={setFullscreen}
          />

          <div
            className={classNames(
              "relative mx-auto h-full w-full flex-1 touch-manipulation md:touch-auto",
              layout === "paginated" ? "my-4" : "-mb-20 -mt-14",
            )}
          >
            {memoizedContainerRef}
            {actualMode !== "audiobook" && (
              // no point in having navigation buttons in audiobook mode
              <>
                <button
                  type="button"
                  className="hover:text-reader-text absolute right-0 top-1/2 flex h-screen w-[10%] -translate-y-1/2 items-center justify-center border-none bg-transparent text-transparent transition-colors md:w-[5%]"
                  onClick={() => {
                    dispatch(nextPagePressed())
                  }}
                >
                  <IconChevronRight size={20} />
                </button>
                <button
                  type="button"
                  className="hover:text-reader-text absolute left-0 top-1/2 flex h-screen w-[10%] -translate-y-1/2 items-center justify-center border-none bg-transparent text-transparent transition-colors md:w-[5%]"
                  onClick={() => {
                    dispatch(previousPagePressed())
                  }}
                >
                  <IconChevronLeft size={20} />
                </button>
              </>
            )}
          </div>

          {actualMode !== "audiobook" &&
            (navigatorLoading || publicationLoading) &&
            !readerError && (
              <div className="bg-reader-bg absolute flex h-full w-full items-center justify-center">
                <div className="text-reader-text text-lg">
                  <IconLoader2 className="animate-spin" size={20} />
                </div>
              </div>
            )}

          {readerError && (
            <div className="bg-reader-bg absolute flex h-full w-full items-center justify-center">
              <div className="text-reader-text mx-8 max-w-md text-center">
                <div className="mb-4 text-xl font-semibold">
                  {readerError === "book_not_found" && "Book Not Found"}
                  {readerError === "resource_not_found" && "Resource Not Found"}
                  {readerError === "service_unavailable" &&
                    "Service Unavailable"}
                  {readerError === "internal_error" && "Error Loading Book"}
                </div>
                <div className="mb-6">{readerErrorMessage}</div>
                <button
                  type="button"
                  className="bg-reader-accent text-reader-surface rounded-lg px-6 py-2 hover:opacity-80"
                  onClick={() => {
                    dispatch(readingSessionSlice.actions.clearReaderError())
                    window.history.back()
                  }}
                >
                  Go Back
                </button>
              </div>
            </div>
          )}

          <ReaderFooter book={book} isVisible={showUi} />
        </div>
      </NavigatorEventsProvider>
    </>
  )
}

export const Reader = dynamic(() => Promise.resolve(ReaderComponent), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <IconLoader2 className="animate-spin" size={20} />
    </div>
  ),
})
