"use client"

import { Button } from "@v3/_/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { type BookWithRelations } from "@/database/books"
import { readerPlayer } from "@/services/AudioPlayerService"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { selectPlaybackRate } from "@/store/slices/audioPlayerSlice"
import { preferencesSlice } from "@/store/slices/preferencesSlice"

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]

export function SpeedMenu({
  book,
  container,
}: {
  book: BookWithRelations
  container?: HTMLElement
}) {
  const dispatch = useAppDispatch()
  const rate = useAppSelector(selectPlaybackRate)
  const t = useTranslation("Reader.playbackSpeed")
  const speeds = SPEEDS.includes(rate)
    ? SPEEDS
    : [...SPEEDS, rate].sort((a, b) => a - b)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={t.plain("title")}
            className="tabular-nums"
          />
        }
      >
        {rate}x
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" container={container}>
        <DropdownMenuRadioGroup
          value={String(rate)}
          onValueChange={(value) => {
            const speed = Number(value)
            readerPlayer().setPlaybackRate(speed)
            dispatch(
              preferencesSlice.actions.updatePreference({
                key: "playbackSpeed",
                value: speed,
                target: book.uuid,
              }),
            )
          }}
        >
          {speeds.map((speed) => (
            <DropdownMenuRadioItem key={speed} value={String(speed)}>
              {speed}x
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
