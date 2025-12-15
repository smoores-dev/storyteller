import { getHotkeyHandler } from "@mantine/hooks"
import { type FrameComms, type FrameManager } from "@readium/navigator"
import { type Locator, LocatorLocations } from "@readium/shared"
import { type ListenerEffectAPI, isAnyOf } from "@reduxjs/toolkit"

import {
  getLocatorForFragment,
  getLocatorWithClosestPositionAsync,
} from "@/components/reader/BookService"
import {
  findFirstVisibleLocator,
  isLocatorWithinViewport,
  scrollToLocator,
} from "@/components/reader/helpers"
import { getReaderKeyboardHotkeys } from "@/components/reader/hooks/useReaderKeyboard"
import { isSameLocator } from "@/components/reader/locators"
import { AudioPlayer } from "@/services/AudioPlayerService"

import {
  bookLocatorChanged,
  nextPagePressed,
  previousPagePressed,
  requestHighlightUpdate,
  syncPosition,
  textNavigatedFromAudio,
  userRequestedTextNavigation,
} from "../actions"
import type { AppDispatch, RootState } from "../appState"
import {
  getActiveFrame,
  getNavigator,
  getPositions,
  getPublication,
} from "../readerRegistry"
import { selectPreference } from "../slices/preferencesSlice"
import {
  readingSessionSlice,
  selectCurrentBook,
  selectCurrentToCLocator,
  selectCurrentlyHighlightedFragment,
  selectDoubleClickTimeout,
  selectIsSyncing,
  selectReadingMode,
} from "../slices/readingSessionSlice"

import {
  getGuidesForText,
  getHrefFromActiveFrame,
  handleChapterSkip,
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

  const isScrolling =
    selectPreference(listenerApi.getState(), "layout") === "scrollable"

  if (isSameLocator(locator, nav.currentLocator)) {
    return false
  }

  const activeFrame = getActiveFrame()
  if (!activeFrame) return false

  if (locator.locations.fragments[0]) {
    listenerApi.dispatch(requestHighlightUpdate({ locator }))
  }

  const isWithinViewport = isLocatorWithinViewport(
    locator,
    nav.viewport,
    activeFrame,
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
      scrollToLocator(locator, activeFrame, scrollSettings)
    }

    return true
  }
  const isDifferentChapter = locator.href !== nav.currentLocator.href

  return new Promise((resolve, reject) => {
    try {
      nav.go(locator, isDifferentChapter, (success) => {
        if (!success) {
          console.error("Failed to navigate to locator")
          resolve(false)
          return
        }

        const activeFrame = getActiveFrame()
        if (!activeFrame) {
          console.warn("Active frame not available")
          resolve(false)
          return
        }

        // after navigation completes, scroll to the element if in scrolling mode
        if (isScrolling && locator.locations.fragments[0]) {
          scrollToLocator(locator, activeFrame, scrollSettings)
        }

        resolve(true)
      })
    } catch (e) {
      if (
        e instanceof Error &&
        e.message.includes("Trying to show frame when it doesn't exist")
      ) {
        console.warn("Error navigating to locator", e)
        resolve(false)
        return
      }
      reject(e as Error)
    }
  })
}

const matchPageTurned = isAnyOf(nextPagePressed, previousPagePressed)

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
    const scrolling =
      selectPreference(listenerApi.getState(), "layout") === "scrollable"
    const currentTocItem = selectCurrentToCLocator(listenerApi.getState())
    const mode = selectReadingMode(listenerApi.getState())
    const skipOnTurnPage = selectPreference(
      listenerApi.getState(),
      "skipOnTurnPage",
    )

    if (scrolling && mode === "readaloud" && currentTocItem) {
      handleChapterSkip(
        action.type === nextPagePressed.type ? "next" : "previous",
        currentTocItem,
        (locator) => {
          listenerApi.dispatch(userRequestedTextNavigation({ locator }))
        },
      )
      return
    }

    const method =
      action.type === nextPagePressed.type
        ? nav.goForward.bind(nav)
        : nav.goBackward.bind(nav)

    const progressions = nav.viewport.progressions.get(nav.currentLocator.href)
    const shouldPause =
      (nextPagePressed.type === action.type
        ? progressions?.end === 1
        : progressions?.start === 0) && isSyncing

    const wasPlaying = AudioPlayer.getState().playing

    // if at end of thing
    if (shouldPause && wasPlaying) {
      // pause if we are skipping chapters
      AudioPlayer.pause()
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

        if (!isSyncing) {
          listenerApi.dispatch(
            syncPosition({
              locator: nav.currentLocator,
              timestamp: Date.now(),
              bookUuid: currentBook.uuid,
              // if not syncing and readaloud, it means we have syncing toggled off, so we don't want to update the position
              // otherwise this is in epub mode, so we do want to update the position
              noServer: mode === "readaloud",
            }),
          )
          resolve()
          return
        }

        if (!skipOnTurnPage) {
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
          console.warn("No guides found")
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
          }),
        )

        resolve()
      })
    })

    if (isSyncing && wasPlaying) {
      await AudioPlayer.play()
    }
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
startAppListening({
  matcher: matchedActiveFrame,
  effect: async (_action, listenerApi) => {
    const activeFrame = getActiveFrame()
    const publication = getPublication()
    const window = activeFrame?.iframe.contentWindow

    if (!window || !publication) {
      console.warn(
        "No window, current locator, or publication",
        window,
        publication,
      )
      console.error(
        "No window, current locator, or publication",
        window,
        publication,
      )
      return
    }

    const syncing = selectReadingMode(listenerApi.getState()) === "readaloud"
    if (!syncing) {
      console.error("Not syncing")
      return
    }

    const resourceHref = getHrefFromActiveFrame(activeFrame)
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
    if (!guide?.[0]) {
      console.error("No guide found")
      return
    }

    for (const clip of guide[0].guided?.[0]?.children ?? []) {
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

    const activeFrame = getActiveFrame()

    // @ts-expect-error private property, but no other way to check if the frame is destroyed or hidden
    if (activeFrame?.hidden || activeFrame?.destroyed) return

    if (activeFrame?.msg) {
      highlightFragment(
        activeFrame as FrameManager & { msg: FrameComms },
        locator,
        true,
      )
      listenerApi.dispatch(
        readingSessionSlice.actions.updateCurrentlyHighlightedFragment(locator),
      )
    }
  },
})

startAppListening({
  matcher: isAnyOf(readingSessionSlice.actions.setActiveFrame),
  effect: (_, listenerApi) => {
    listenerApi.unsubscribe()

    try {
      const mode = selectReadingMode(listenerApi.getState())
      const bookId = selectCurrentBook(listenerApi.getState())?.uuid
      if (!bookId) return
      const activeFrame = getActiveFrame()
      if (!activeFrame) return

      const handler = getHotkeyHandler(
        getReaderKeyboardHotkeys(listenerApi.dispatch, mode, bookId),
      )
      // try to remove
      try {
        activeFrame.iframe.contentWindow?.document.removeEventListener(
          "keydown",
          handler,
        )
      } catch (error) {
        // this is probably fineee
        console.warn("Error removing keyboard handler:", error)
      }

      try {
        activeFrame.iframe.contentWindow?.document.addEventListener(
          "keydown",
          handler,
        )
      } catch (error) {
        // this is probably fineee
        console.warn("Error adding keyboard handler:", error)
      }
    } finally {
      listenerApi.subscribe()
    }
  },
})
