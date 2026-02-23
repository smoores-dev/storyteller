// import { HomeShelfRenderer, ShelfManager } from "@/components/home"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { SiteHeader } from "@v3/_/components/site-header"

// import { useHomeShelves } from "@/hooks/useHomeShelves"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("HomePage")
  return {
    title: t("title"),
  }
}

export default async function Index() {
  const t = await getTranslations("HomePage")
  // const { shelves, isLoading } = useHomeShelves()

  return (
    <div>
      <SiteHeader
        breadcrumbs={[{ label: t("title") }]}
        // actions={<ShelfManager />}
      />
      <div className="flex flex-1 flex-col gap-1 py-4">
        {/* {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
          </div>
        ) : (
          shelves.map((shelf) => (
            <HomeShelfRenderer key={shelf.uuid} shelf={shelf} />
          ))
        )} */}
      </div>
    </div>
  )
}
