import { Skeleton } from "@v3/_/components/ui/skeleton"

export function BookCardSkeleton() {
  return (
    <div className="flex w-full min-w-0 flex-col">
      <Skeleton className="rounded-card aspect-13/16 w-full shrink-0 animate-none" />
      <div className="mt-2 flex flex-col gap-0.5 px-1">
        <Skeleton className="h-4 w-2/3 animate-none" />
        <Skeleton className="mt-1 h-3.5 w-full animate-none" />
        <Skeleton className="h-3.5 w-1/3 animate-none" />
      </div>
    </div>
  )
}
