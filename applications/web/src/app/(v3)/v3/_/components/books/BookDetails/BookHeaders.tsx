"use client"

import { useHotkey } from "@tanstack/react-hotkeys"
import { AnimatePresence, motion } from "motion/react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { BookActionsMenu } from "@v3/_/components/books/ActionMenu/BookActionsMenu"
import { Checkbox } from "@v3/_/components/ui/checkbox"
import { useOptionalBookSelection } from "@v3/_/hooks/use-book-selection"
import {
  ESCAPE_PRIORITY,
  useEscapeHandler,
} from "@v3/_/hooks/use-escape-cascade"

import { ButtonGroup } from "@/app/(v3)/v3/_/components/ui/button-group"
import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import { cn } from "@/cn"
import * as icon from "@/icons"

import { useBookForm } from "./BookFormProvider"
import { V3Link } from "../../v3-link"
import { router } from "next/client"

const pill =
  "flex items-center gap-0.5 rounded-full bg-background/55 p-0.5 shadow-sm ring-1 ring-black/5 backdrop-blur-md dark:ring-white/10"

export function BookPageHeader() {
  const { book, isEditing, setIsEditing } = useBookForm()
  const router = useRouter()

  const [actionMenuOpen, setActionMenuOpen] = useState(false)

  useHotkey("E", () => {
    setActionMenuOpen((prev) => !prev)
  })

  useHotkey("Shift+ArrowLeft", () => {
    router.back()
  })

  return (
    <div className="absolute top-0 z-20 flex h-(--header-height) w-full shrink-0 items-center justify-between gap-2 px-4">
      <div className="flex min-w-0 items-center gap-2">
        <TooltipButton
          variant="ghost"
          size="icon-sm"
          className={cn(pill)}
          tooltip="Back"
          aria-label="Back"
          onClick={() => {
            router.back()
          }}
          shortcut={["Shift+ArrowLeft"]}
        >
          <icon.ArrowLeft className="size-3.5 stroke-[1.5]" />
        </TooltipButton>
      </div>

      <BookActionsMenu
        open={actionMenuOpen}
        onOpenChange={setActionMenuOpen}
        book={book}
        onEdit={() => {
          setIsEditing(!isEditing)
        }}
        onDeleted={() => {
          router.back()
        }}
        className={cn(pill)}
      />
    </div>
  )
}

export function BookPanelHeader({
  onClose,
  nextBook,
  previousBook,
}: {
  onClose: (() => void) | undefined
  nextBook?: () => void
  previousBook?: () => void
}) {
  const { book, isEditing, setIsEditing } = useBookForm()

  const selection = useOptionalBookSelection()
  const isSelected = selection?.isSelected(book.uuid) ?? false
  const showCheckbox = !!selection && (selection.isSelecting || isSelected)

  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const router = useRouter()

  const handleToggleSelection = () => {
    if (!selection) return
    if (!selection.isSelecting) selection.startSelecting()
    selection.toggleSelection(book.uuid)
  }

  useEscapeHandler(
    ESCAPE_PRIORITY.closePanel,
    () => {
      onClose?.()
    },
    !!onClose,
  )
  useHotkey("O", () => {
    router.push(`/books/${book.uuid}`)
  })

  useHotkey("E", () => {
    setIsEditing(!isEditing)
  })

  useHotkey("M", () => {
    setActionMenuOpen((prev) => !prev)
  })

  useHotkey("Shift+ArrowRight", () => {
    nextBook?.()
  })
  useHotkey("Shift+ArrowLeft", () => {
    previousBook?.()
  })

  return (
    <>
      <AnimatePresence>
        {showCheckbox && (
          <motion.div
            className={cn("absolute top-4 left-3 z-50 p-1", pill)}
            initial={{ x: 0, opacity: 0 }}
            animate={{ x: 3, opacity: 1 }}
            exit={{ x: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Checkbox
              aria-label="Toggle selection"
              checked={isSelected}
              onCheckedChange={handleToggleSelection}
              className={cn(
                "size-5 rounded-full",
                isSelected &&
                  "bg-cover-accent text-cover-accent-foreground border-cover-accent",
              )}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {(nextBook || previousBook) && (
        <ButtonGroup
          className={cn(
            "absolute top-3 left-3 z-50",
            "transition-[left]",
            selection?.isSelecting && "left-12",
            pill,
          )}
        >
          {previousBook && (
            <TooltipButton
              variant="real-ghost"
              size="icon-sm"
              onClick={previousBook}
              shortcut={["Shift+ArrowLeft"]}
              aria-label="Previous"
              tooltip="Previous"
            >
              <icon.ArrowLeft className="size-3.5 stroke-[1.5]" />
            </TooltipButton>
          )}
          {nextBook && (
            <TooltipButton
              variant="real-ghost"
              size="icon-sm"
              onClick={nextBook}
              tooltip="Next"
              aria-label="Next"
              shortcut={["Shift+ArrowRight"]}
            >
              <icon.ArrowRight className="size-3.5 stroke-[1.5]" />
            </TooltipButton>
          )}
        </ButtonGroup>
      )}

      <div className={cn("absolute top-2.5 right-3 z-50", pill)}>
        <TooltipButton
          variant="real-ghost"
          size="icon-sm"
          tooltip="Open in full page"
          aria-label="Open in full page"
          shortcut={["O"]}
          render={
            <V3Link href={`/books/${book.uuid}`}>
              <icon.BookFilled className="size-3.5 stroke-[1.5]" />
            </V3Link>
          }
        >
          <icon.ArrowLeft className="size-3.5 stroke-[1.5]" />
        </TooltipButton>
        <TooltipButton
          variant="real-ghost"
          size="icon-sm"
          onClick={() => {
            setIsEditing(!isEditing)
          }}
          tooltip="Edit"
          aria-label="Edit"
          shortcut={["E"]}
        >
          <icon.Pencil className="size-3.5 stroke-[1.5]" />
        </TooltipButton>
        <BookActionsMenu
          book={book}
          open={actionMenuOpen}
          onOpenChange={setActionMenuOpen}
          showOpenFullPage
          onEdit={() => {
            setIsEditing(!isEditing)
          }}
          onDeleted={onClose}
        />

        {onClose && (
          <TooltipButton
            variant="real-ghost"
            size="icon-sm"
            onClick={onClose}
            tooltip="Close"
            aria-label="Close"
            shortcut={["Escape"]}
          >
            <icon.Close className="size-3.5 stroke-[1.5]" />
          </TooltipButton>
        )}
      </div>
    </>
  )
}
