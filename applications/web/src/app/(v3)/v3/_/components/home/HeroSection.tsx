"use client"

import { useMemo } from "react"

import { Book3D } from "@v3/_/components/books/Book3D"
import { useCoverScope } from "@v3/_/components/books/CoverScope"
import { Button } from "@v3/_/components/ui/button"
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { formatTimeHuman } from "@/components/reader/preferenceItems/formatTime"
import { type BookWithRelations } from "@/database/books"
import { STATUS_READING } from "@/database/statusKinds"
import * as icon from "@/icons"
import { useListBooksQuery } from "@/store/api"

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
  const { data: books = [] } = useListBooksQuery(undefined)

  const book = useMemo(() => {
    return books
      .filter((b) => b.status?.name === STATUS_READING)
      .sort(
        (a, b) => (b.position?.timestamp ?? 0) - (a.position?.timestamp ?? 0),
      )[0]
  }, [books])

  if (!book) return null

  return <Hero book={book} />
}

function Hero({ book }: { book: BookWithRelations }) {
  const t = useTranslation("HomePage")
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
      className="to-cover-well relative -mx-4 flex flex-col gap-0 bg-linear-to-t from-transparent via-30% pb-8"
      {...scope}
    >
      <p className="text-tinted small-caps mx-6 mt-8">{t("hero.eyebrow")}</p>
      <div className="flex flex-col-reverse gap-6 overflow-hidden px-6 py-8 @xl/main:flex-row @xl/main:gap-10">
        <div className="flex flex-1 flex-col justify-between pb-4">
          <div slot="main-info">
            <h2 className="font-heading text-subtle-foreground text-2xl leading-tight font-medium tracking-tight @xl/main:text-3xl">
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
          <Book3D book={book} width={200} />
        </div>
      </div>
    </section>
  )
}
