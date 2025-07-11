import { BookDetail } from "@/apiModels"
import { getCoverUrl } from "@/store/api"
import { Box, Image } from "@mantine/core"
import NextImage from "next/image"
import cx from "classnames"

interface Props {
  book: BookDetail
}

export function BookThumbnailImage({ book }: Props) {
  if (book.alignedBook || (book.ebook && book.audiobook)) {
    return (
      <Box className="relative">
        <EbookCoverImage
          book={book}
          className="absolute z-20 -translate-x-[10%] scale-[80%] transition-transform group-hover:-translate-x-[15%] group-hover:scale-[70%]"
        />
        <AudiobookCoverImage
          book={book}
          className="absolute top-[2.4375rem] z-10 translate-x-[10%] scale-[80%] transition-transform group-hover:translate-x-[15%] group-hover:scale-[70%]"
        />
      </Box>
    )
  }

  if (book.ebook) {
    return <EbookCoverImage book={book} />
  }

  if (book.audiobook) {
    return <AudiobookCoverImage book={book} />
  }

  return null
}

function EbookCoverImage({
  book,
  className,
}: Props & { className?: string | undefined }) {
  return (
    <Box className={cx("h-[14.0625rem] w-[9.1875rem]", className)}>
      <Image
        className="group-hover:border-st-orange-300 h-full rounded-md group-hover:border-2"
        component={NextImage}
        height={225}
        width={147}
        alt=""
        aria-hidden
        src={getCoverUrl(book.uuid)}
      />
    </Box>
  )
}

function AudiobookCoverImage({
  book,
  className,
}: Props & { className?: string | undefined }) {
  return (
    <Box className={cx("h-[9.1875rem] w-[9.1875rem]", className)}>
      <Image
        className="group-hover:border-st-orange-300 h-full rounded-md bg-slate-200 group-hover:border-2"
        component={NextImage}
        height={147}
        width={147}
        alt={book.title}
        aria-hidden
        src={getCoverUrl(book.uuid, true)}
      />
    </Box>
  )
}
