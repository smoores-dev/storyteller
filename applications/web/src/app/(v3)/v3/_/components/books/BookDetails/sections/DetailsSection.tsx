"use client"

import { useBookForm } from "@v3/_/components/books/BookDetails/BookFormProvider"
import { LanguageEdit } from "@v3/_/components/books/LanguageEdit"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { useFormatDate } from "@v3/_/lib/formatters"

import { EditableText } from "@/app/(v3)/v3/_/components/books/BookDetails/EditableText"
import { cn } from "@/cn"

import { CollapsibleSection } from "./CollapsibleSection"

export function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  if (children == null || children === "") return null

  return (
    <>
      <span className={cn("text-muted-foreground self-center text-xs")}>
        {label}
      </span>
      <div className="text-sm">{children}</div>
    </>
  )
}

export function DetailsSection({ className }: { className?: string }) {
  const { book } = useBookForm()
  const tLabels = useTranslation("Labels")
  const c = useCommon()
  const formatDate = useFormatDate()

  return (
    <CollapsibleSection
      title={tLabels("bookDetails")}
      sectionKey="details"
      className={className}
    >
      <div className="grid grid-cols-2 items-start gap-x-4 gap-y-2">
        <DetailRow label={c("fields.label.language")}>
          <LanguageEdit />
        </DetailRow>

        <DetailRow label={c("fields.label.publicationDate")}>
          <EditableText
            name="publicationDate"
            type="date"
            className="min-h-6 py-0 text-sm"
            renderDisplay={(value) =>
              formatDate(value, { timeStyle: undefined, timeZone: "UTC" })
            }
          />
        </DetailRow>

        <DetailRow label={c("fields.short.createdAt")}>
          <time dateTime={book.createdAt} title={formatDate(book.createdAt)}>
            {formatDate(book.createdAt, { timeStyle: undefined })}
          </time>
        </DetailRow>

        <DetailRow label={c("fields.label.updatedAt")}>
          <time dateTime={book.updatedAt} title={formatDate(book.updatedAt)}>
            {formatDate(book.updatedAt, { timeStyle: undefined })}
          </time>
        </DetailRow>
      </div>
    </CollapsibleSection>
  )
}
