"use client"

import { Book3D } from "@v3/_/components/books/Book3D"
import { useCoverScope } from "@v3/_/components/books/CoverScope"
import { Button } from "@v3/_/components/ui/button"
import { Skeleton } from "@v3/_/components/ui/skeleton"
import { useUserPreferences } from "@v3/_/components/user-preferences-provider"
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { type BookWithRelations } from "@/database/books"
import { STATUS_READING } from "@/database/statusKinds"
import { formatTimeHuman } from "@/formatTime"
import * as icon from "@/icons"
import {
  useListInfiniteBooksInfiniteQuery,
  useListStatusesQuery,
} from "@/store/api"

type ReadLink = {
  href: string
  labelKey: "readAlong" | "read" | "listen"
  icon: typeof icon.BookAlt
}

function getReadLink(book: BookWithRelations): ReadLink {
  if (book.readaloud?.status === "ALIGNED") {
    return {
      href: `/books/${book.uuid}/read?mode=readaloud`,
      labelKey: "readAlong",
      icon: icon.PlayerPlay,
    }
  }
  if (book.ebook) {
    return {
      href: `/books/${book.uuid}/read?mode=epub`,
      labelKey: "read",
      icon: icon.BookAlt,
    }
  }
  return {
    href: `/books/${book.uuid}/read?mode=audiobook`,
    labelKey: "listen",
    icon: icon.Headphones,
  }
}

export function HeroSection() {
  const { data: statuses } = useListStatusesQuery()
  const readingStatus = statuses?.find((s) => s.name === STATUS_READING)

  const { data } = useListInfiniteBooksInfiniteQuery(
    {
      limit: 1,
      orderBy: "lastRead",
      orderDirection: "desc",
      filter: {
        type: "condition",
        field: "status",
        operator: "is",
        value: readingStatus?.uuid ?? null,
      },
    },
    { skip: !readingStatus },
  )

  const book = data?.pages[0]?.[0]

  if (!book) return data === undefined ? <HeroSkeleton /> : null

  return <Hero book={book} />
}

function HeroSkeleton() {
  return (
    <section className="to-cover-well relative -mx-4 flex min-h-96 flex-col gap-0 bg-linear-to-t from-transparent via-30% pb-8">
      <Skeleton className="mx-6 mt-14 h-3 w-28 animate-none md:mt-8" />
      <div className="flex flex-col-reverse gap-6 overflow-hidden px-6 py-8 @xl/main:flex-row @xl/main:gap-10">
        <div className="flex flex-1 flex-col justify-between gap-8 pb-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-3/5 animate-none" />
            <Skeleton className="h-4 w-2/5 animate-none" />
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-1.5 w-48 max-w-full animate-none rounded-full" />
              <Skeleton className="h-4 w-24 animate-none" />
            </div>

            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-28 animate-none rounded-lg" />
              <Skeleton className="h-8 w-24 animate-none rounded-lg" />
            </div>
          </div>
        </div>

        <div className="flex w-full justify-center @xl/main:w-auto">
          <Skeleton className="h-[290px] w-[200px] animate-none rounded-md" />
        </div>
      </div>
    </section>
  )
}

function Hero({ book }: { book: BookWithRelations }) {
  const t = useTranslation("HomePage")
  const { bookDetail3dView, bookDetail3dViewAudio } = useUserPreferences()
  const scope = useCoverScope(book)

  const progress = book.position?.locator.locations?.totalProgression ?? 0
  const duration = book.audiobook?.duration ?? book.readaloud?.duration ?? null
  const timeLeft =
    duration != null && progress > 0
      ? formatTimeHuman(duration * (1 - progress))
      : null

  const read = getReadLink(book)
  const ReadIcon = read.icon

  const MAX_CREATORS = 5

  const formatCreators = (list: { name: string }[]) => {
    const visible = list.slice(0, MAX_CREATORS).map((c) => c.name)
    const hidden = list.length - MAX_CREATORS

    return hidden > 0
      ? `${visible.join(", ")} +${hidden} more`
      : visible.join(", ")
  }

  const byline = [
    book.authors.length > 0
      ? t("hero.by", { authors: formatCreators(book.authors) })
      : null,
    book.narrators.length > 0
      ? t("hero.narratedBy", { narrators: formatCreators(book.narrators) })
      : null,
  ]
    .filter(Boolean)
    .join(" \u00b7 ")

  return (
    <section
      className="to-cover-well relative -mx-4 flex min-h-96 flex-col gap-0 bg-linear-to-t from-transparent via-30% pb-8"
      {...scope}
    >
      <p className="text-tinted small-caps mx-6 mt-14 md:mt-8">
        {t("hero.eyebrow")}
      </p>
      <div className="flex grow flex-col-reverse gap-6 overflow-hidden px-6 py-8 @xl/main:flex-row @xl/main:gap-10">
        <div className="flex flex-1 flex-col justify-between pb-4">
          <div slot="main-info">
            <h2 className="font-heading text-subtle-foreground text-xl leading-tight font-semibold @xl/main:text-2xl">
              {book.title}
            </h2>

            {byline && <p className="text-tinted mt-2 text-sm">{byline}</p>}
          </div>

          <div slot="stats-and-actions" className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-foreground/10 h-1.5 w-48 max-w-full overflow-hidden rounded-full">
                <div
                  className="bg-cover-accent h-full transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <span className="text-tinted text-sm">
                {t("hero.percent", { percent: Math.round(progress * 100) })}
                {timeLeft && <> · {t("hero.timeLeft", { time: timeLeft })}</>}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="cover"
                nativeButton={false}
                className="rounded-lg"
                render={
                  <V3Link href={read.href}>
                    <ReadIcon className="mr-1 size-3.5" />
                    {t(`hero.${read.labelKey}`)}
                  </V3Link>
                }
              />
              <Button
                variant="ghost"
                nativeButton={false}
                render={
                  <V3Link href={`/books/${book.uuid}`}>
                    {t("hero.viewDetails")}
                  </V3Link>
                }
              />
            </div>
          </div>
        </div>
        <div className="flex w-full justify-center @xl/main:w-auto">
          <Book3D
            book={book}
            width={200}
            initialViews={{
              audiobook: bookDetail3dViewAudio ?? undefined,
              ebook: bookDetail3dView ?? undefined,
            }}
          />
        </div>
      </div>
    </section>
  )
}
