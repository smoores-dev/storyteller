"use client"

import { type ReactNode, useCallback, useRef, useState } from "react"

import {
  ConfirmDialog,
  useConfirmAction,
} from "@v3/_/components/ui/confirm-dialog"
import { type ActivationModifiers } from "@v3/_/components/ui/filterable-menu"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { type BookWithRelations } from "@/database/books"
import { usePermission } from "@/hooks/usePermission"
import * as icon from "@/icons"
import { useProcessBookMutation } from "@/store/api"
import { STAGE_ORDER } from "@/work/stages"

import { ProcessRunDialog } from "./ProcessRunDialog"

export type ProcessRestart = false | "sync" | "transcription" | "full"

type PositionLabelKey =
  | "startProcessing"
  | "continue"
  | "resync"
  | "fromSync"
  | "fromTranscription"
  | "fullRestart"

type PositionKey = "start" | "continue" | "sync" | "transcription" | "full"

export type ProcessingPosition = {
  key: PositionKey
  labelKey: PositionLabelKey
  icon: ReactNode
  restart: ProcessRestart
  disabled: boolean
  // titles of the selected books that can't run from this position, so the menu
  // can explain what is holding the step back
  blockedBy: string[]
}

// a book is processable once it has both source formats present, or once a
// readaloud exists to re-run
export function canProcessBook(book: BookWithRelations): boolean {
  if (book.readaloud) return true
  return (
    !!book.ebook &&
    !book.ebook.missing &&
    !!book.audiobook &&
    !book.audiobook.missing
  )
}

function positionAllowsBook(
  key: PositionKey,
  book: BookWithRelations,
): boolean {
  if (!canProcessBook(book)) return false

  const readaloud = book.readaloud
  if (!readaloud) {
    // nothing has run yet: only a fresh start makes sense, and a "full restart"
    // degrades to exactly that
    return key === "start" || key === "continue" || key === "full"
  }

  const stage = STAGE_ORDER[readaloud.currentStage]

  switch (key) {
    case "start":
      return false
    case "continue":
      return readaloud.status !== "ALIGNED"
    case "sync":
      return stage >= 2
    case "transcription":
      return stage >= 1
    case "full":
      return true
  }
}

const POSITION_META: Record<
  PositionKey,
  { labelKey: PositionLabelKey; icon: ReactNode; restart: ProcessRestart }
> = {
  start: {
    labelKey: "startProcessing",
    icon: <icon.Progress className="mr-2 size-4" />,
    restart: false,
  },
  continue: {
    labelKey: "continue",
    icon: <icon.Progress className="mr-2 size-4" />,
    restart: false,
  },
  sync: {
    labelKey: "fromSync",
    icon: <icon.Progress className="mr-2 size-4" />,
    restart: "sync",
  },
  transcription: {
    labelKey: "fromTranscription",
    icon: <icon.Reload className="mr-2 size-4" />,
    restart: "transcription",
  },
  full: {
    labelKey: "fullRestart",
    icon: <icon.Reload className="mr-2 size-4" />,
    restart: "full",
  },
}

// the restart positions offered for a selection. a position stays visible even
// when some book can't run from it: it greys out instead, and names the books
// standing in the way.
export function buildProcessingPositions(
  books: BookWithRelations[],
): ProcessingPosition[] {
  if (books.length === 0) return []

  const anyReadaloud = books.some((book) => book.readaloud)

  const keys: PositionKey[] = !anyReadaloud
    ? ["start"]
    : [
        ...(books.some((book) => book.readaloud?.status !== "ALIGNED")
          ? (["continue"] as const)
          : []),
        "sync",
        "transcription",
        "full",
      ]

  return keys.map((key) => {
    const blockedBy = books
      .filter((book) => !positionAllowsBook(key, book))
      .map((book) => book.title)

    return {
      key,
      ...POSITION_META[key],
      disabled: blockedBy.length > 0,
      blockedBy,
    }
  })
}

export function useProcessingRun(books: BookWithRelations[]) {
  const canConfigure = usePermission("settingsUpdate")
  const [processBook] = useProcessBookMutation()
  const t = useTranslation("BookActions")
  const c = useCommon()

  const [dialogRestart, setDialogRestart] = useState<ProcessRestart | null>(
    null,
  )
  // useConfirmAction fixes its handler at hook time, so the position being
  // confirmed rides in a ref
  const pendingRestart = useRef<ProcessRestart>(false)

  const run = useCallback(
    async (restart: ProcessRestart) => {
      await Promise.all(
        books.map((book) => processBook({ uuid: book.uuid, restart }).unwrap()),
      )
    },
    [books, processBook],
  )

  const confirmAction = useConfirmAction({
    onConfirm: () => run(pendingRestart.current),
    title: t.plain("processTitle", { count: books.length }),
    description: t.plain("processDescription"),
    confirmLabel: c.plain("states.processing"),
  })

  // the run-config dialog only makes sense for a single book; a multi-book run
  // falls back to a plain confirm
  const single = books.length === 1 ? books[0] : undefined

  const start = (restart: ProcessRestart, modifiers?: ActivationModifiers) => {
    if (books.length === 0) return

    // shift skips every prompt and starts with the stored defaults
    if (modifiers?.shiftKey) {
      void run(restart)
      return
    }

    if (single && canConfigure) {
      setDialogRestart(restart)
      return
    }

    pendingRestart.current = restart
    confirmAction.confirm()
  }

  const dialog = (
    <>
      {single && (
        <ProcessRunDialog
          book={single}
          restart={dialogRestart ?? false}
          open={dialogRestart !== null}
          onOpenChange={(open) => {
            if (!open) setDialogRestart(null)
          }}
        />
      )}
      <ConfirmDialog {...confirmAction.dialogProps} />
    </>
  )

  return {
    start,
    dialog,
    positions: buildProcessingPositions(books),
    canProcessAny: books.some(canProcessBook),
    blockedBooks: books.filter((book) => !canProcessBook(book)),
  }
}
