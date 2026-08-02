"use client"

import { type ForceDisplayMode } from "@v3/_/components/books/BookListPage"
import { LibraryPage } from "@v3/_/components/library/LibraryPage"
import {
  ALL_KEY,
  librarySections,
} from "@v3/_/components/library/library-sections"

import { useTranslation } from "@/app/(v3)/v3/_/hooks/use-translation"
import { type DisplayField } from "@/sort"

// the quality page's list/table layout shows only the alignment metrics as
// columns, regardless of the global listDisplayFields preference.
const ALIGNMENT_DISPLAY_FIELDS: DisplayField[] = [
  "alignmentGrade",
  "alignmentScore",
  "alignmentMissingSentences",
  "alignmentMutedChapters",
  // "alignmentMissingChapters",
]
const FORCE_DISPLAY_MODE: ForceDisplayMode = {
  layout: "list",
  displayFields: ALIGNMENT_DISPLAY_FIELDS,
  sortMode: "alignmentGrade",
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
      contentClassName="p-6 [&_.font-heading]:text-[0.8125rem]!"
    />
  )
}

// // the muted-chapters toggle writes an ordinary condition onto the page's
// // filter controller so it stays in sync with the filter bar's chips.
// function MutedToggle() {
//   const { controller } = useBookListPageState()
//   const { conditionsForField, setConditionsForField, removeField } = controller

//   const { data: facets } = useGetAlignmentFacetsQuery()

//   const mutedActive = conditionsForField("alignmentMutedChapters").some(
//     (c) => c.operator === "greaterThan",
//   )

//   const toggleMuted = useCallback(() => {
//     if (mutedActive) {
//       removeField("alignmentMutedChapters")
//       return
//     }
//     const cond: ShelfFilterCondition = {
//       type: "condition",
//       field: "alignmentMutedChapters",
//       operator: "greaterThan",
//       value: 0,
//     }
//     setConditionsForField("alignmentMutedChapters", [cond])
//   }, [mutedActive, removeField, setConditionsForField])

//   return (
//     <div className="flex items-center px-4 pt-2">
//       <Button
//         variant={mutedActive ? "secondary" : "ghost"}
//         size="sm"
//         onClick={toggleMuted}
//         className="gap-1.5"
//       >
//         <icon.VolumeOff className="size-4" />
//         Muted
//         {facets && facets.muted > 0 && (
//           <span className="text-muted-foreground tabular-nums">
//             {facets.muted}
//           </span>
//         )}
//       </Button>
//     </div>
//   )
// }
