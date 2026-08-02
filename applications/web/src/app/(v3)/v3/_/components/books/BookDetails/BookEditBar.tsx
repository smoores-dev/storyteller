"use client"

import { ActionTray } from "@v3/_/components/ui/action-tray"
import {
  ESCAPE_PRIORITY,
  useEscapeHandler,
} from "@v3/_/hooks/use-escape-cascade"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import * as icon from "@/icons"

import { useBookForm } from "./BookFormProvider"

export function BookEditBar() {
  const {
    isEditing,
    editingField,
    isSaving,
    editingCovers,
    saveAndClose,
    cancelField,
    discard,
    discardCovers,
  } = useBookForm()
  const t = useTranslation("BookDetailsPage")
  const c = useCommon()

  const show = isEditing || editingCovers || !!editingField

  const handleDiscard = () => {
    if (editingCovers) {
      discardCovers()
    } else if (editingField) {
      cancelField(editingField)
    } else {
      discard()
    }
  }

  useEscapeHandler(ESCAPE_PRIORITY.stopEditing, handleDiscard, show)

  return (
    <ActionTray
      show={show}
      className="absolute bottom-0 left-1/2 z-50 -translate-x-1/2 gap-2 border-l-0 pr-1.5 pl-3"
    >
      <span className="font-serif text-sm whitespace-nowrap">
        {isSaving ? c("states.saving") : t("editing")}
      </span>

      <div className="flex-1" />
      <div className="bg-border mx-0.5 h-5 w-px" />

      <TooltipButton
        tooltip={c("actions.discard")}
        aria-label={c("actions.discard")}
        variant="real-ghost"
        onClick={() => {
          handleDiscard()
        }}
        disabled={isSaving}
        shortcut={["Escape"]}
      >
        <icon.Close className="size-4" />
      </TooltipButton>

      <TooltipButton
        tooltip={isSaving ? c("states.saving") : c("actions.save")}
        aria-label={c("actions.save")}
        onClick={() => {
          void saveAndClose()
        }}
        variant="cover"
        className="rounded-full hover:opacity-90"
        disabled={isSaving}
        shortcut={["Mod+Enter"]}
      >
        <icon.Check className="size-4" />
      </TooltipButton>
    </ActionTray>
  )
}
