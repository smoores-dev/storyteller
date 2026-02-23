// import { HomeShelfRenderer, ShelfManager } from "@/components/home"
import type { Metadata } from "next"

import { SiteHeader } from "@v3/_/components/site-header"

// import { useHomeShelves } from "@/hooks/useHomeShelves"

export const metadata: Metadata = {
  title: "Home",
}

export default function Index() {
  // const { shelves, isLoading } = useHomeShelves()

  return (
    <div>
      <SiteHeader
        breadcrumbs={[{ label: "Home" }]}
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
