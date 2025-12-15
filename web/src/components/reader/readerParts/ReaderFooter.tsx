import { type Locator } from "@readium/shared"
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconLoader2,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
} from "@tabler/icons-react"
import classNames from "classnames"
import { useEffect, useMemo, useState } from "react"

import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import {
  pauseButtonPressed,
  playButtonPressed,
  skipPartButtonHeld,
  skipPartButtonPressed,
} from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { getActiveFrame } from "@/store/readerRegistry"
import {
  selectIsLoading,
  selectIsPlaying,
} from "@/store/slices/audioPlayerSlice"
import {
  selectDetailView,
  selectPreference,
} from "@/store/slices/preferencesSlice"
import {
  selectActiveFrameUrl,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"

import { ProgressBar } from "../ProgressBar"
import { type ReadiumWindow } from "../helpers"
import { BookInfo } from "../preferenceItems/BookInfo"
import { HoldButton } from "../preferenceItems/HoldButton"

export type TocItem = {
  id: string
  title: string | undefined
  href: string
  level: number
  locator: Locator | null
}

type Props = {
  book: BookWithRelations
  className?: string
  isVisible: boolean
}

export function getColumnCountPerScreen(wnd: ReadiumWindow): number {
  return parseInt(
    wnd
      .getComputedStyle(wnd.document.documentElement)
      .getPropertyValue("column-count"),
  )
}
export function getLineWidth(wnd: ReadiumWindow): string {
  return wnd
    .getComputedStyle(wnd.document.documentElement)
    .getPropertyValue("--USER__lineLength")
}

export const ReaderFooter = ({ book, className, isVisible }: Props) => {
  const mode = useAppSelector(selectReadingMode)

  const dispatch = useAppDispatch()
  const playing = useAppSelector(selectIsPlaying)
  const isLoading = useAppSelector(selectIsLoading)
  const detailView = useAppSelector((state) =>
    selectDetailView(state, book.uuid),
  )

  const lineLength = useAppSelector((state) =>
    selectPreference(state, "lineLength"),
  )
  const fontSize = useAppSelector((state) =>
    selectPreference(state, "fontSize"),
  )
  const fontFamily = useAppSelector((state) =>
    selectPreference(state, "fontFamily"),
  )

  const footerDisplayWidth = useAppSelector((state) =>
    selectPreference(state, "footerDisplayWidth"),
  )

  const computedTextWidth = useMemo(() => {
    return `clamp(20rem, ${lineLength}ch, 95vw)`
  }, [lineLength])
  const [textWidth, setTextWidth] = useState<string>(computedTextWidth)
  // we need to find the textwidth by width of the `body` element inside of the iframe minus the padding and margin. we need to watch the font and linelength settings to recalculate the width.
  const activeFrameUrl = useAppSelector(selectActiveFrameUrl)

  useEffect(() => {
    setTimeout(() => {
      const activeFrame = getActiveFrame()
      const wnd = activeFrame?.window
      if (!wnd) {
        setTextWidth(computedTextWidth)
        return
      }

      const lineWidth = getLineWidth(wnd as ReadiumWindow)

      setTextWidth(`min(${lineWidth}, 100vw)`)
    }, 100)
  }, [activeFrameUrl, lineLength, fontSize, fontFamily, computedTextWidth])

  return (
    <footer
      className={cn(
        className,
        "text-reader-text relative left-1/2 right-0 flex h-20 -translate-x-1/2 transform flex-col rounded-b-lg shadow-lg transition-[bottom] duration-300 ease-in-out md:h-16 md:pb-0",
        // values other than translate-y-full do not seem to work in safari
        // possibly due to https://github.com/tailwindlabs/tailwindcss/issues/18512
        // would be nice to only show the progressbar
        isVisible
          ? footerDisplayWidth === "full"
            ? "bottom-0"
            : "bottom-2"
          : footerDisplayWidth === "full"
            ? "-bottom-[76px] md:-bottom-[58px]"
            : "-bottom-[76px] md:-bottom-[60px]",
        footerDisplayWidth === "full" ? "bg-reader-bg" : "bg-reader-surface",
      )}
      style={{
        maxWidth: footerDisplayWidth === "text" ? textWidth : undefined,
        width:
          footerDisplayWidth === "full"
            ? "100%"
            : footerDisplayWidth === "minimal"
              ? "min(24rem, 95vw)"
              : undefined,
      }}
    >
      {mode !== "epub" && (
        <div className="w-full">
          <ProgressBar book={book} detailView={detailView} />
        </div>
      )}

      <div className="mx-auto flex w-full max-w-6xl grow items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <BookInfo book={book} context="reader-footer" />
        </div>
        {mode !== "epub" && (
          <div className="flex items-center gap-0">
            <HoldButton
              tooltip={
                mode === "audiobook"
                  ? "Skip backward 15 seconds"
                  : "Previous fragment"
              }
              holdTooltip="Skip to previous chapter"
              onHold={() => {
                dispatch(
                  skipPartButtonHeld({
                    direction: "previous",
                    context: "reader",
                  }),
                )
              }}
              className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover relative mt-1 rounded-full bg-transparent p-2"
              onClick={() => {
                dispatch(
                  skipPartButtonPressed({
                    direction: "previous",
                    context: "reader",
                  }),
                )
              }}
            >
              <span className="sr-only">
                {mode === "audiobook"
                  ? "Skip backward 15 seconds"
                  : "Previous fragment"}
              </span>
              <IconArrowBackUp size={20} />
            </HoldButton>

            <button
              className={classNames(
                `text-reader-text hover:text-reader-accent-hover hover:bg-reader-surface-hover rounded-sm bg-transparent p-1`,
              )}
              onClick={() => {
                if (playing) {
                  dispatch(pauseButtonPressed())
                } else {
                  dispatch(playButtonPressed())
                }
              }}
            >
              {isLoading ? (
                <>
                  <span className="sr-only">Buffering</span>
                  <IconLoader2 className="animate-spin" size={24} />
                </>
              ) : playing ? (
                <>
                  <span className="sr-only">Pause</span>
                  <IconPlayerPauseFilled size={24} />
                </>
              ) : (
                <>
                  <span className="sr-only">Play</span>
                  <IconPlayerPlayFilled size={24} />
                </>
              )}
            </button>
            <HoldButton
              tooltip={
                mode === "audiobook"
                  ? "Skip forward 15 seconds"
                  : "Next fragment"
              }
              holdTooltip="Skip to next chapter"
              onHold={() => {
                dispatch(
                  skipPartButtonHeld({ direction: "next", context: "reader" }),
                )
              }}
              className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover relative mt-1 rounded-full bg-transparent p-2"
              onClick={() => {
                dispatch(
                  skipPartButtonPressed({
                    direction: "next",
                    context: "reader",
                  }),
                )
              }}
            >
              <span className="sr-only">
                {mode === "audiobook"
                  ? "Skip forward 15 seconds"
                  : "Next fragment"}
              </span>
              <IconArrowForwardUp size={20} />
            </HoldButton>
          </div>
        )}
      </div>
    </footer>
  )
}
