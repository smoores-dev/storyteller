import Link from "next/link"

import { cn } from "@/cn"
import { useFormattedProgress } from "@/components/reader/hooks/useFormattedProgress"
import { type BookWithRelations } from "@/database/books"
import { getCoverUrl } from "@/store/api"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  preferencesSlice,
  selectDetailView,
} from "@/store/slices/preferencesSlice"
import {
  selectCurrentLocator,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"

import { ScrollingTitle } from "./ScrollingTitle"

export const BookInfo = ({
  book,
  context,
  imageDimensions,
}: {
  book: BookWithRelations
  context: "mini-player" | "reader-footer" | "reader-header"
  imageDimensions?: {
    audio?: {
      height: number
      width: number
    }
    text?: {
      height: number
      width: number
    }
  }
}) => {
  const detailView = useAppSelector((state) =>
    selectDetailView(state, book.uuid),
  )
  const currentTextLocator = useAppSelector(selectCurrentLocator)
  const { formattedProgress, title } = useFormattedProgress({ book })
  const totalPercentageProgress = Math.round(
    (currentTextLocator?.locations.totalProgression ?? 0) * 100,
  )
  const dispatch = useAppDispatch()
  const mode = useAppSelector(selectReadingMode)

  return (
    <>
      <button
        type="button"
        className="w-10 min-w-10 border-none bg-transparent p-0 hover:bg-transparent"
        onClick={() =>
          dispatch(
            preferencesSlice.actions.toggleBookDetailView({
              target: book.uuid,
              mode,
            }),
          )
        }
      >
        {/* just raw img bc i could not get the normal image to show up nicely */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          aria-hidden
          loading="lazy"
          className={cn(
            "mx-auto aspect-square h-10 w-10 rounded-[4px]",
            detailView.mode === "audio" ? "h-10 w-10" : "h-10 w-7",
          )}
          style={{
            height:
              detailView.mode === "audio"
                ? imageDimensions?.audio?.height ?? 40
                : imageDimensions?.text?.height ?? 40,
            width:
              detailView.mode === "audio"
                ? imageDimensions?.audio?.width ?? 40
                : imageDimensions?.text?.width ?? 28,
          }}
          src={getCoverUrl(book.uuid, {
            height:
              detailView.mode === "audio"
                ? imageDimensions?.audio?.height ?? 40
                : imageDimensions?.text?.height ?? 40,
            width:
              detailView.mode === "audio"
                ? imageDimensions?.audio?.width ?? 40
                : imageDimensions?.text?.width ?? 28,
            audio: detailView.mode === "audio",
          })}
        />
      </button>
      <div
        className={cn(
          "min-w-0 grow",
          context === "mini-player" ? "text-center" : "text-left",
        )}
      >
        <ScrollingTitle
          className="text-reader-text font-heading font-medium"
          scrollSpeed={30}
          scrollInterval={10_000}
        >
          <span style={{ fontSize: "var(--mantine-font-size-sm)" }}>
            {detailView.scope === "book" ? (
              <Link
                href={`/books/${book.uuid}`}
                className="hover:text-reader-accent hover:underline"
              >
                {title}
              </Link>
            ) : (
              title
            )}
          </span>
        </ScrollingTitle>
        <div className="flex items-center gap-1">
          <span className="text-reader-text-muted text-xs">
            {formattedProgress}
          </span>
          <span className="text-reader-text-muted/50 text-xs">•</span>
          <span className="text-reader-text-muted text-xs">
            {totalPercentageProgress > 0 ? `${totalPercentageProgress}%` : ""}
          </span>
        </div>
      </div>
    </>
  )
}
