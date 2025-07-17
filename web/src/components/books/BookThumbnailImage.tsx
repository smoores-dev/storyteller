import { BookDetail } from "@/apiModels"
import { getCoverUrl } from "@/store/api"
import { Box, Image } from "@mantine/core"
import NextImage from "next/image"
import { HTMLProps } from "react"

interface Props {
  book: BookDetail
  height: string
  width: string
}

export function BookThumbnailImage({ book, height, width }: Props) {
  if (book.readaloud || (book.ebook && book.audiobook)) {
    return (
      <Box
        className="group/thumbnail relative"
        style={{
          height,
          width,
        }}
      >
        <EbookCoverImage
          book={book}
          height={height}
          width={width}
          className="absolute z-20 -translate-x-[10%] scale-[80%] transition-transform group-hover/thumbnail:-translate-x-[15%] group-hover/thumbnail:scale-[70%]"
        />
        <AudiobookCoverImage
          book={book}
          height={width}
          width={width}
          className="absolute z-10 translate-x-[10%] scale-[80%] transition-transform group-hover/thumbnail:translate-x-[15%] group-hover/thumbnail:scale-[70%]"
          style={{
            top: `calc((${height} - ${width}) / 2)`,
          }}
        />
      </Box>
    )
  }

  if (book.ebook) {
    return <EbookCoverImage book={book} height={height} width={width} />
  }

  if (book.audiobook) {
    return (
      <AudiobookCoverImage
        book={book}
        height={width}
        width={width}
        className="relative"
        style={{
          top: `calc((${height} - ${width}) / 2)`,
        }}
      />
    )
  }

  return null
}

function EbookCoverImage({
  book,
  className,
  height,
  width,
}: Props & {
  className?: string | undefined
}) {
  return (
    <Box {...(className && { className })} style={{ height, width }}>
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
  height,
  width,
  style,
}: Props & {
  className?: string | undefined
  style?: HTMLProps<HTMLDivElement>["style"]
}) {
  return (
    <Box {...(className && { className })} style={{ height, width, ...style }}>
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
