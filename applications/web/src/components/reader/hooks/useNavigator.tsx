import {
  EpubNavigator,
  EpubPreferences,
  type FrameManager,
} from "@readium/navigator"
import { Locator } from "@readium/shared"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  getLocatorWithClosestPositionAsync,
  translateLocator,
} from "@/components/reader/BookService"
import {
  isScrollingLayout,
  isVerticalPublication,
} from "@/components/reader/helpers"
import { type BookWithRelations } from "@/database/books"
import { syncPosition } from "@/store/actions"
import { useGetPositionQuery } from "@/store/api"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  getPositions,
  getPublication,
  registerNavigator,
} from "@/store/readerRegistry"
import {
  applyFrameTheme,
  readReaderTokens,
  readiumIfyPreferences,
  selectBookPreferences,
} from "@/store/slices/preferencesSlice"
import {
  readingSessionSlice,
  selectIsLoadingPublication,
  selectIsSyncing,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"

const VERTICAL_OVERFLOW_STYLE_ID = "reader-vertical-overflow"

type UseNavigatorOptions = {
  book: BookWithRelations
  containerRef: React.RefObject<HTMLDivElement | null>
  // pass in refs for position manager to use
  navigatorRef: React.RefObject<EpubNavigator | null>
}

export const useNavigator = ({
  book,
  containerRef,
  navigatorRef,
}: UseNavigatorOptions) => {
  const [isLoading, setIsLoading] = useState(true)
  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading

  const syncingRef = useRef(false)
  const syncing = useAppSelector(selectIsSyncing)
  syncingRef.current = syncing

  // track content timestamp to detect changes
  const lastContentTimestampRef = useRef<string | null>(null)

  const { data: initialPosition, isLoading: initialPositionLoading } =
    useGetPositionQuery({ uuid: book.uuid })

  const preferences = useAppSelector((state) =>
    selectBookPreferences(state, book.uuid),
  )
  const preferencesRef = useRef(preferences)
  preferencesRef.current = preferences

  const publicationLoading = useAppSelector(selectIsLoadingPublication)

  const epubPreferences = useCallback(
    () => readiumIfyPreferences(preferencesRef.current, readReaderTokens()),
    [],
  )

  const dispatch = useAppDispatch()
  const mode = useAppSelector(selectReadingMode)

  const loadNavigator = useCallback(
    async (startingLocator: Locator | null) => {
      const publication = getPublication()

      const positions = getPositions()
      if (publicationLoading || !publication || !positions) return

      try {
        if (initialPositionLoading || !containerRef.current) {
          return
        }

        let initialLocator = startingLocator

        if (initialLocator && !initialLocator.locations.position) {
          initialLocator = await getLocatorWithClosestPositionAsync(
            initialLocator,
            positions,
          )
        }
        // absolute fallback, just go to the first position
        if (!initialLocator?.locations.position) {
          initialLocator = positions[0] ?? null
        }

        // if somehow the initial position is larger than the last position, set it to the last position
        if (
          initialLocator?.locations.position &&
          initialLocator.locations.position >
            (positions[positions.length - 1]?.locations.position ?? 0)
        ) {
          initialLocator = positions[positions.length - 1] ?? null
        }

        // shutup
        // eslint-disable-next-line react-compiler/react-compiler
        navigatorRef.current = new EpubNavigator(
          containerRef.current,
          publication,
          {
            frameLoaded(_window) {
              navigatorRef.current?._cframes.forEach((frameManager) => {
                if (!frameManager) return

                if (frameManager.msg) {
                  const frameDocument =
                    frameManager.iframe.contentWindow?.document
                  // faster to do it here
                  applyFrameTheme(
                    preferencesRef.current,
                    readReaderTokens(),
                    frameDocument,
                  )
                  if (
                    frameDocument &&
                    isVerticalPublication(publication) &&
                    !frameDocument.getElementById(VERTICAL_OVERFLOW_STYLE_ID)
                  ) {
                    const style = frameDocument.createElement("style")
                    style.id = VERTICAL_OVERFLOW_STYLE_ID
                    style.textContent = "body { overflow: visible !important; }"
                    frameDocument.head.appendChild(style)
                  }
                  void navigatorRef.current?.submitPreferences(
                    new EpubPreferences(epubPreferences()),
                  )
                  dispatch(
                    readingSessionSlice.actions.setActiveFrame(
                      frameManager as FrameManager,
                    ),
                  )
                }
              })
            },
            scroll() {
              return true
            },
            positionChanged(locator) {
              if (
                mode === "epub" &&
                isScrollingLayout(preferencesRef.current.layout)
              ) {
                dispatch(
                  syncPosition({
                    locator,
                    timestamp: Date.now(),
                    bookUuid: book.uuid,
                  }),
                )
              }
            },
            tap() {
              return true
            },
            click() {
              return true
            },
            zoom() {},
            miscPointer() {},
            customEvent() {},
            handleLocator(locator) {
              const href = locator.href
              if (
                href.startsWith("http://") ||
                href.startsWith("https://") ||
                href.startsWith("mailto:") ||
                href.startsWith("tel:")
              ) {
                if (confirm(`Open "${href}" ?`)) window.open(href, "_blank")
              } else {
                console.warn("Unhandled locator", locator)
              }
              return false
            },

            textSelected() {
              return true
            },
            timelineItemChanged() {
              return true
            },
            contentProtection() {
              return true
            },
            contextMenu() {
              return true
            },
            peripheral() {
              return true
            },
          },
          positions,
          initialLocator ?? undefined,
          {
            defaults: epubPreferences(),
            preferences: epubPreferences(),
          },
        )

        await navigatorRef.current.load()

        // update timestamp tracking and reset force refresh
        const currentTimestamp =
          book.ebook?.updatedAt ||
          book.audiobook?.updatedAt ||
          book.readaloud?.updatedAt ||
          new Date().toISOString()

        lastContentTimestampRef.current = currentTimestamp
        registerNavigator(navigatorRef.current)

        setIsLoading(false)
      } catch (error) {
        console.error("Failed to load publication:", error)
        if (
          error instanceof Error &&
          error.message.includes("Locator not found in positions list")
        ) {
          // try again

          await loadNavigator(positions[0] ?? null)
          return
        }

        setIsLoading(false)
        isLoadingRef.current = false
      }
    },
    [
      book.audiobook?.updatedAt,
      book.ebook?.updatedAt,
      book.readaloud?.updatedAt,
      book.uuid,
      containerRef,
      dispatch,
      epubPreferences,
      initialPositionLoading,
      mode,
      navigatorRef,
      publicationLoading,
    ],
  )

  useEffect(() => {
    if (mode === "audiobook") {
      return
    }

    const initialLocator = initialPosition?.locator
      ? Locator.deserialize(initialPosition.locator) ?? null
      : null

    const translatedLocator = initialLocator
      ? translateLocator(initialLocator, mode)
      : null

    if (!isLoadingRef.current) return

    // failsafe
    if (document.visibilityState === "visible") {
      void loadNavigator(translatedLocator)
      return
    }

    const controller = new AbortController()
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState !== "visible") return
        controller.abort()
        void loadNavigator(translatedLocator)
      },
      { signal: controller.signal },
    )
    return () => {
      controller.abort()
    }
  }, [
    initialPositionLoading,
    isLoadingRef,
    book,
    containerRef,
    syncing,
    initialPosition?.locator,
    navigatorRef,
    publicationLoading,
    dispatch,
    mode,
    loadNavigator,
  ])

  useEffect(() => {
    return () => {
      registerNavigator(null)
      void navigatorRef.current?.destroy()
      navigatorRef.current = null
    }
  }, [navigatorRef])

  return {
    navigatorRef,
    isLoading,
    loadNavigator,
  }
}
