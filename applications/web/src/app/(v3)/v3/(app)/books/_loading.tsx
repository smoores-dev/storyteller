import { SiteHeader } from "@v3/_/components/site-header"

import { BookCardSkeleton } from "@/app/(v3)/v3/_/components/books/Grid/BookCardSkeleton"

export default function BookPageLoading() {
  return (
    <>
      <SiteHeader breadcrumbs={[{ label: "Books" }]} />
      <div className="flex max-h-svh flex-1 flex-col">
        <div className="grid max-w-screen grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 transition-opacity duration-200">
          {Array.from({ length: 40 }).map((_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </>
  )
}
