import { BookDetail } from "@/apiModels"
import { getCoverUrl } from "@/store/api"
import { Box, Image, px, Stack } from "@mantine/core"
import { IconBookFilled, IconHeadphonesFilled } from "@tabler/icons-react"
import { HTMLProps, useCallback, useState } from "react"
import cx from "classnames"
import { twMerge } from "tailwind-merge"
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver"

interface Props {
  book: BookDetail
  height: string
  width: string
  imageHeight?: number | undefined
  imageWidth?: number | undefined
}

export function BookThumbnailImage({
  book,
  height,
  width,
  imageHeight,
  imageWidth,
}: Props) {
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
          imageHeight={imageHeight}
          imageWidth={imageWidth}
          className="hover:animate-swap-right peer absolute z-10 translate-x-[10%] scale-[80%] transition-transform group-hover/thumbnail:translate-x-[15%] group-hover/thumbnail:scale-[70%]"
          style={{
            top: `calc((${height} - ${width}) / 2)`,
          }}
        />
        <EbookCoverImage
          book={book}
          height={height}
          width={width}
          imageHeight={imageHeight}
          imageWidth={imageWidth}
          className="peer-hover:animate-swap-left absolute z-20 -translate-x-[10%] scale-[80%] transition-transform group-hover/thumbnail:-translate-x-[15%] group-hover/thumbnail:scale-[70%]"
        />
      </Box>
    )
  }

  if (book.ebook) {
    return (
      <EbookCoverImage
        book={book}
        height={height}
        width={width}
        imageHeight={imageHeight}
        imageWidth={imageWidth}
      />
    )
  }

  if (book.audiobook) {
    return (
      <AudiobookCoverImage
        book={book}
        height={width}
        width={width}
        className="relative"
        imageHeight={imageHeight}
        imageWidth={imageWidth}
        style={{
          top: `calc((${height} - ${width}) / 2)`,
        }}
      />
    )
  }

  return null
}

export function EbookCoverImage({
  book,
  className,
  height,
  width,
  imageHeight,
  imageWidth,
  style,
}: Props & {
  className?: string | undefined
  style?: HTMLProps<HTMLDivElement>["style"]
}) {
  const [showImage, setShowImage] = useState(false)

  const intersectionCallback = useCallback(
    (entry: IntersectionObserverEntry) => {
      setShowImage(entry.isIntersecting)
    },
    [],
  )

  const ref = useIntersectionObserver(intersectionCallback)

  const [failed, setFailed] = useState(false)
  return (
    <Stack
      className={twMerge(
        cx(
          "group-hover:border-st-orange-300 items-center justify-center overflow-hidden rounded-md bg-slate-200 group-hover:border-2",
          className,
        ),
      )}
      style={{ height, width, ...style }}
    >
      {failed || !showImage ? (
        <IconBookFilled
          ref={(icon) => {
            // This is just typed wrong, see https://github.com/tabler/tabler-icons/pull/1394
            ref(icon as SVGSVGElement | null)
          }}
          size={64}
        />
      ) : (
        <Image
          ref={ref}
          className="shrink-0"
          alt=""
          aria-hidden
          src={getCoverUrl(book.uuid, {
            height: imageHeight ?? (px(height) as number),
            width: imageWidth ?? (px(width) as number),
          })}
          loading="lazy"
          onError={() => {
            setFailed(true)
          }}
        />
      )}
    </Stack>
  )
}

export function AudiobookCoverImage({
  book,
  className,
  height,
  width,
  style,
  imageHeight,
  imageWidth,
}: Props & {
  className?: string | undefined
  style?: HTMLProps<HTMLDivElement>["style"]
}) {
  const [showImage, setShowImage] = useState(false)

  const intersectionCallback = useCallback(
    (entry: IntersectionObserverEntry) => {
      setShowImage(entry.isIntersecting)
    },
    [],
  )

  const ref = useIntersectionObserver(intersectionCallback)

  const [failed, setFailed] = useState(false)
  return (
    <Stack
      className={twMerge(
        cx(
          "group-hover:border-st-orange-300 items-center justify-center overflow-hidden rounded-md bg-slate-200 group-hover:border-2",
          className,
        ),
      )}
      style={{ height, width, ...style }}
    >
      {failed || !showImage ? (
        <IconHeadphonesFilled
          ref={(icon) => {
            ref(icon as SVGSVGElement | null)
          }}
          size={64}
        />
      ) : (
        <Image
          ref={ref}
          className="shrink-0"
          alt=""
          aria-hidden
          src={getCoverUrl(book.uuid, {
            height: imageHeight ?? (px(height) as number),
            width: imageWidth ?? (px(width) as number),
            audio: true,
          })}
          loading="lazy"
          onError={() => {
            setFailed(true)
          }}
        />
      )}
    </Stack>
  )
}
