import { type Locator } from "@readium/shared"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"

import { ProgressBar } from "@v3/_/components/reader/ProgressBar"
import { withActiveFrame } from "@v3/_/components/reader/frameUtils"
import { isRtlPublication } from "@v3/_/components/reader/helpers"
import { useReaderShortcuts } from "@v3/_/components/reader/hooks/useReaderKeyboard"
import { BookInfo } from "@v3/_/components/reader/preferenceItems/BookInfo"
import { HoldButton } from "@v3/_/components/reader/preferenceItems/HoldButton"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useMediaQuery } from "@v3/_/hooks/use-media-query"
import { cn } from "@v3/_/lib/utils"

import { type BookWithRelations } from "@/database/books"
import * as icon from "@/icons"
import {
  nextPagePressed,
  pauseButtonPressed,
  playButtonPressed,
  previousPagePressed,
  skipPartButtonHeld,
  skipPartButtonPressed,
} from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
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
  selectIsLoadingPublication,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"

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

const FOOTER_HEIGHT = 80
const FOOTER_HEIGHT_MD = 64
const FOOTER_GAP = 8
const PROGRESS_BAR_HEIGHT = 12

const TRANSPORT_BUTTON_CLASS =
  "text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover focus-visible:ring-reader-accent/40 size-9 rounded-full transition-colors"

export const ReaderFooter = ({ book, className, isVisible }: Props) => {
  const mode = useAppSelector(selectReadingMode)

  const dispatch = useAppDispatch()
  const playing = useAppSelector(selectIsPlaying)
  const isLoading = useAppSelector(selectIsLoading)
  const publicationLoading = useAppSelector(selectIsLoadingPublication)
  const detailView = useAppSelector((state) =>
    selectDetailView(state, book.uuid),
  )
  const shortcuts = useReaderShortcuts()
  const rtl = !publicationLoading && isRtlPublication()
  const reducedMotion = useReducedMotion()
  const isMd = useMediaQuery("(min-width: 768px)")

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

  const [textWidth, setTextWidth] = useState<string>(
    `clamp(20rem, ${lineLength}ch, 95vw)`,
  )
  const activeFrameUrl = useAppSelector(selectActiveFrameUrl)

  useEffect(() => {
    const timeout = setTimeout(() => {
      withActiveFrame((activeFrame) => {
        const lineWidth = activeFrame.window
          .getComputedStyle(activeFrame.window.document.documentElement)
          .getPropertyValue("--USER__lineLength")

        setTextWidth(`min(${lineWidth}, 100vw)`)
      })
    }, 100)
    return () => {
      clearTimeout(timeout)
    }
  }, [activeFrameUrl, lineLength, fontSize, fontFamily])

  const hiddenOffset =
    (isMd ? FOOTER_HEIGHT_MD : FOOTER_HEIGHT) +
    (footerDisplayWidth === "full" ? 0 : FOOTER_GAP) -
    PROGRESS_BAR_HEIGHT

  const turnLeft = () => {
    dispatch(rtl ? nextPagePressed() : previousPagePressed())
  }
  const turnRight = () => {
    dispatch(rtl ? previousPagePressed() : nextPagePressed())
  }

  return (
    <motion.footer
      initial={false}
      animate={{ y: isVisible ? 0 : hiddenOffset }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 500, damping: 45, mass: 0.8 }
      }
      className={cn(
        className,
        "text-reader-text relative mx-auto flex h-20 flex-col rounded-b-lg shadow-lg md:h-16",
        footerDisplayWidth === "full"
          ? "bg-reader-bg"
          : "bg-reader-surface mb-2 rounded-t-lg",
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
      <div className="w-full">
        <ProgressBar book={book} detailView={detailView} />
      </div>

      <div className="mx-auto flex w-full max-w-6xl grow items-center justify-between gap-4 px-4 pb-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <BookInfo book={book} context="reader-footer" />
        </div>
        {mode === "epub" ? (
          <div className="flex items-center gap-1">
            <TooltipButton
              variant="real-ghost"
              size="icon-lg"
              tooltip={rtl ? "Next page" : "Previous page"}
              aria-label={rtl ? "Next page" : "Previous page"}
              shortcut={[rtl ? shortcuts.nextPage : shortcuts.previousPage]}
              className={TRANSPORT_BUTTON_CLASS}
              onClick={turnLeft}
            >
              <icon.ChevronLeft size="lg" />
            </TooltipButton>
            <TooltipButton
              variant="real-ghost"
              size="icon-lg"
              tooltip={rtl ? "Previous page" : "Next page"}
              aria-label={rtl ? "Previous page" : "Next page"}
              shortcut={[rtl ? shortcuts.previousPage : shortcuts.nextPage]}
              className={TRANSPORT_BUTTON_CLASS}
              onClick={turnRight}
            >
              <icon.ChevronRight size="lg" />
            </TooltipButton>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <HoldButton
              tooltip={
                mode === "audiobook"
                  ? "Skip backward 15 seconds"
                  : "Previous fragment"
              }
              holdTooltip="Skip to previous chapter"
              shortcut={[shortcuts.previousFragment]}
              onHold={() => {
                dispatch(
                  skipPartButtonHeld({
                    direction: "previous",
                    context: "reader",
                  }),
                )
              }}
              className={TRANSPORT_BUTTON_CLASS}
              onClick={() => {
                dispatch(
                  skipPartButtonPressed({
                    direction: "previous",
                    context: "reader",
                  }),
                )
              }}
            >
              {mode === "audiobook" ? (
                <icon.RewindBackward15 size="lg" />
              ) : (
                <icon.ArrowBack size="lg" />
              )}
            </HoldButton>

            <TooltipButton
              variant="default"
              size="icon-lg"
              tooltip={isLoading ? "Buffering" : playing ? "Pause" : "Play"}
              aria-label={isLoading ? "Buffering" : playing ? "Pause" : "Play"}
              shortcut={[shortcuts.togglePlay]}
              className="bg-reader-accent text-reader-bg hover:bg-reader-accent-hover focus-visible:ring-reader-accent/40 size-10 rounded-full transition-[background-color,transform] duration-150 ease-out active:scale-95"
              onClick={() => {
                dispatch(playing ? pauseButtonPressed() : playButtonPressed())
              }}
            >
              {isLoading ? (
                <icon.Loader size="lg" className="animate-spin" />
              ) : playing ? (
                <icon.PlayerPauseFilled size="lg" />
              ) : (
                <icon.PlayerPlayFilled size="lg" className="translate-x-px" />
              )}
            </TooltipButton>

            <HoldButton
              tooltip={
                mode === "audiobook"
                  ? "Skip forward 15 seconds"
                  : "Next fragment"
              }
              holdTooltip="Skip to next chapter"
              shortcut={[shortcuts.nextFragment]}
              onHold={() => {
                dispatch(
                  skipPartButtonHeld({ direction: "next", context: "reader" }),
                )
              }}
              className={TRANSPORT_BUTTON_CLASS}
              onClick={() => {
                dispatch(
                  skipPartButtonPressed({
                    direction: "next",
                    context: "reader",
                  }),
                )
              }}
            >
              {mode === "audiobook" ? (
                <icon.RewindForward15 size="lg" />
              ) : (
                <icon.ArrowBack size="lg" className="-scale-x-100" />
              )}
            </HoldButton>
          </div>
        )}
      </div>
    </motion.footer>
  )
}
