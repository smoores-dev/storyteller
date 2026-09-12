import { type Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound } from "next/navigation"

import { withPageAuth } from "@v3/_/server/page-auth-wrapper"

import { getFacetItemName } from "@/database/facetItemName"
import { FACET_SECTION_REGISTRY, FACET_SECTION_SLUGS } from "@/facet-sections"

import { SectionPageClient } from "./sectionPageClient"

type SectionPageProps = {
  params: Promise<{ section: string }>
  searchParams: Promise<{ item?: string }>
}

export function generateStaticParams() {
  return Object.keys(FACET_SECTION_SLUGS).map((section) => ({ section }))
}

export async function generateMetadata({
  params,
  searchParams,
}: SectionPageProps): Promise<Metadata> {
  const { section: slug } = await params
  const section = FACET_SECTION_SLUGS[slug]
  if (!section) return {}

  const { item } = await searchParams
  const [t, itemName] = await Promise.all([
    getTranslations("LibraryPage"),
    item ? getFacetItemName(section, item) : null,
  ])

  return {
    title:
      itemName ??
      t(`${FACET_SECTION_REGISTRY[section].labelBase}.by` as "Series.by"),
  }
}

export default withPageAuth<SectionPageProps>(["bookList"])(
  async function SectionPage({ params }) {
    const { section: slug } = await params
    const section = FACET_SECTION_SLUGS[slug]
    if (!section) notFound()

    return <SectionPageClient section={section} />
  },
)
