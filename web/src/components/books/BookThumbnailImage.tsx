import { BookDetail } from "@/apiModels"
import { getCoverUrl } from "@/store/api"
import { Box, Image, px, Stack } from "@mantine/core"
import { Icon, IconBookFilled, IconHeadphonesFilled } from "@tabler/icons-react"
import { HTMLProps, Ref, useEffect, useRef, useState } from "react"
import cx from "classnames"
import { twMerge } from "tailwind-merge"

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

export function EbookCoverImage({
  book,
  className,
  height,
  width,
  style,
}: Props & {
  className?: string | undefined
  style?: HTMLProps<HTMLDivElement>["style"]
}) {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [showImage, setShowImage] = useState(false)

  useEffect(() => {
    function loadImageIfNearScreen() {
      if (!imageRef.current) return

      const imageRect = imageRef.current.getBoundingClientRect()
      const isNearScreen =
        imageRect.top - (window.screenTop + window.innerHeight) < 200 &&
        window.screenTop - imageRect.bottom < 200

      setShowImage(isNearScreen)
    }
    loadImageIfNearScreen()
    document.addEventListener("scroll", loadImageIfNearScreen)
    return () => {
      document.removeEventListener("scroll", loadImageIfNearScreen)
    }
  }, [])

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
        <IconBookFilled ref={imageRef as Ref<Icon>} size={64} />
      ) : (
        <Image
          ref={imageRef}
          className="shrink-0"
          alt=""
          aria-hidden
          src={getCoverUrl(book.uuid, {
            height: px(height) as number,
            width: px(width) as number,
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
}: Props & {
  className?: string | undefined
  style?: HTMLProps<HTMLDivElement>["style"]
}) {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [showImage, setShowImage] = useState(false)

  useEffect(() => {
    function loadImageIfNearScreen() {
      if (!imageRef.current) return

      const imageRect = imageRef.current.getBoundingClientRect()
      const isNearScreen =
        imageRect.top - (window.screenTop + window.innerHeight) < 200 &&
        window.screenTop - imageRect.bottom < 200

      setShowImage(isNearScreen)
    }
    loadImageIfNearScreen()
    document.addEventListener("scroll", loadImageIfNearScreen)
    return () => {
      document.removeEventListener("scroll", loadImageIfNearScreen)
    }
  }, [])

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
        <IconHeadphonesFilled ref={imageRef as Ref<Icon>} size={64} />
      ) : (
        <Image
          className="shrink-0"
          alt=""
          aria-hidden
          src={getCoverUrl(book.uuid, {
            height: px(height) as number,
            width: px(width) as number,
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
