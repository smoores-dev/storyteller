"use client"

import { Cover } from "@v3/_/components/books/Cover"
import { Button } from "@v3/_/components/ui/button"

import { type BookWithRelations } from "@/database/books"
import * as icon from "@/icons"
import { useAppSelector } from "@/store/appState"
import {
  selectCurrentTime,
  selectCurrentTrack,
  selectDuration,
} from "@/store/slices/audioPlayerSlice"

import { PlayerControls } from "./PlayerControls"
import { SpeedMenu } from "./SpeedMenu"

export function PipPlayer({
  book,
  pipWindow,
}: {
  book: BookWithRelations
  pipWindow: PictureInPictureWindow
}) {
  const track = useAppSelector(selectCurrentTrack)
  const currentTime = useAppSelector(selectCurrentTime)
  const duration = useAppSelector(selectDuration)

  return (
    <div className="bg-background text-foreground fixed inset-0 flex flex-col">
      <div className="flex min-h-0 flex-1 items-center gap-3 px-3">
        <Cover
          book={book}
          width={40}
          interactive={false}
          displayMode="audiobook"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{book.title}</p>
          <p className="text-muted-foreground truncate text-xs">
            {track?.title}
          </p>
        </div>
        <div className="flex items-center">
          <PlayerControls tooltips={false} />
        </div>
        <SpeedMenu book={book} container={pipWindow.document.body} />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to the app"
          onClick={() => {
            window.focus()
            pipWindow.close()
          }}
        >
          <icon.ArrowUpRight />
        </Button>
      </div>
      <div className="bg-muted h-1 w-full">
        <div
          className="bg-primary h-full"
          style={{
            width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
          }}
        />
      </div>
    </div>
  )
}
