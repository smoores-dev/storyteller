"use client"

import { type ButtonProps } from "@base-ui/react"
import { useHotkey } from "@tanstack/react-hotkeys"
import { useState } from "react"

import { useTranslation } from "@v3/_/hooks/use-translation"

import { useBookInSidePanel } from "@/app/(v3)/v3/_/hooks/use-open-book"
import * as icon from "@/icons"
import { isTauriApp } from "@/isTauriApp"
import { useCreateBookMutation } from "@/store/api"
import { bookDialogExtensions } from "@/uploadFileTypes"
import { type UUID } from "@/uuid"

import { ImportBookDialog } from "./books/ImportBookDialog"
import { useOpenBookUpload } from "./books/UploadBookProvider"
import { openTauriFileDialog } from "./files/ServerFileBrowser"
import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuItem,
  FilterableMenuTrigger,
} from "./ui/filterable-menu"
import { TooltipButton } from "./ui/tooltip-button"

const BOOK_FILTERS = [{ name: "Books", extensions: bookDialogExtensions }]

export function useImportBookPaths() {
  const { setSelectedBookUuid } = useBookInSidePanel()
  const [createBook] = useCreateBookMutation()

  return async (paths: string[], collection?: UUID) => {
    const response = await createBook({
      paths,
      collection,
      importMode: "reference",
    }).unwrap()

    if ("uuid" in response) {
      void setSelectedBookUuid(response.uuid)
    }
  }
}

export function useAddBook() {
  const t = useTranslation("BooksPage")

  const openBookUpload = useOpenBookUpload()
  const importBookPaths = useImportBookPaths()
  const [importOpen, setImportOpen] = useState(false)

  async function handleTauriImport() {
    const result = await openTauriFileDialog({
      multiple: true,
      filters: BOOK_FILTERS,
    })

    if (!result) return

    const paths = Array.isArray(result) ? result : [result]
    if (paths.length === 0) return

    await importBookPaths(paths)
  }

  const menuItems = !isTauriApp() ? (
    <>
      <FilterableMenuItem
        icon={<icon.FileUpload className="size-4" />}
        textValue={t.plain("uploadBook")}
        onSelect={() => {
          openBookUpload()
        }}
      >
        {t("uploadBook")}
      </FilterableMenuItem>

      <FilterableMenuItem
        icon={<icon.FileImport className="size-4" />}
        textValue={t.plain("importBook")}
        onSelect={() => {
          setImportOpen(true)
        }}
      >
        {t("importBook")}
      </FilterableMenuItem>
    </>
  ) : (
    <FilterableMenuItem
      icon={<icon.FileImport className="size-4" />}
      textValue={t.plain("importBook")}
      onSelect={() => {
        void handleTauriImport()
      }}
    >
      {t("importBook")}
    </FilterableMenuItem>
  )

  const dialogs = (
    <ImportBookDialog open={importOpen} onOpenChange={setImportOpen} />
  )

  return { menuItems, dialogs }
}

export function AddBookButton(props: ButtonProps) {
  const t = useTranslation("BooksPage")

  const [open, setOpen] = useState(false)
  useHotkey("Shift+A", () => {
    setOpen((prev) => !prev)
  })

  const { menuItems, dialogs } = useAddBook()

  return (
    <>
      <FilterableMenu open={open} onOpenChange={setOpen}>
        <FilterableMenuTrigger
          render={
            <TooltipButton
              variant="ghost"
              size="sm"
              {...props}
              tooltip={t("addBook")}
              aria-label={t("addBook")}
              shortcut={["Shift+A"]}
            >
              <icon.Add className="size-4" />
            </TooltipButton>
          }
        />
        <FilterableMenuContent searchable={false}>
          {menuItems}
        </FilterableMenuContent>
      </FilterableMenu>

      {dialogs}
    </>
  )
}
