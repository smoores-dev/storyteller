import { SiteHeader } from "@v3/_/components/site-header"
import { Skeleton } from "@v3/_/components/ui/skeleton"

import { cn } from "@/cn"

function SectionLabelSkeleton({ width = "6rem" }: { width?: string }) {
  return (
    <div className="mb-3 flex h-6 items-center gap-3">
      <Skeleton className="h-2.5 animate-none" style={{ width }} />
      <span className="bg-muted-foreground/20 h-px flex-1" />
      <Skeleton className="size-4 animate-none rounded" />
    </div>
  )
}

function DetailRowsSkeleton() {
  return (
    <div className="grid grid-cols-2 items-start gap-x-4 gap-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="contents">
          <Skeleton className="h-4 w-24 animate-none" />
          <Skeleton className="h-4 w-20 animate-none" />
        </div>
      ))}
    </div>
  )
}

function HeroSkeleton({ compact }: { compact: boolean }) {
  return (
    <div className="to-cover-well dark:to-cover-header relative bg-linear-to-t from-transparent via-30%">
      <div
        className={cn(
          "relative flex flex-col items-center gap-5 px-6 pt-14 pb-5 text-center",
          !compact && "min-h-80 @xl/book:flex-row @xl/book:gap-8",
        )}
      >
        <Skeleton className="h-[210px] w-[150px] shrink-0 animate-none rounded-md" />

        <div
          className={cn(
            "flex w-full grow flex-col items-center gap-1.5",
            !compact && "@xl/book:items-start",
          )}
        >
          <Skeleton className="h-6 w-1/2 animate-none" />
          <Skeleton className="h-3.5 w-24 animate-none" />
          <Skeleton className="mt-0.5 h-3.5 w-40 animate-none" />
          <Skeleton className="h-3.5 w-32 animate-none" />
          <Skeleton className="mt-0.5 h-3.5 w-44 animate-none" />

          <div className="mt-2 flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="size-4 animate-none rounded-sm" />
            ))}
          </div>

          <div className="mt-3 flex w-full items-center justify-center gap-2">
            <Skeleton className="h-9 w-32 animate-none rounded-lg" />
            <Skeleton className="h-9 w-24 animate-none rounded-lg" />
            <div className="flex-1" />
            <Skeleton className="size-9 animate-none rounded-lg" />
            <Skeleton className="size-9 animate-none rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionsSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-6">
      <section>
        <SectionLabelSkeleton width="9rem" />
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="size-4 animate-none rounded-sm" />
            ))}
          </div>
          <Skeleton className="h-4 w-12 animate-none" />
        </div>
      </section>

      <section>
        <SectionLabelSkeleton width="5.5rem" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-full animate-none" />
          <Skeleton className="h-4 w-11/12 animate-none" />
          <Skeleton className="h-4 w-4/5 animate-none" />
          <Skeleton className="mt-1 h-4 w-24 animate-none" />
        </div>
      </section>

      <section>
        <SectionLabelSkeleton width="6.5rem" />
        <DetailRowsSkeleton />
      </section>

      <div className="flex w-full flex-col gap-4 @xl/book:grid @xl/book:grid-cols-2 @xl/book:gap-10">
        <section>
          <SectionLabelSkeleton width="3rem" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-16 animate-none rounded-full" />
            <Skeleton className="h-6 w-24 animate-none rounded-full" />
            <Skeleton className="h-6 w-14 animate-none rounded-full" />
          </div>
        </section>

        <section>
          <SectionLabelSkeleton width="6rem" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-20 animate-none rounded-full" />
            <Skeleton className="h-6 w-16 animate-none rounded-full" />
          </div>
        </section>
      </div>

      <section>
        <SectionLabelSkeleton width="7rem" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3 animate-none" />
          <Skeleton className="h-4 w-1/2 animate-none" />
        </div>
      </section>
    </div>
  )
}

export const BookDetailsSkeleton = ({ compact }: { compact?: boolean }) => {
  if (compact) {
    return (
      <div className="@container/book flex flex-1 flex-col">
        <div className="absolute top-2 right-3 z-10 flex items-center gap-1">
          <Skeleton className="size-7 animate-none rounded-md" />
          <Skeleton className="size-7 animate-none rounded-md" />
          <Skeleton className="size-7 animate-none rounded-md" />
          <Skeleton className="size-7 animate-none rounded-md" />
        </div>

        <div className="flex-1 overflow-hidden">
          <HeroSkeleton compact />
          <SectionsSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="@container/book flex flex-1 flex-col">
      <SiteHeader breadcrumbs={[]} />
      <div className="flex-1 overflow-hidden">
        <div className="mx-auto max-w-3xl">
          <HeroSkeleton compact={false} />
          <SectionsSkeleton />
        </div>
      </div>
    </div>
  )
}
