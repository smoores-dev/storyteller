import { ActionIcon, Box, RingProgress, Stack, Tooltip } from "@mantine/core"
import { IconDotsCircleHorizontal, IconProgressX } from "@tabler/icons-react"
import Link from "next/link"
import { Fragment } from "react"

import { IconReadaloud } from "@/components/icons/IconReadaloud"
import { formatTimeHuman } from "@/components/reader/preferenceItems/formatTime"
import { type BookWithRelations } from "@/database/books"
import {
  type BookType,
  type FilterSortOptions,
} from "@/hooks/useFilterSortedBooks"
import { useCancelProcessingMutation } from "@/store/api"
import { formatFileSize } from "@/utils/formatFileSize"

import { BookThumbnailImage } from "./BookThumbnailImage"

type DetailItem = {
  text: string
  href?: string
}

function nonMissingAsset<T extends { missing: boolean | null }>(
  asset: T | null,
): T | null {
  return asset && !asset.missing ? asset : null
}

function getDisplayFileSize(
  book: BookWithRelations,
  bookTypes: BookType[] | null,
): number | null {
  if (bookTypes?.length === 1) {
    const [type] = bookTypes
    if (type === "ebook" || type === "ebook-only")
      return nonMissingAsset(book.ebook)?.fileSize ?? null
    if (type === "audiobook" || type === "audiobook-only")
      return nonMissingAsset(book.audiobook)?.fileSize ?? null
    if (type === "readaloud")
      return nonMissingAsset(book.readaloud)?.fileSize ?? null
  }
  const sizes = [
    nonMissingAsset(book.ebook)?.fileSize,
    nonMissingAsset(book.audiobook)?.fileSize,
    nonMissingAsset(book.readaloud)?.fileSize,
  ].filter((s): s is number => s != null && s > 0)
  if (!sizes.length) return null
  return Math.max(...sizes)
}

function getDisplayDuration(book: BookWithRelations): number | null {
  return (
    book.duration ??
    nonMissingAsset(book.audiobook)?.duration ??
    nonMissingAsset(book.readaloud)?.duration ??
    null
  )
}

function getDisplayPageCount(book: BookWithRelations): number | null {
  return (
    book.pageCount ??
    nonMissingAsset(book.ebook)?.pageCount ??
    nonMissingAsset(book.readaloud)?.pageCount ??
    null
  )
}

function formatSortMetric(
  book: BookWithRelations,
  sortKey: string,
  bookTypes: BookType[] | null,
): string | null {
  switch (sortKey) {
    case "duration": {
      const dur = getDisplayDuration(book)
      return dur != null && dur > 0 ? formatTimeHuman(dur) : null
    }
    case "file-size":
      return formatFileSize(getDisplayFileSize(book, bookTypes))
    case "page-count": {
      const pages = getDisplayPageCount(book)
      return pages != null && pages > 0 ? `${pages} pages` : null
    }
    case "create-time":
      return new Date(book.createdAt).toLocaleDateString()
    case "align-time":
      return book.alignedAt
        ? new Date(book.alignedAt).toLocaleDateString()
        : null
    case "publish-date":
      return book.publicationDate
        ? new Date(book.publicationDate).toLocaleDateString()
        : null
    default:
      return null
  }
}

function getBookDetailItems(
  book: BookWithRelations,
  options?: FilterSortOptions,
): DetailItem[] {
  if (!options) {
    const author = book.authors[0]
    return author
      ? [{ text: author.name, href: `/books?authors=${author.uuid}` }]
      : []
  }

  const items: DetailItem[] = []
  const [sortKey] = options.sort
  const { filters } = options

  if (sortKey !== "title" && sortKey !== "author") {
    const metric = formatSortMetric(book, sortKey, filters.bookTypes)
    if (metric) items.push({ text: metric })
  }

  // range filter metrics not already shown via the sort key
  if (items.length < 2 && filters.duration && sortKey !== "duration") {
    const dur = getDisplayDuration(book)
    if (dur != null && dur > 0) items.push({ text: formatTimeHuman(dur) })
  }
  if (items.length < 2 && filters.fileSize && sortKey !== "file-size") {
    const text = formatFileSize(getDisplayFileSize(book, filters.bookTypes))
    if (text) items.push({ text })
  }
  if (items.length < 2 && filters.pageCount && sortKey !== "page-count") {
    const pages = getDisplayPageCount(book)
    if (pages != null && pages > 0) items.push({ text: `${pages} pages` })
  }

  const wantAuthor =
    sortKey === "title" || sortKey === "author" || !!filters.authors
  if (wantAuthor || !items.length) {
    const author = book.authors[0]
    if (author) {
      items.push({
        text: author.name,
        href: `/books?authors=${author.uuid}`,
      })
    }
  }

  return items.slice(0, 2)
}

interface Props {
  book: BookWithRelations
  link?: boolean
  onClick?: () => void
  filterSortOptions?: FilterSortOptions
}

export function BookThumbnail({
  book,
  link,
  onClick,
  filterSortOptions,
}: Props) {
  const [cancelProcessing] = useCancelProcessingMutation()
  const detailItems = getBookDetailItems(book, filterSortOptions)

  const Container = link ? Link : Box
  const TextContainer = link ? Link : "span"

  return (
    <Box className="group" onClick={link ? undefined : onClick}>
      <Stack gap={2} className="group h-75.75">
        <Stack className="relative mb-1 h-56.25 flex-col justify-center">
          <Container
            href={`/books/${book.uuid}`}
            className="block h-56.25 w-36.75"
          >
            <BookThumbnailImage
              height="14.0625rem"
              width="9.1875rem"
              book={book}
            />
            {book.readaloud?.status === "QUEUED" && (
              <IconDotsCircleHorizontal
                size={40}
                color="white"
                className="absolute top-0 right-0 z-40 filter-[drop-shadow(0_0_1px_rgba(0,0,0,1))]"
              />
            )}
            {book.readaloud?.status === "PROCESSING" && (
              <RingProgress
                className="absolute top-0 right-0 z-40 [&>svg]:filter-[drop-shadow(0_0_1px_rgba(0,0,0,1))]"
                size={40}
                thickness={4}
                roundCaps
                rootColor="white"
                sections={[
                  {
                    value: book.readaloud.stageProgress * 100,
                    color: "st-orange",
                  },
                ]}
              />
            )}
          </Container>
          {(book.readaloud?.status === "QUEUED" ||
            book.readaloud?.status === "PROCESSING") && (
            <Tooltip
              position="right"
              label={
                book.readaloud.status === "QUEUED"
                  ? "Remove from queue"
                  : "Stop processing"
              }
            >
              <ActionIcon
                className="absolute top-[6px] right-[6px] z-50 hidden rounded-full group-hover:block"
                color="red"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  void cancelProcessing({ uuid: book.uuid })
                }}
              >
                <IconProgressX
                  aria-label={
                    book.readaloud.status === "QUEUED"
                      ? "Remove from queue"
                      : "Stop processing"
                  }
                />
              </ActionIcon>
            </Tooltip>
          )}
        </Stack>
        <TextContainer
          href={`/books/${book.uuid}`}
          className="line-clamp-2 max-w-36.75 text-sm font-semibold group-hover:line-clamp-none"
        >
          {!!book.readaloud?.filepath && (
            <IconReadaloud className="text-st-orange-600 -mx-1 -mt-3 -mb-2 inline-block h-6 w-6" />
          )}{" "}
          {book.title}
        </TextContainer>
        <div className="line-clamp-1 max-w-36.75 truncate pb-2 text-xs">
          {detailItems.map((item, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="text-gray-400"> · </span>}
              {item.href && link ? (
                <Link
                  href={item.href}
                  className="hover:text-st-orange-600 hover:underline"
                >
                  {item.text}
                </Link>
              ) : (
                <span>{item.text}</span>
              )}
            </Fragment>
          ))}
        </div>
      </Stack>
    </Box>
  )
}
