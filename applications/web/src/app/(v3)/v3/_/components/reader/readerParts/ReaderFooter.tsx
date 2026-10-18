import { motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"

import { ProgressBar } from "@v3/_/components/reader/ProgressBar"
import { useReaderShortcuts } from "@v3/_/components/reader/hooks/useReaderKeyboard"
import { BookInfo } from "@v3/_/components/reader/preferenceItems/BookInfo"
import { HoldButton } from "@v3/_/components/reader/preferenceItems/HoldButton"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useMediaQuery } from "@v3/_/hooks/use-media-query"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type BookWithRelations } from "@/database/books"
import * as icon from "@/icons"
import { withActiveFrame } from "@/reader/frameUtils"
import { isRtlPublication } from "@/reader/helpers"
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

type Props = {
  book: BookWithRelations
  className?: string
  isVisible: boolean
}

const FOOTER_HEIGHT = 80
const FOOTER_HEIGHT_MD = 64
const FOOTER_GAP = 8
const PROGRESS_BAR_HEIGHT = 12

const CORNER = "var(--radius-lg)"
const OVERHANG = "0.5rem"
const cornerCircle = (x: string) =>
  `radial-gradient(circle at ${x} calc(${OVERHANG} + ${CORNER}), #000 calc(${CORNER} - 0.5px), transparent ${CORNER})`

const ROUNDED_TOP_MASK = {
  maskImage: [
    "linear-gradient(#000 0 0)",
    "linear-gradient(#000 0 0)",
    cornerCircle(CORNER),
    cornerCircle(`calc(100% - ${CORNER})`),
  ].join(", "),
  maskSize: [
    `calc(100% - 2 * ${CORNER}) 100%`,
    `100% max(0px, calc(100% - ${OVERHANG} - ${CORNER}))`,
    "100% 100%",
    "100% 100%",
  ].join(", "),
  maskPosition: "center, bottom, 0 0, 0 0",
  maskRepeat: "no-repeat",
}

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
  const t = useTranslation("Reader.toolbar")
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

  const playLabelKey = isLoading ? "buffering" : playing ? "pause" : "play"

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
        width: footerDisplayWidth === "minimal" ? "min(24rem, 95vw)" : "100%",
      }}
    >
      <div
        className={cn(
          "w-full",
          footerDisplayWidth !== "full" &&
            "pointer-events-none -mt-2 pt-2 *:pointer-events-auto",
        )}
        style={footerDisplayWidth === "full" ? undefined : ROUNDED_TOP_MASK}
      >
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
              tooltip={t.plain(rtl ? "nextPage" : "previousPage")}
              aria-label={t.plain(rtl ? "nextPage" : "previousPage")}
              shortcut={[rtl ? shortcuts.nextPage : shortcuts.previousPage]}
              className={TRANSPORT_BUTTON_CLASS}
              onClick={turnLeft}
            >
              <icon.ChevronLeft size="lg" />
            </TooltipButton>
            <TooltipButton
              variant="real-ghost"
              size="icon-lg"
              tooltip={t.plain(rtl ? "previousPage" : "nextPage")}
              aria-label={t.plain(rtl ? "previousPage" : "nextPage")}
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
              tooltip={t.plain(
                mode === "audiobook" ? "skipBackward" : "previousFragment",
              )}
              holdTooltip={t.plain("previousChapter")}
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
              tooltip={t.plain(playLabelKey)}
              aria-label={t.plain(playLabelKey)}
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
              tooltip={t.plain(
                mode === "audiobook" ? "skipForward" : "nextFragment",
              )}
              holdTooltip={t.plain("nextChapter")}
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
