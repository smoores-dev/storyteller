import { BookDetail } from "@/apiModels"
import { getCoverUrl } from "@/store/api"
import { Box, Image, Stack } from "@mantine/core"
import { IconBookFilled, IconHeadphonesFilled } from "@tabler/icons-react"
import { HTMLProps, useState } from "react"
import cx from "classnames"

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
        <AudiobookCoverImage
          book={book}
          height={width}
          width={width}
          className="hover:animate-swap-right peer absolute z-10 translate-x-[10%] scale-[80%] transition-transform group-hover/thumbnail:translate-x-[15%] group-hover/thumbnail:scale-[70%]"
          style={{
            top: `calc((${height} - ${width}) / 2)`,
          }}
        />
        <EbookCoverImage
          book={book}
          height={height}
          width={width}
          className="peer-hover:animate-swap-left absolute z-20 -translate-x-[10%] scale-[80%] transition-transform group-hover/thumbnail:-translate-x-[15%] group-hover/thumbnail:scale-[70%]"
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
  const [failed, setFailed] = useState(false)
  return (
    <Stack
      className={cx(
        "group-hover:border-st-orange-300 items-center justify-center rounded-md bg-slate-200 group-hover:border-2",
        className,
      )}
      style={{ height, width }}
    >
      {failed ? (
        <IconBookFilled size={64} />
      ) : (
        <Image
          className="shrink-0 rounded-md"
          alt=""
          aria-hidden
          src={getCoverUrl(book.uuid)}
          onError={() => {
            setFailed(true)
          }}
        />
      )}
    </Stack>
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
  const [failed, setFailed] = useState(false)
  return (
    <Stack
      className={cx(
        "group-hover:border-st-orange-300 items-center justify-center rounded-md bg-slate-200 group-hover:border-2",
        className,
      )}
      style={{ height, width, ...style }}
    >
      {failed ? (
        <IconHeadphonesFilled size={64} />
      ) : (
        <Image
          className="shrink-0 rounded-md"
          alt=""
          aria-hidden
          src={getCoverUrl(book.uuid, true)}
          onError={() => {
            setFailed(true)
          }}
        />
      )}
    </Stack>
  )
}
