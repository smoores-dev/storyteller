import { Link } from "expo-router"
import { BookOpen, Headphones } from "lucide-react-native"
import { Pressable, View, type ViewStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { type BookWithRelations } from "@/database/books"
import { useAvailableFormats } from "@/hooks/useAvailableFormats"
import { useDownloadedFormats } from "@/hooks/useDownloadedFormats"
import { cn } from "@/lib/utils"
import {
  useDeleteBookMutation,
  useDownloadBookMutation,
  useListStatusesQuery,
  useUpdateStatusMutation,
} from "@/store/localApi"

import { AudiobookCover } from "./AudiobookCover"
import { DownloadingIndicator } from "./DownloadingIndicator"
import { EbookCover } from "./EbookCover"
import { Stack } from "./ui/Stack"
import { Button } from "./ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./ui/context-menu"
import { Icon } from "./ui/icon"
import { ReadaloudIcon } from "./ui/icon-readaloud"
import { Text } from "./ui/text"

const DEFAULT_THUMBNAIL_WIDTH = 116
const THUMBNAIL_HEIGHT_RATIO = 176 / 116

interface Props {
  book: BookWithRelations
  width?: number
}

export function BookThumbnail({
  book,
  width = DEFAULT_THUMBNAIL_WIDTH,
}: Props) {
  const height = Math.round(width * THUMBNAIL_HEIGHT_RATIO)
  const titleFontSize = Math.max(11, Math.min(16, Math.round(width * 0.11)))
  const authorFontSize = Math.max(10, Math.min(14, Math.round(width * 0.1)))

  const insets = useSafeAreaInsets()
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  }

  const downloadedFormats = useDownloadedFormats(book)
  const availableFormats = useAvailableFormats(book)

  const audioOnly =
    !downloadedFormats.includes("ebook") &&
    !downloadedFormats.includes("readaloud")

  const [downloadBook] = useDownloadBookMutation()
  const [deleteBook] = useDeleteBookMutation()

  const { data: statuses } = useListStatusesQuery()

  const [updateStatus] = useUpdateStatusMutation()

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {/* asChild + Pressable instead of Link for Boox device compat */}
        <Link asChild href={`/book/${book.uuid}`}>
          <Pressable style={{ width }} className="overflow-visible">
            <Stack
              // should be a more elegant way to get the text a little closer
              className="relative -mb-3 flex-col justify-center"
              style={{ height, width }}
            >
              <View style={{ height, width }}>
                <BookThumbnailImage book={book} height={height} width={width} />
              </View>
            </Stack>

            <Text
              className="text-muted-foreground"
              numberOfLines={1}
              style={{ maxWidth: width, fontSize: authorFontSize }}
            >
              {book.authors[0]?.name}
            </Text>

            <Text
              className="leading-none font-semibold"
              numberOfLines={2}
              style={{ maxWidth: width, fontSize: titleFontSize }}
            >
              {book.title}
            </Text>
          </Pressable>
        </Link>
      </ContextMenuTrigger>
      <ContextMenuContent insets={contentInsets}>
        <ContextMenuItem asChild>
          <Link href={`/book/${book.uuid}`}>
            <Text>Book details</Text>
          </Link>
        </ContextMenuItem>
        <ContextMenuSeparator />
        {!!downloadedFormats.length && (
          <>
            <ContextMenuItem asChild>
              <Link
                href={{
                  pathname: audioOnly ? "/listen/[uuid]" : "/read/[uuid]",
                  params: {
                    uuid: book.uuid,
                    format: audioOnly
                      ? "audiobook"
                      : downloadedFormats.includes("readaloud")
                        ? "readaloud"
                        : "ebook",
                  },
                }}
              >
                <Text>{audioOnly ? "Play audiobook" : "Open book"}</Text>
              </Link>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Text>Reading status</Text>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {statuses
              ?.filter((status) => status.uuid !== book.status?.uuid)
              .map((status) => (
                <ContextMenuItem
                  key={status.uuid}
                  onPress={() => {
                    updateStatus({
                      bookUuid: book.uuid,
                      statusUuid: status.uuid,
                    })
                  }}
                >
                  <Text>Move to “{status.name}”</Text>
                </ContextMenuItem>
              ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Text>Downloads</Text>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {availableFormats.map((format) => (
              <ContextMenuItem
                key={format}
                onPress={() => {
                  if (downloadedFormats.includes(format)) {
                    deleteBook({
                      bookUuid: book.uuid,
                      format,
                      deleteRecord: book.serverUuid === null,
                    })
                    return
                  }
                  downloadBook({
                    bookUuid: book.uuid,
                    format: format,
                  })
                }}
                variant={
                  downloadedFormats.includes(format) ? "destructive" : "default"
                }
              >
                <Text>
                  {downloadedFormats.includes(format)
                    ? `Remove ${format}`
                    : `${format[0]?.toUpperCase()}${format.slice(1)}`}
                </Text>
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function BookThumbnailImage({
  className,
  book,
  height,
  width,
}: {
  className?: string | undefined
  book: BookWithRelations
  height: number
  width: number
}) {
  const downloadingFormat = [book.readaloud, book.ebook, book.audiobook].find(
    (format) => format?.downloadStatus === "DOWNLOADING",
  )

  const downloadedFormats = useDownloadedFormats(book)

  const hasBothCovers = book.readaloud || (book.ebook && book.audiobook)

  return (
    <View
      className={cn(
        "relative",
        !hasBothCovers && book.ebook && "items-start justify-start",
        className,
      )}
      style={{
        height,
        width,
      }}
    >
      {downloadingFormat && (
        <DownloadingIndicator
          className={"absolute z-50"}
          progress={downloadingFormat.downloadProgress}
          size={Math.ceil(height / 10)}
          style={{
            left: 0.98 * width - Math.ceil(height / 10),
            bottom: hasBothCovers ? 0.1 * height : 0.02 * height,
          }}
        />
      )}
      {(book.readaloud?.status === "ALIGNED" ||
        downloadedFormats.includes("readaloud")) && (
        <>
          <Icon
            className="text-primary absolute z-50"
            size={Math.ceil(height / 10)}
            as={ReadaloudIcon}
            style={{
              top: 0.12 * height,
              left: 0.96 * width - Math.ceil(height / 10),
            }}
          />
        </>
      )}
      <Stack
        className={cn(
          "absolute top-0 bottom-0 z-50 justify-center gap-4",
          hasBothCovers ? "right-2" : "right-1/2 translate-x-1/2",
        )}
      >
        {(downloadedFormats.includes("ebook") ||
          downloadedFormats.includes("readaloud")) && (
          <Link
            href={{
              pathname: "/read/[uuid]",
              params: {
                uuid: book.uuid,
                format: downloadedFormats.includes("readaloud")
                  ? "readaloud"
                  : "ebook",
              },
            }}
            asChild
          >
            <Button
              className="bg-background rounded-full"
              style={{
                height: height / 5,
                width: height / 5,
              }}
            >
              <Icon
                className="text-foreground"
                as={BookOpen}
                size={height / 10}
              />
            </Button>
          </Link>
        )}
        {(downloadedFormats.includes("audiobook") ||
          downloadedFormats.includes("readaloud")) && (
          <Link
            href={{
              pathname: "/listen/[uuid]",
              params: {
                uuid: book.uuid,
                format: downloadedFormats.includes("readaloud")
                  ? "readaloud"
                  : "audiobook",
              },
            }}
            asChild
          >
            <Button
              className="bg-background rounded-full"
              style={{
                height: height / 5,
                width: height / 5,
              }}
            >
              <Icon
                as={Headphones}
                className="text-foreground"
                size={height / 10}
              />
            </Button>
          </Link>
        )}
      </Stack>
      {hasBothCovers ? (
        <>
          <AudiobookCoverImage
            book={book}
            height={width}
            width={width}
            className="absolute z-10 translate-x-[10%] scale-[0.8]"
            style={{
              top: (height - width) / 2,
            }}
          />
          <EbookCoverImage
            book={book}
            height={height}
            width={width}
            className="absolute z-20 -translate-x-[10%] scale-[0.8]"
          />
        </>
      ) : book.ebook ? (
        <EbookCoverImage
          book={book}
          height={height}
          width={width}
          className="-translate-x-[10%] scale-[0.8]"
        />
      ) : (
        <AudiobookCoverImage
          book={book}
          height={width}
          width={width}
          className="relative"
          style={{
            top: (height - width) / 2,
          }}
        />
      )}
    </View>
  )
}

function EbookCoverImage({
  book,
  className,
  height,
  width,
  style,
}: {
  book: BookWithRelations
  className?: string | undefined
  height: number
  width: number
  style?: ViewStyle
}) {
  return (
    <Stack
      className={cn(
        "bg-secondary items-center justify-center overflow-hidden rounded-lg",
        className,
      )}
      style={{ height, width, ...style }}
    >
      <EbookCover book={book} />
    </Stack>
  )
}

function AudiobookCoverImage({
  book,
  className,
  height,
  width,
  style,
}: {
  book: BookWithRelations
  className?: string | undefined
  height: number
  width: number
  style?: ViewStyle
}) {
  return (
    <Stack
      className={cn(
        "bg-secondary items-center justify-center overflow-hidden rounded-lg",
        className,
      )}
      style={{ height, width, ...style }}
    >
      <AudiobookCover book={book} />
    </Stack>
  )
}
