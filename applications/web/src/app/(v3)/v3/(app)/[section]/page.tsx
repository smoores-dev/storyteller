import { type Metadata } from "next"
import { notFound } from "next/navigation"

import { withPageAuth } from "@v3/_/server/page-auth-wrapper"

import { FACET_SECTION_SLUGS } from "@/facet-sections"

import { SectionPageClient } from "./sectionPageClient"

type SectionPageProps = {
  params: Promise<{ section: string }>
}

export function generateStaticParams() {
  return Object.keys(FACET_SECTION_SLUGS).map((section) => ({ section }))
}

export const metadata: Metadata = { title: null }

export default withPageAuth<SectionPageProps>(["bookList"])(
  async function SectionPage({ params }) {
    const { section: slug } = await params
    const section = FACET_SECTION_SLUGS[slug]
    if (!section) notFound()

    return <SectionPageClient section={section} />
  },
)
