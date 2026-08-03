"use client"

import { useEffect, useState } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"

import {
  Book3D,
  type Book3DFormat,
  BookFullscreenButton,
  type SpineInfo,
} from "@v3/_/components/books/Book3D"
import { BookCover } from "@v3/_/components/books/BookCover"
import { useUserPreferences } from "@v3/_/components/user-preferences-provider"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import * as icon from "@/icons"
import { getCoverUrl, useSetUserSettingMutation } from "@/store/api"

import { useBookForm } from "./BookFormProvider"
import { CoverColorsEditor } from "./CoverColorsEditor"

const SPINE_INFO: SpineInfo = "title"

function useFilePreview(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  return url
}

function CoverSlot({
  label,
  file,
  currentUrl,
  width,
  square,
  onFileChange,
}: {
  label: string
  file: File | null
  currentUrl: string
  width: number
  square: boolean
  onFileChange: (file: File | null) => void
}) {
  const c = useCommon()
  const previewUrl = useFilePreview(file)

  return (
    <div
      className="group/slot relative shrink-0"
      style={{ width, aspectRatio: square ? "1 / 1" : "2 / 3" }}
    >
      <img
        src={previewUrl ?? currentUrl}
        alt=""
        aria-hidden
        className="h-full w-full rounded-xs object-cover shadow-sm"
      />

      <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-xs text-white transition-colors">
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const selected = e.target.files?.[0]
            if (selected) onFileChange(selected)
          }}
        />
        <span className="sr-only">{label}</span>
        <span
          aria-hidden
          className="flex items-center gap-1.5 rounded-md bg-black/55 px-2.5 py-1.5 text-xs font-medium"
        >
          <icon.Upload className="h-4 w-4" />
          {file ? "Replace" : "Upload"}
        </span>
      </label>

      <div className="absolute top-1.5 right-1.5 z-10 opacity-90">
        <TooltipButton
          type="button"
          variant="secondary"
          size="icon-sm"
          tooltip={c.plain("actions.download")}
          aria-label={c.plain("actions.download")}
          nativeButton={false}
          render={
            <a
              href={currentUrl}
              download={file?.name}
              target="_self"
              rel="noopener noreferrer"
            >
              <icon.Download className="h-3 w-3" />
            </a>
          }
        />
      </div>

      {file && (
        <TooltipButton
          type="button"
          variant="secondary"
          size="icon-sm"
          className="absolute top-1.5 right-1.5 z-10 opacity-90"
          tooltip={c("actions.remove")}
          aria-label={c("actions.remove")}
          onClick={() => {
            onFileChange(null)
          }}
        >
          <icon.Close className="h-3 w-3" />
        </TooltipButton>
      )}
    </div>
  )
}

export function CoverEditor({ compact }: { compact: boolean }) {
  const {
    book,
    form,
    canEdit,
    editingField,
    isEditing,
    editingCovers,
    setEditingCovers,
  } = useBookForm()
  const t = useTranslation("BookDetailsPage")
  const coverWidth = compact ? 150 : 176

  const {
    bookDetailDisplay,
    gridCoverDisplay,
    bookDetail3dView,
    bookDetail3dViewAudio,
  } = useUserPreferences()
  const [setUserSetting] = useSetUserSettingMutation()

  // each rendition (paper book / cd case) has its own default position
  const defaultViews: Record<Book3DFormat, number> = {
    ebook: bookDetail3dView ?? 0,
    audiobook: bookDetail3dViewAudio ?? 0,
  }
  const [currentViews, setCurrentViews] = useState(defaultViews)

  const canSetEbookCover = !!book.ebook || !!book.readaloud
  const canSetAudioCover = !!book.audiobook || !!book.readaloud

  const textCover = useWatch({ control: form.control, name: "textCover" })
  const audioCover = useWatch({ control: form.control, name: "audioCover" })

  const handleSaveDefaultView = async (format: Book3DFormat) => {
    try {
      await setUserSetting({
        name:
          format === "audiobook" ? "bookDetail3dViewAudio" : "bookDetail3dView",
        value: currentViews[format],
      }).unwrap()
      toast.success(t("cover.savedDefaultPosition"))
    } catch {
      toast.error(t("saveFailed"))
    }
  }

  const editing =
    editingField === "textCover" ||
    editingField === "audioCover" ||
    editingCovers ||
    isEditing

  if (!editing) {
    const editAction = canEdit && (
      <TooltipButton
        variant="secondary"
        size="icon-sm"
        onClick={() => {
          setEditingCovers(true)
        }}
        aria-label={t("cover.edit")}
        tooltip={t("cover.edit")}
        className="tint-surface bg-background/85 text-foreground/70 hover:text-foreground rounded-full p-1.5"
      >
        <icon.Edit className="size-4" />
      </TooltipButton>
    )

    if (bookDetailDisplay === "cover") {
      return (
        <div className="group relative flex min-h-50 w-fit shrink-0 items-center justify-center select-none">
          <div style={{ width: coverWidth }}>
            <BookCover
              book={book}
              width={coverWidth}
              displayMode={gridCoverDisplay}
            />
          </div>
          {editAction && (
            <div className="absolute top-1 -right-4 z-30 flex flex-col items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
              {editAction}
            </div>
          )}
        </div>
      )
    }

    return (
      <Book3D
        book={book}
        width={coverWidth}
        spine={SPINE_INFO}
        initialViews={defaultViews}
        onViewChange={(view, format) => {
          setCurrentViews((views) => ({ ...views, [format]: view }))
        }}
        slabActions={(format) =>
          currentViews[format] !== defaultViews[format] ? (
            <TooltipButton
              variant="secondary"
              size="icon-sm"
              onClick={() => {
                void handleSaveDefaultView(format)
              }}
              aria-label={t("cover.setDefaultPosition")}
              tooltip={t("cover.setDefaultPosition")}
              className="tint-surface bg-background/85 text-foreground/70 hover:text-foreground rounded-full p-1.5"
            >
              <icon.Pin className="size-4" />
            </TooltipButton>
          ) : null
        }
        actions={
          <>
            {editAction}

            <BookFullscreenButton
              book={book}
              width={coverWidth}
              spine={SPINE_INFO}
            />
          </>
        }
      />
    )
  }

  const ebookUrl = getCoverUrl(book.uuid, {
    width: 400,
    height: 600,
    audio: false,
    updatedAt: book.ebook?.updatedAt ?? book.updatedAt,
  })
  const audioUrl = getCoverUrl(book.uuid, {
    width: 400,
    height: 400,
    audio: true,
    updatedAt: book.audiobook?.updatedAt ?? book.updatedAt,
  })
  const { setValue } = form

  return (
    <div className="flex shrink-0 flex-col items-center gap-4">
      <div className="flex flex-wrap items-start justify-center gap-4">
        {canSetEbookCover && (
          <CoverSlot
            label={t("cover.uploadEbook")}
            file={textCover}
            currentUrl={ebookUrl}
            width={coverWidth}
            square={false}
            onFileChange={(file) => {
              setValue("textCover", file, { shouldDirty: true })
            }}
          />
        )}

        {canSetAudioCover && (
          <CoverSlot
            label={t("cover.uploadAudiobook")}
            file={audioCover}
            currentUrl={audioUrl}
            width={coverWidth}
            square
            onFileChange={(file) => {
              setValue("audioCover", file, { shouldDirty: true })
            }}
          />
        )}
      </div>

      <CoverColorsEditor book={book} />
    </div>
  )
}
