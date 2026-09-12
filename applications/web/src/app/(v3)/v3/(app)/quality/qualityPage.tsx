"use client"

import { type ForceDisplayMode } from "@v3/_/components/books/BookListPage"
import { LibraryPage } from "@v3/_/components/library/LibraryPage"
import {
  ALL_KEY,
  librarySections,
} from "@v3/_/components/library/library-sections"

import { useTranslation } from "@/app/(v3)/v3/_/hooks/use-translation"
import { type DisplayField } from "@/sort"

const ALIGNMENT_DISPLAY_FIELDS: DisplayField[] = [
  "alignmentGrade",
  "alignmentSentenceCoverage",
  "alignmentAudioCoverage",
  // "alignmentConfidence",
  "alignedAt",
]
const FORCE_DISPLAY_MODE: ForceDisplayMode = {
  layout: "list",
  displayFields: ALIGNMENT_DISPLAY_FIELDS,
  sortMode: "alignedAt",
  sortDirection: "desc",
}

export default function QualityPage() {
  const t = useTranslation("LibraryPage")
  return (
    <LibraryPage
      title={t("BookReports.title")}
      section={librarySections.grades}
      initialSelectedItem="all"
      itemLabels={{ [ALL_KEY]: t("BookReports.all") }}
      bookClickMode="report"
      listDisplayFields={ALIGNMENT_DISPLAY_FIELDS}
      forceDisplayMode={FORCE_DISPLAY_MODE}
      emptyMessage={t("BookReports.emptyState")}
      noneLabel={t("BookReports.none")}
      contentClassName="p-6 pt-0 [&_.font-heading]:text-[0.8125rem]!"
    />
  )
}
