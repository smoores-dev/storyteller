import { type FrameComms, type FrameManager } from "@readium/navigator"
import { type Locator, LocatorLocations } from "@readium/shared"
import { type ListenerEffectAPI, isAnyOf } from "@reduxjs/toolkit"

import {
  getLocatorForFragment,
  getLocatorWithClosestPositionAsync,
} from "@/components/reader/BookService"
import { withActiveFrame } from "@/components/reader/frameUtils"
import {
  findFirstVisibleLocator,
  isLocatorWithinViewport,
  isScrollingLayout,
  scrollToLocator,
} from "@/components/reader/helpers"
import { isSameLocator } from "@/components/reader/locators"
import { readerPlayer } from "@/services/AudioPlayerService"
import {
  bookLocatorChanged,
  nextPagePressed,
  previousPagePressed,
  requestHighlightUpdate,
  syncPosition,
  textNavigatedFromAudio,
  userRequestedTextNavigation,
} from "@/store/actions"
import type { AppDispatch, RootState } from "@/store/appState"
import {
  getNavigator,
  getPositions,
  getPublication,
} from "@/store/readerRegistry"
import { selectIsPlaying } from "@/store/slices/audioPlayerSlice"
import {
  applyFrameDim,
  selectBookPreferences,
  selectPreference,
} from "@/store/slices/preferencesSlice"
import {
  readingSessionSlice,
  selectCurrentBook,
  selectCurrentlyHighlightedFragment,
  selectDoubleClickTimeout,
  selectIsSyncing,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"

import {
  getGuidesForText,
  getHrefFromActiveFrame,
  highlightFragment,
} from "./helpers"
import { startAppListening } from "./listenerMiddleware"

type ListenerApi = ListenerEffectAPI<RootState, AppDispatch>

// shared navigation logic for both audio sync and user navigation
/**
 * returns true if actual navigation was performed
 */
function navigateToLocator(locator: Locator, listenerApi: ListenerApi) {
  const nav = getNavigator()
  if (!nav) return false

  const isScrolling = isScrollingLayout(
    selectPreference(listenerApi.getState(), "layout"),
  )

  if (isSameLocator(locator, nav.currentLocator)) {
    return false
  }

  if (locator.locations.fragments[0]) {
    listenerApi.dispatch(requestHighlightUpdate({ locator }))
  }

  const isWithinViewport = isLocatorWithinViewport(
    locator,
    nav.viewport,
    isScrolling,
  )

  const scrollMode = selectPreference(listenerApi.getState(), "scrollBehavior")
  const smoothScrollImplementation = selectPreference(
    listenerApi.getState(),
    "smoothScrollImplementation",
  )
  const smoothScrollSpeed = selectPreference(
    listenerApi.getState(),
    "smoothScrollSpeed",
  )
  const scrollSettings = {
    behavior: scrollMode,
    implementation: smoothScrollImplementation,
    speed: smoothScrollSpeed,
  }

  if (isWithinViewport) {
    if (isScrolling) {
      scrollToLocator(locator, scrollSettings)
    }

    return true
  }
  const isDifferentChapter = locator.href !== nav.currentLocator.href

  return new Promise((resolve, reject) => {
    nav.go(locator, isDifferentChapter, (success) => {
      if (!success) {
        console.error("Failed to navigate to locator")
        resolve(false)
        return
      }

      try {
        // after navigation completes, scroll to the element if in scrolling mode
        if (isScrolling && locator.locations.fragments[0]) {
          scrollToLocator(locator, scrollSettings)
        }

        resolve(true)
      } catch (e) {
        if (
          e instanceof Error &&
          e.message.includes("Trying to show frame when it doesn't exist")
        ) {
          console.warn("Error navigating to locator", e)
          resolve(false)
          return
        }
        reject(e as Error) // oxlint-disable-line typescript/no-unnecessary-type-assertion
      }
    })
  })
}

const matchPageTurned = isAnyOf(nextPagePressed, previousPagePressed)

let resumeOnNextAudioPage = false

// page turn - use readium navigator to find next page
// (calculating next page locator manually is complex, so we let readium handle it by manually calling the navigator)
startAppListening({
  matcher: matchPageTurned,
  effect: async (action, listenerApi) => {
    const nav = getNavigator()
    if (!nav) {
      console.warn("Navigator not available")
      return
    }

    const currentBook = selectCurrentBook(listenerApi.getState())
    if (!currentBook) return

    const isSyncing = selectIsSyncing(listenerApi.getState())
    const layout = selectPreference(listenerApi.getState(), "layout")
    const scrolling = isScrollingLayout(layout)
    const mode = selectReadingMode(listenerApi.getState())
    const skipOnTurnPage = selectPreference(
      listenerApi.getState(),
      "skipOnTurnPage",
    )
    const direction = action.type === nextPagePressed.type ? "next" : "previous"

    const method =
      direction === "next" ? nav.goForward.bind(nav) : nav.goBackward.bind(nav)

    const progressions = nav.viewport.progressions.get(nav.currentLocator.href)

    const isAtEndOfChapter =
      direction === "next" ? progressions?.end === 1 : progressions?.start === 0

    const movesAudio = mode === "readaloud" && isSyncing && skipOnTurnPage

    const wasPlaying = readerPlayer().getState().playing

    if (movesAudio && wasPlaying && (scrolling || isAtEndOfChapter)) {
      // pause if we are skipping chapters, or we scrolling
      readerPlayer().pause()
    }

    await new Promise<void>((resolve) => {
      method(false, async (ok) => {
        if (!ok) {
          resolve()
          return
        }

        const nav = getNavigator()
        if (!nav) {
          console.warn("Navigator not available")
          resolve()
          return
        }

        if (!movesAudio) {
          listenerApi.dispatch(
            syncPosition({
              locator: nav.currentLocator,
              timestamp: Date.now(),
              bookUuid: currentBook.uuid,
            }),
          )
          resolve()
          return
        }

        // in sync mode, find the first visible fragment to use as nav target
        const publication = getPublication()
        if (!publication) {
          console.warn("No publication found")
          resolve()
          return
        }

        const guides = await getGuidesForText(
          publication,
          nav.currentLocator.href,
        )
        if (!guides || !guides[0]) {
          if (wasPlaying) {
            readerPlayer().pause()
            resumeOnNextAudioPage = true
          }
          listenerApi.dispatch(
            syncPosition({
              locator: nav.currentLocator,
              timestamp: Date.now(),
              bookUuid: currentBook.uuid,
            }),
          )
          resolve()
          return
        }
        const guide = guides[0]

        const firstVisibleLocator = findFirstVisibleLocator(guide)
        const firstVisibleFragment = firstVisibleLocator?.locations.fragments[0]

        let locator = firstVisibleFragment
          ? nav.currentLocator.copyWithLocations(
              new LocatorLocations({
                fragments: [firstVisibleFragment],
              }),
            )
          : nav.currentLocator

        // if we have a fragment but no progression, calculate it
        const positions = getPositions()
        if (positions && firstVisibleFragment) {
          locator = await getLocatorWithClosestPositionAsync(locator, positions)
        }

        // this triggers audio to follow
        listenerApi.dispatch(
          bookLocatorChanged({
            bookUuid: currentBook.uuid,
            locator: locator,
            timestamp: Date.now(),
            resumePlayback: wasPlaying || resumeOnNextAudioPage,
          }),
        )
        resumeOnNextAudioPage = false

        resolve()
      })
    })
  },
})

// audio sync triggered text navigation (does NOT trigger audio update)
startAppListening({
  actionCreator: textNavigatedFromAudio,
  effect: async (action, listenerApi) => {
    await navigateToLocator(action.payload.locator, listenerApi)
  },
})

// user requested text navigation (triggers audio sync via bookLocatorChanged)
startAppListening({
  actionCreator: userRequestedTextNavigation,
  effect: async (action, listenerApi) => {
    const currentBook = selectCurrentBook(listenerApi.getState())
    if (!currentBook) return

    const didNavigate = await navigateToLocator(
      action.payload.locator,
      listenerApi,
    )

    const isSyncing = selectIsSyncing(listenerApi.getState())

    if (isSyncing && didNavigate) {
      let fullLocator = action.payload.locator

      if (
        !fullLocator.locations.totalProgression ||
        (fullLocator.locations.fragments[0] &&
          !fullLocator.locations.progression)
      ) {
        const positions = getPositions()
        if (!positions) return

        fullLocator = await getLocatorWithClosestPositionAsync(
          fullLocator,
          positions,
        )
      }

      listenerApi.dispatch(
        bookLocatorChanged({
          bookUuid: currentBook.uuid,
          locator: fullLocator,
          timestamp: Date.now(),
          resumePlayback: action.payload.resumePlayback,
        }),
      )
    }
  },
})

const onChange = isAnyOf(bookLocatorChanged)

// when text locator changes, sync the position to server
startAppListening({
  matcher: onChange,
  effect: (action, listenerApi) => {
    const { locator, bookUuid, timestamp } = action.payload
    listenerApi.dispatch(
      syncPosition({
        locator,
        timestamp,
        bookUuid,
      }),
    )
  },
})

const matchedActiveFrame = isAnyOf(readingSessionSlice.actions.setActiveFrame)

// when active frame changes, add click listeners to fragments
// stopgap until we move to better frame management
startAppListening({
  matcher: matchedActiveFrame,
  effect: async (_action, listenerApi) => {
    const publication = getPublication()

    if (!publication) {
      console.warn("No publication", window, publication)
      return
    }

    const isReadaloud =
      selectReadingMode(listenerApi.getState()) === "readaloud"
    if (!isReadaloud) return

    const resourceHref = getHrefFromActiveFrame(_action.payload ?? undefined)
    if (!resourceHref) {
      console.error("No resource href found")
      return
    }

    // can i get away with just getting the  current guide? no, doesn't work when switching chapters
    let guide = await getGuidesForText(publication, resourceHref)

    // TODO: bigger issue here, this is not a good solution, we should have a better way to handle this
    // Retry up to 3 times with 2 second delays if guide not found
    for (let attempt = 0; attempt < 2 && !guide?.[0]; attempt++) {
      if (attempt !== 0) {
        console.warn("Retrying to get guide", attempt + 1, "of 3")
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
      guide = await getGuidesForText(publication, resourceHref)
    }

    const book = selectCurrentBook(listenerApi.getState())
    if (!book) {
      console.error("No book found")
      return
    }
    const firstGuide = guide?.[0]
    if (!firstGuide) return

    withActiveFrame((activeFrame) => {
      for (const clip of firstGuide.guided?.[0]?.children ?? []) {
        const window = activeFrame.iframe.contentWindow

        if (!clip.fragmentId) {
          console.error("No fragment ID found")
          continue
        }

        const element = window.document.getElementById(clip.fragmentId)
        if (!element) {
          console.error("No element found for fragment", clip.fragmentId)
          continue
        }

        element.classList.add("reader-fragment")

        element.addEventListener("click", async (event) => {
          const clone = new MouseEvent("click", event)
          event.stopImmediatePropagation()
          event.preventDefault()

          const doubleClickTimeout = selectDoubleClickTimeout(
            listenerApi.getState(),
          )
          if (doubleClickTimeout) {
            const selection = window.document.getSelection()
            if (selection) {
              selection.empty()
            }

            window.clearTimeout(doubleClickTimeout)

            listenerApi.dispatch(
              readingSessionSlice.actions.setDoubleClickTimeout(null),
            )

            if (!clip.fragmentId) {
              console.error("No fragment ID found")
              return
            }

            const locator = await getLocatorForFragment(
              resourceHref,
              clip.fragmentId,
            )

            if (!locator) {
              console.error("No clip locator found")
              return
            }
            listenerApi.dispatch(
              userRequestedTextNavigation({
                locator: locator,
              }),
            )
            return
          }

          const element = event.currentTarget as HTMLElement | null

          if (!element) {
            console.error("No element found")
            return
          }

          listenerApi.dispatch(
            readingSessionSlice.actions.setDoubleClickTimeout(
              window.setTimeout(() => {
                listenerApi.dispatch(
                  readingSessionSlice.actions.setDoubleClickTimeout(null),
                )
                if (!element.parentElement) {
                  console.error("No parent element found")
                  return
                }
                element.parentElement.dispatchEvent(clone)
              }, 350),
            ),
          )
        })
      }
    })
  },
})

const matchesHighlightUpdate = isAnyOf(requestHighlightUpdate)

startAppListening({
  matcher: matchesHighlightUpdate,
  effect: (action, listenerApi) => {
    const locator = action.payload.locator

    const prevFragment = selectCurrentlyHighlightedFragment(
      listenerApi.getState(),
    )

    if (prevFragment === locator.locations.fragments[0]) return

    const nav = getNavigator()
    if (nav?.currentLocator.href !== locator.href) return

    withActiveFrame((activeFrame) => {
      // @ts-expect-error private property, but no other way to check if the frame is destroyed or hidden
      if (activeFrame.hidden || activeFrame.destroyed) return

      /* oxlint-disable typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type */
      highlightFragment(
        activeFrame as FrameManager & { msg: FrameComms },
        locator,
        selectBookPreferences(listenerApi.getState(), null),
      )
      /* oxlint-enable typescript/no-unnecessary-type-assertion */
      listenerApi.dispatch(
        readingSessionSlice.actions.updateCurrentlyHighlightedFragment(locator),
      )
    })
  },
})

const dimActive = (state: RootState) => {
  if (!selectCurrentBook(state)) return false
  if (!selectIsPlaying(state)) return false
  if (!selectIsSyncing(state)) return false

  return selectBookPreferences(state, null).dimWhilePlaying
}

startAppListening({
  predicate: (action, currentState, previousState) =>
    readingSessionSlice.actions.setActiveFrame.match(action) ||
    dimActive(currentState) !== dimActive(previousState),
  effect: (_action, listenerApi) => {
    const dim = dimActive(listenerApi.getState())

    withActiveFrame((frame) => {
      applyFrameDim(frame.iframe.contentDocument, dim)
    })
  },
})

const forwardedFrameDocuments = new WeakSet<Document>()

function forwardKeyEvent(event: KeyboardEvent) {
  const forwarded = new KeyboardEvent(event.type, {
    key: event.key,
    code: event.code,
    location: event.location,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    repeat: event.repeat,
    bubbles: true,
    cancelable: true,
  })
  if (!document.documentElement.dispatchEvent(forwarded)) {
    event.preventDefault()
  }
}

startAppListening({
  actionCreator: readingSessionSlice.actions.setActiveFrame,
  effect: (action) => {
    withActiveFrame((activeFrame) => {
      const frameDocument = activeFrame.iframe.contentWindow.document
      if (forwardedFrameDocuments.has(frameDocument)) return
      forwardedFrameDocuments.add(frameDocument)

      frameDocument.addEventListener("keydown", forwardKeyEvent)
      frameDocument.addEventListener("keyup", forwardKeyEvent)
    }, action.payload ?? undefined)
  },
})
