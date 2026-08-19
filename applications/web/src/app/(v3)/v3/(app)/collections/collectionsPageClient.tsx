"use client"

import { LibraryPage } from "@v3/_/components/library/LibraryPage"
import { librarySections } from "@v3/_/components/library/library-sections"
import { useTranslation } from "@v3/_/hooks/use-translation"

export function CollectionsPageClient({
  initialCollectionUuid,
}: {
  initialCollectionUuid?: string
}) {
  const t = useTranslation("LibraryPage")

  return (
    <LibraryPage
      title={t("Collections.by")}
      section={librarySections.collections}
      noneLabel={t("Collections.none")}
      {...(initialCollectionUuid && {
        initialSelectedItem: initialCollectionUuid,
      })}
    />
  )
}
