"use client"

import { toast } from "sonner"

import { type BookWithRelations } from "@/database/books"
import { getDownloadUrl } from "@/store/api"

const EPUB_MIME = "application/epub+zip"

export function canShareFiles() {
  if (typeof navigator === "undefined" || !("canShare" in navigator)) {
    return false
  }

  return navigator.canShare({
    files: [new File([], "book.epub", { type: EPUB_MIME })],
  })
}

export function bookLink(basePath: string, bookUuid: string) {
  return `${window.location.origin}${basePath}/books/${bookUuid}`
}

async function share(file: File, title: string, retryLabel: string) {
  try {
    await navigator.share({ files: [file], title })
  } catch (error) {
    if (!(error instanceof DOMException)) {
      throw error
    }

    if (error.name === "AbortError") {
      return
    }

    if (error.name !== "NotAllowedError") {
      throw error
    }

    toast(title, {
      action: {
        label: retryLabel,
        onClick: () => {
          void share(file, title, retryLabel)
        },
      },
    })
  }
}

export async function shareBookFile(
  book: Pick<BookWithRelations, "uuid" | "title">,
  retryLabel: string,
) {
  const response = await fetch(getDownloadUrl(book.uuid, "ebook"))
  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`)
  }

  const file = new File([await response.blob()], `${book.title}.epub`, {
    type: EPUB_MIME,
  })
  await share(file, book.title, retryLabel)
}
