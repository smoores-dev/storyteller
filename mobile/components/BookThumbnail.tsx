import { Link } from "expo-router"
import { BookOpen, Headphones } from "lucide-react-native"
import { View, type ViewStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { type BookWithRelations } from "@/database/books"
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

interface Props {
  book: BookWithRelations
}

export function BookThumbnail({ book }: Props) {
  const insets = useSafeAreaInsets()
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  }

  const downloadedFormats = useDownloadedFormats(book)
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
        <Link href={`/book/${book.uuid}`} className="w-[116px] shrink-0">
          <Stack className="h-[300px] gap-0.5 overflow-visible">
            <Stack className="relative mb-1 h-[176px] w-[116px] flex-col justify-center">
              <View className="block h-[176px] w-[116px]">
                <BookThumbnailImage book={book} height={176} width={116} />
              </View>
            </Stack>
            <Text
              className="max-w-[116px] text-sm font-semibold"
              numberOfLines={2}
            >
              {book.readaloud?.status === "ALIGNED" && (
                <>
                  <Icon
                    className="translate-y-[3] text-primary"
                    size={20}
                    as={ReadaloudIcon}
                  />{" "}
                </>
              )}
              {book.title}
            </Text>
            <Text
              className="max-w-[116px] pb-2 text-sm text-muted-foreground"
              numberOfLines={2}
            >
              {book.authors[0]?.name}
            </Text>
          </Stack>
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
            {book.readaloud && (
              <ContextMenuItem
                onPress={() => {
                  if (downloadedFormats.includes("readaloud")) {
                    deleteBook({
                      bookUuid: book.uuid,
                      deleteRecord: book.serverUuid === null,
                    })
                    return
                  }
                  downloadBook({
                    bookUuid: book.uuid,
                    format: "readaloud",
                  })
                }}
                variant={
                  downloadedFormats.includes("readaloud")
                    ? "destructive"
                    : "default"
                }
              >
                <Text>
                  {downloadedFormats.includes("readaloud")
                    ? "Remove readaloud"
                    : "Readaloud"}
                </Text>
              </ContextMenuItem>
            )}
            {book.ebook && (
              <ContextMenuItem
                onPress={() => {
                  if (downloadedFormats.includes("ebook")) {
                    deleteBook({
                      bookUuid: book.uuid,
                      deleteRecord: book.serverUuid === null,
                    })
                    return
                  }
                  downloadBook({ bookUuid: book.uuid, format: "ebook" })
                }}
                variant={
                  downloadedFormats.includes("ebook")
                    ? "destructive"
                    : "default"
                }
              >
                <Text>
                  {downloadedFormats.includes("ebook")
                    ? "Remove ebook"
                    : "Ebook"}
                </Text>
              </ContextMenuItem>
            )}
            {book.audiobook && (
              <ContextMenuItem
                onPress={() => {
                  if (downloadedFormats.includes("audiobook")) {
                    deleteBook({
                      bookUuid: book.uuid,
                      deleteRecord: book.serverUuid === null,
                    })
                    return
                  }
                  downloadBook({
                    bookUuid: book.uuid,
                    format: "audiobook",
                  })
                }}
                variant={
                  downloadedFormats.includes("audiobook")
                    ? "destructive"
                    : "default"
                }
              >
                <Text>
                  {downloadedFormats.includes("audiobook")
                    ? "Remove audiobook"
                    : "Audiobook"}
                </Text>
              </ContextMenuItem>
            )}
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
      className={cn("relative", className)}
      style={{
        height,
        width,
      }}
    >
      {downloadingFormat && (
        <DownloadingIndicator
          className="absolute right-2 top-2 z-50"
          progress={downloadingFormat.downloadProgress}
        />
      )}
      <Stack
        className={cn(
          "absolute bottom-0 top-0 z-50 justify-center gap-4",
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
              className="rounded-full bg-foreground"
              style={{
                height: height / 5,
                width: height / 5,
              }}
            >
              <Icon
                className="text-background"
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
              className="rounded-full bg-foreground"
              style={{
                height: height / 5,
                width: height / 5,
              }}
            >
              <Icon
                as={Headphones}
                className="text-background"
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
        <EbookCoverImage book={book} height={height} width={width} />
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
        "items-center justify-center overflow-hidden rounded-lg bg-secondary",
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
        "items-center justify-center overflow-hidden rounded-lg bg-secondary",
        className,
      )}
      style={{ height, width, ...style }}
    >
      <AudiobookCover book={book} />
    </Stack>
  )
}
