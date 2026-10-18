import {
  EpubNavigator,
  EpubPreferences,
  type FrameManager,
} from "@readium/navigator"
import { Locator, getHtmlId } from "@readium/shared"
import { useCallback, useEffect, useRef, useState } from "react"

import { type BookWithRelations } from "@/database/books"
import {
  getLocatorWithClosestPositionAsync,
  translateLocator,
} from "@/reader/BookService"
import { isScrollingLayout, isVerticalPublication } from "@/reader/helpers"
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
  selectStartLocator,
} from "@/store/slices/readingSessionSlice"

const VERTICAL_OVERFLOW_STYLE_ID = "reader-vertical-overflow"

const VERTICAL_END_ATTRIBUTE = "data-reader-vertical-end"

const VERTICAL_EDGE_PADDING = 40

const VERTICAL_FRAME_STYLES = `body { overflow: visible !important; }
:root:not([style*="readium-scroll-on"]) body { padding-block: ${VERTICAL_EDGE_PADDING}px !important; }
[${VERTICAL_END_ATTRIBUTE}]::after { content: ""; display: block; block-size: ${VERTICAL_EDGE_PADDING}px; }`

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
  const generationRef = useRef(0)
  const loadingGenerationRef = useRef<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

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
  const startLocator = useAppSelector(selectStartLocator)

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
      if (
        publicationLoading ||
        !publication ||
        !positions ||
        initialPositionLoading ||
        !containerRef.current ||
        loadingGenerationRef.current === generationRef.current
      ) {
        return
      }

      const generation = generationRef.current
      const isStale = () => generation !== generationRef.current
      loadingGenerationRef.current = generation

      try {
        let initialLocator = startingLocator

        if (initialLocator && !initialLocator.locations.position) {
          initialLocator = await getLocatorWithClosestPositionAsync(
            initialLocator,
            positions,
          )
          if (isStale()) return
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

        void navigatorRef.current?.destroy()

        const host = document.createElement("div")
        host.className = "relative h-full w-full"
        containerRef.current.replaceChildren(host)

        // shutup
        // eslint-disable-next-line react-compiler/react-compiler
        navigatorRef.current = new EpubNavigator(
          host,
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
                    style.textContent = VERTICAL_FRAME_STYLES
                    frameDocument.head.appendChild(style)
                    frameDocument.body.lastElementChild?.setAttribute(
                      VERTICAL_END_ATTRIBUTE,
                      "",
                    )
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
            injectables: {
              rules: [],
              allowedDomains: [
                window.location.origin,
                "https://fonts.googleapis.com",
                "https://fonts.gstatic.com",
              ],
            },
          },
        )

        const navigator = navigatorRef.current
        await navigator.load()
        if (isStale()) {
          await navigator.destroy()
          return
        }

        if (
          initialLocator &&
          (isVerticalPublication(publication) ||
            getHtmlId(initialLocator.locations))
        ) {
          await new Promise<void>((resolve) => {
            navigator.go(initialLocator, false, () => {
              resolve()
            })
          })
          if (isStale()) return
        }

        // update timestamp tracking and reset force refresh
        const currentTimestamp =
          book.ebook?.updatedAt ||
          book.audiobook?.updatedAt ||
          book.readaloud?.updatedAt ||
          new Date().toISOString()

        lastContentTimestampRef.current = currentTimestamp
        registerNavigator(navigator)

        setIsLoading(false)
      } catch (error) {
        if (isStale()) return
        console.error("Failed to load publication:", error)
        if (
          error instanceof Error &&
          error.message.includes("Locator not found in positions list")
        ) {
          // try again

          loadingGenerationRef.current = null
          await loadNavigator(positions[0] ?? null)
          return
        }

        setIsLoading(false)
        isLoadingRef.current = false
      } finally {
        if (loadingGenerationRef.current === generation) {
          loadingGenerationRef.current = null
        }
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

    const initialLocator =
      startLocator ??
      (initialPosition?.locator
        ? (Locator.deserialize(initialPosition.locator) ?? null)
        : null)

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
    startLocator,
    navigatorRef,
    publicationLoading,
    dispatch,
    mode,
    loadNavigator,
    reloadKey,
  ])

  useEffect(() => {
    const container = containerRef.current
    return () => {
      generationRef.current += 1
      registerNavigator(null)
      void navigatorRef.current?.destroy()
      navigatorRef.current = null
      container?.replaceChildren()
      isLoadingRef.current = true
      setIsLoading(true)
      setReloadKey((key) => key + 1)
    }
  }, [containerRef, navigatorRef])

  return {
    navigatorRef,
    isLoading,
    loadNavigator,
  }
}
