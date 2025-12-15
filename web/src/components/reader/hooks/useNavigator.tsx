import { EpubNavigator, type FrameManager } from "@readium/navigator"
import { Locator } from "@readium/shared"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  getLocatorWithClosestPositionAsync,
  translateLocator,
} from "@/components/reader/BookService"
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
  applyThemeToDocument,
  selectBookPreferences,
  selectEpubPreferences,
} from "@/store/slices/preferencesSlice"
import {
  readingSessionSlice,
  selectIsLoadingPublication,
  selectIsSyncing,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"

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

  const epubPreferences = useAppSelector((state) =>
    selectEpubPreferences(state, book.uuid),
  )
  const epubPreferencesRef = useRef(epubPreferences)
  epubPreferencesRef.current = epubPreferences
  const preferences = useAppSelector((state) =>
    selectBookPreferences(state, book.uuid),
  )
  const preferencesRef = useRef(preferences)
  preferencesRef.current = preferences

  const publicationLoading = useAppSelector(selectIsLoadingPublication)

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
                  // faster to do it here
                  applyThemeToDocument(
                    preferencesRef.current,
                    frameManager.iframe.contentWindow?.document,
                  )
                  void navigatorRef.current?.submitPreferences(
                    epubPreferencesRef.current,
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
                preferencesRef.current.layout === "scrollable"
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
          },
          positions,
          initialLocator ?? undefined,
          {
            defaults: epubPreferencesRef.current,
            preferences: epubPreferencesRef.current,
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

    void loadNavigator(translatedLocator)
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
