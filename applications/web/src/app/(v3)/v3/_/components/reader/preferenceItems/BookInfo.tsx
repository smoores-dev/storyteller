import { Tile } from "@v3/_/components/books/Cover"
import { useFormattedProgress } from "@v3/_/components/reader/hooks/useFormattedProgress"
import { V3Link } from "@v3/_/components/v3-link"
import { cn } from "@v3/_/lib/utils"

import { type BookWithRelations } from "@/database/books"
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
}: {
  book: BookWithRelations
  context: "mini-player" | "reader-footer" | "reader-header"
}) => {
  const detailView = useAppSelector((state) =>
    selectDetailView(state, book.uuid),
  )
  const mode = useAppSelector(selectReadingMode)
  const currentTextLocator = useAppSelector(selectCurrentLocator)
  const { title, detail, ready } = useFormattedProgress({ book })
  const dispatch = useAppDispatch()

  const percent = Math.round(
    (currentTextLocator?.locations.totalProgression ?? 0) * 100,
  )
  const audioImage = book.audiobook?.cover
  const textImage = book.ebook?.cover ?? book.readaloud?.cover
  const useAudioImage = detailView.mode === "audio" && audioImage
  const image = useAudioImage ? audioImage : textImage
  const type = useAudioImage ? "audiobook" : "ebook"
  const parts = [detail, percent > 0 ? `${percent}%` : null].filter(
    (part) => part !== null,
  )

  return (
    <>
      <button
        type="button"
        aria-label={
          detailView.scope === "book"
            ? "Show chapter progress"
            : "Show book progress"
        }
        className="focus-visible:ring-reader-accent/40 shrink-0 rounded-[4px] border-none bg-transparent p-0 transition-transform duration-150 ease-out outline-none hover:scale-105 focus-visible:ring-2 active:scale-95"
        onClick={() => {
          dispatch(
            preferencesSlice.actions.toggleBookDetailView({
              target: book.uuid,
              mode,
            }),
          )
        }}
      >
        <Tile
          image={image}
          size={80}
          alt={book.title}
          type={type}
          fit="cover"
          className={cn("h-10", type === "audiobook" ? "w-10" : "w-7")}
        />
      </button>
      <div
        className={cn(
          "min-w-0 grow",
          context === "mini-player" ? "text-center" : "text-left",
        )}
      >
        <ScrollingTitle
          className="text-reader-text font-heading text-sm font-medium"
          scrollSpeed={30}
          scrollInterval={10_000}
        >
          {detailView.scope === "book" ? (
            <V3Link
              href={`/books/${book.uuid}`}
              className="hover:text-reader-accent hover:underline"
            >
              {title ?? book.title}
            </V3Link>
          ) : (
            title ?? book.title
          )}
        </ScrollingTitle>
        {ready && parts.length > 0 && (
          <p className="text-reader-text-muted m-0 text-xs tabular-nums">
            {parts.join(" • ")}
          </p>
        )}
      </div>
    </>
  )
}
