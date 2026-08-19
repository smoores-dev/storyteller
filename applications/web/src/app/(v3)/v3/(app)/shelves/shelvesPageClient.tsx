"use client"

import { LibraryPage } from "@v3/_/components/library/LibraryPage"
import { librarySections } from "@v3/_/components/library/library-sections"
import { useTranslation } from "@v3/_/hooks/use-translation"

export function ShelvesPageClient(props?: { initialShelfUuid?: string }) {
  const t = useTranslation("LibraryPage")

  return (
    <LibraryPage
      title={t("Shelves.plain")}
      section={librarySections.shelves}
      noneLabel={t("allItems")}
      {...(props?.initialShelfUuid && {
        initialSelectedItem: props.initialShelfUuid,
      })}
    />
  )
}
