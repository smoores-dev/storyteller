"use client"

import { LibraryPage } from "@v3/_/components/library/LibraryPage"
import { librarySections } from "@v3/_/components/library/library-sections"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { FACET_SECTION_REGISTRY, type FacetSection } from "@/facet-sections"
import { FORMAT_VALUES } from "@/fields"

export function SectionPageClient({ section }: { section: FacetSection }) {
  const t = useTranslation("LibraryPage")
  const c = useCommon()

  const def = FACET_SECTION_REGISTRY[section]
  const sectionDef = librarySections[section]

  const title = t(`${def.labelBase}.by` as "Series.by")
  const noneLabel = def.none
    ? t(`${def.labelBase}.none` as "Series.none")
    : undefined

  if (section === "formats") {
    /* oxlint-disable typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type */
    const itemLabels = Object.fromEntries(
      FORMAT_VALUES.map((value) => [
        value,
        c.plain(
          `fields.options.format.${value}` as "fields.options.format.ebook",
        ),
      ]),
    )
    /* oxlint-enable typescript/no-unnecessary-type-assertion */

    return (
      <LibraryPage
        title={title}
        section={sectionDef}
        itemLabels={itemLabels}
        defaultSidebarSort="count"
      />
    )
  }

  return (
    <LibraryPage title={title} section={sectionDef} noneLabel={noneLabel} />
  )
}
