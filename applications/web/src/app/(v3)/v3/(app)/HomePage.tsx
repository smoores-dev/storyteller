"use client"

import { SiteHeader } from "@/app/(v3)/v3/_/components/site-header"
import {
  PageContent,
  PageLayout,
  PageMain,
} from "@/app/(v3)/v3/_/components/ui/page-layout"
import { type HomeSectionWithDetails } from "@/database/shelves"

import { HomeSections, HomeSectionsActions } from "./HomeSections"

export function HomePage({
  initialSections,
}: {
  initialSections?: HomeSectionWithDetails[]
}) {
  return (
    <PageLayout>
      <PageMain>
        <SiteHeader
          breadcrumbs={[]}
          actions={<HomeSectionsActions />}
          className="pointer-events-none absolute z-50 w-full bg-transparent!"
        />
        <PageContent>
          <HomeSections initialSections={initialSections} />
        </PageContent>
      </PageMain>
    </PageLayout>
  )
}
