import { Link, useLocalSearchParams, useRouter } from "expo-router"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  LibraryBig,
  LibrarySquare,
  Tag,
} from "lucide-react-native"
import { Fragment, useState } from "react"
import { RefreshControl, ScrollView, View } from "react-native"

import { BackButton } from "@/components/BackButton"
import BookDescription from "@/components/BookDescription"
import { BookThumbnailImage } from "@/components/BookThumbnail"
import { LoadingView } from "@/components/LoadingView"
import { MiniPlayerWidget } from "@/components/MiniPlayerWidget"
import { ScreenBackButton } from "@/components/ScreenBackButton"
import { Group } from "@/components/ui/Group"
import { Stack } from "@/components/ui/Stack"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Menu } from "@/components/ui/menu"
import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Text } from "@/components/ui/text"
import { useAvailableFormats } from "@/hooks/useAvailableFormats"
import { useColorTheme } from "@/hooks/useColorTheme"
import { useDownloadedFormats } from "@/hooks/useDownloadedFormats"
import { useListAllServerBooks } from "@/hooks/useListAllServerBooks"
import { usesSystemHeader } from "@/lib/nativeChrome"
import {
  useCancelDownloadMutation,
  useDeleteBookMutation,
  useDownloadBookMutation,
  useGetBookQuery,
  useListStatusesQuery,
  useUpdateStatusMutation,
} from "@/store/localApi"
import { useLazyGetBookQuery as useLazyGetServerBookQuery } from "@/store/serverApi"
import type { UUID } from "@/uuid"

export default function BookDetailsScreen() {
  const router = useRouter()
  const { uuid } = useLocalSearchParams() as { uuid: UUID }
  const { foreground } = useColorTheme()

  const [downloadBook] = useDownloadBookMutation()
  const [cancelDownload] = useCancelDownloadMutation()
  const [deleteBook] = useDeleteBookMutation()
  const { data: book, isLoading, isUninitialized } = useGetBookQuery({ uuid })

  const { data: statuses } = useListStatusesQuery()

  const [updateStatus] = useUpdateStatusMutation()

  const [getServerBook, { isLoading: isServerLoading }] =
    useLazyGetServerBookQuery()

  const [showTagsMore, setShowTagsMore] = useState(false)
  const [showCollectionsMore, setShowCollectionsMore] = useState(false)
  const [pendingDeleteFormat, setPendingDeleteFormat] = useState<
    "readaloud" | "ebook" | "audiobook" | null
  >(null)

  const downloadedFormats = useDownloadedFormats(book)

  const availableFormats = useAvailableFormats(book)
  const onlyFormat = availableFormats[0]

  const { refetch } = useListAllServerBooks()

  if (isLoading || isUninitialized) return <LoadingView />

  if (!book) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text>Book not found</Text>
        <Button
          accessibilityLabel="Go back"
          onPress={() => {
            if (router.canGoBack()) {
              router.back()
            } else {
              router.replace("/")
            }
          }}
        >
          <Text>Go back</Text>
        </Button>
      </View>
    )
  }

  const numberOfTagsToShow = 6
  const tagsMoreNeeded = book.tags.length > numberOfTagsToShow
  const tagsToShow = showTagsMore
    ? book.tags
    : book.tags.slice(0, numberOfTagsToShow)
  const numTagsHidden = book.tags.length - tagsToShow.length

  const numberOfCollectionsToShow = 6
  const collectionsMoreNeeded =
    book.collections.length > numberOfCollectionsToShow
  const collectionsToShow = showCollectionsMore
    ? book.collections
    : book.collections.slice(0, numberOfCollectionsToShow)
  const numCollectionsHidden =
    book.collections.length - collectionsToShow.length

  return (
    <View className="flex-1">
      {/* Contributes header options, it does not render a view. */}
      <ScreenBackButton />
      <ScrollView
        contentInsetAdjustmentBehavior={
          usesSystemHeader ? "automatic" : "never"
        }
        refreshControl={
          book.serverUuid ? (
            <RefreshControl
              refreshing={isServerLoading}
              onRefresh={() => {
                getServerBook({
                  serverUuid: book.serverUuid!,
                  bookUuid: book.uuid,
                })
              }}
            />
          ) : undefined
        }
      >
        <Stack className={usesSystemHeader ? "" : "pt-safe"}>
          {!usesSystemHeader && (
            <View className="px-safe-or-2 flex-row justify-between">
              <BackButton />
            </View>
          )}
          <Stack className="px-safe-or-8 items-start">
            <BookThumbnailImage
              className="self-center"
              book={book}
              height={352}
              width={232}
            />
            <Text className="font-youngserif mt-4 mb-1 text-2xl" variant="h1">
              {book.title}
            </Text>
            {book.subtitle && (
              <Text className="mb-4 text-base italic">{book.subtitle}</Text>
            )}
            <Stack className="mb-4 gap-1 pl-0">
              <Group>
                <Text className="text-muted-foreground text-sm">
                  by{" "}
                  {book.authors.map((author, index) => (
                    <Fragment key={author.uuid}>
                      <Link
                        href={{
                          pathname: "/author/[uuid]",
                          params: {
                            uuid: author.uuid,
                          },
                        }}
                        className="active:text-primary active:underline"
                      >
                        <Text className="text-primary text-sm">
                          {author.name}
                        </Text>
                      </Link>
                      <Text className="text-sm">
                        {index < book.authors.length - 1 && ", "}
                      </Text>
                    </Fragment>
                  ))}
                </Text>
              </Group>
              {!!book.narrators.length && (
                <Text className="text-muted-foreground text-sm">
                  narrated by{" "}
                  {book.narrators.map((narrator, index) => (
                    <Fragment key={narrator.uuid}>
                      <Link
                        href={{
                          pathname: "/narrator/[uuid]",
                          params: {
                            uuid: narrator.uuid,
                          },
                        }}
                        className="active:text-primary active:underline"
                      >
                        <Text className="text-primary text-sm">
                          {narrator.name}
                        </Text>
                      </Link>
                      <Text className="text-sm">
                        {index < book.narrators.length - 1 && ", "}
                      </Text>
                    </Fragment>
                  ))}
                </Text>
              )}
            </Stack>
            <Group className="mb-4 items-center justify-between self-stretch">
              {book.status && (
                <Select
                  value={{
                    value: book.status.uuid,
                    label: book.status.name,
                  }}
                  onValueChange={(option) => {
                    if (!option) return
                    updateStatus({
                      bookUuid: book.uuid,
                      statusUuid: option.value as UUID,
                    })
                  }}
                >
                  <SelectTrigger
                    accessibilityLabel={`Reading status, ${book.status.name}`}
                  >
                    <SelectValue placeholder="" />
                  </SelectTrigger>
                  {statuses?.map((status) => (
                    <SelectItem
                      key={status.uuid}
                      label={status.name}
                      value={status.uuid}
                    />
                  ))}
                </Select>
              )}
              <Stack className="gap-1">
                <Group className="self-end rounded-md px-2 py-[0.05rem]">
                  {availableFormats.length > 1 ? (
                    <Menu
                      actions={availableFormats.map((format) => {
                        const status = book[format]?.downloadStatus
                        const isActiveDownload =
                          status === "DOWNLOADING" || status === "QUEUED"
                        const isDownloaded = downloadedFormats.includes(format)
                        const unavailable =
                          format !== "readaloud" &&
                          downloadedFormats.includes("readaloud")
                        const label = isDownloaded
                          ? `Remove ${format}`
                          : isActiveDownload
                            ? `Cancel ${format} download`
                            : `Download ${format}`

                        return {
                          id: `download-${format}`,
                          title: label,
                          ...(isDownloaded
                            ? { attributes: { destructive: true } }
                            : unavailable
                              ? { attributes: { disabled: true } }
                              : {}),
                          onPress: () => {
                            if (unavailable) return

                            if (isActiveDownload) {
                              cancelDownload({
                                bookUuid: book.uuid,
                                format,
                              })
                              return
                            }

                            if (isDownloaded) {
                              setPendingDeleteFormat(format)
                              return
                            }
                            downloadBook({
                              bookUuid: book.uuid,
                              format,
                            })
                          },
                        }
                      })}
                    >
                      <Button
                        variant="outline"
                        className="border-primary dark:border-primary"
                        accessibilityLabel="Open download options"
                      >
                        <Text className="text-primary">Downloads</Text>
                        <Icon
                          as={ChevronDown}
                          size={16}
                          className="text-primary"
                        />
                      </Button>
                    </Menu>
                  ) : (
                    onlyFormat && (
                      <>
                        <Button
                          variant="outline"
                          accessibilityLabel={
                            book[onlyFormat]?.downloadStatus === "DOWNLOADED"
                              ? `Remove ${onlyFormat}`
                              : book[onlyFormat]?.downloadStatus ===
                                    "DOWNLOADING" ||
                                  book[onlyFormat]?.downloadStatus === "QUEUED"
                                ? `Cancel ${onlyFormat} download`
                                : `Download ${onlyFormat}`
                          }
                          className={
                            book[onlyFormat]?.downloadStatus === "DOWNLOADED" ||
                            book[onlyFormat]?.downloadStatus ===
                              "DOWNLOADING" ||
                            book[onlyFormat]?.downloadStatus === "QUEUED"
                              ? "border-destructive dark:border-destructive"
                              : "border-primary dark:border-primary"
                          }
                          onPress={() => {
                            const status = book[onlyFormat]?.downloadStatus
                            if (
                              status === "DOWNLOADING" ||
                              status === "QUEUED"
                            ) {
                              cancelDownload({
                                bookUuid: book.uuid,
                                format: onlyFormat,
                              })
                              return
                            }

                            if (status === "DOWNLOADED") {
                              setPendingDeleteFormat(onlyFormat)
                              return
                            }

                            downloadBook({
                              bookUuid: book.uuid,
                              format: onlyFormat,
                            })
                          }}
                        >
                          <Text
                            className={
                              book[onlyFormat]?.downloadStatus ===
                                "DOWNLOADED" ||
                              book[onlyFormat]?.downloadStatus ===
                                "DOWNLOADING" ||
                              book[onlyFormat]?.downloadStatus === "QUEUED"
                                ? "text-destructive"
                                : "text-primary"
                            }
                          >
                            {book[onlyFormat]?.downloadStatus === "DOWNLOADED"
                              ? `Remove ${onlyFormat}`
                              : book[onlyFormat]?.downloadStatus ===
                                    "DOWNLOADING" ||
                                  book[onlyFormat]?.downloadStatus === "QUEUED"
                                ? "Cancel download"
                                : `Download ${onlyFormat}`}
                          </Text>
                          {(book[onlyFormat]?.downloadStatus ===
                            "DOWNLOADING" ||
                            book[onlyFormat]?.downloadStatus === "QUEUED") && (
                            <Icon
                              as={CircleX}
                              size={16}
                              className="text-destructive"
                            />
                          )}
                        </Button>
                      </>
                    )
                  )}
                </Group>
              </Stack>
            </Group>
            {!!book.series.length && (
              <>
                <Group className="mb-2 flex-row items-center gap-1">
                  <Icon
                    as={LibrarySquare}
                    size={16}
                    className="text-muted-foreground"
                  />
                  <Text className="text-muted-foreground text-sm">Series</Text>
                </Group>
                <Group className="flex-stretch mb-4 flex-wrap">
                  {book.series.map((series) => (
                    <Link
                      href={{
                        pathname: "/series/[uuid]",
                        params: { uuid: series.uuid },
                      }}
                      key={series.uuid}
                      asChild
                      className="w-full justify-start"
                    >
                      <Button
                        accessibilityLabel={`Open series ${series.name}, book ${series.position}`}
                        variant="link"
                        className="y-0 mt-[-5px] flex flex-row items-center gap-1 px-0"
                      >
                        <Text className="text-primary">{series.name}</Text>
                        <Text className="text-muted-foreground font-normal">
                          #{series.position}
                        </Text>
                      </Button>
                    </Link>
                  ))}
                </Group>
              </>
            )}
            {!!book.tags.length && (
              <>
                <Group className="mb-2 flex-row items-center gap-1">
                  <Icon as={Tag} size={16} className="text-muted-foreground" />
                  <Text className="text-muted-foreground text-sm">Tags</Text>
                </Group>
                <Group className="mb-4 flex-wrap gap-2">
                  {tagsToShow.map((tag) => (
                    <Link
                      href={{
                        pathname: "/tag/[uuid]",
                        params: {
                          uuid: tag.uuid,
                        },
                      }}
                      key={tag.uuid}
                      asChild
                    >
                      <Button
                        accessibilityLabel={`Open tag ${tag.name}`}
                        variant="secondary"
                        size="sm"
                        className="flex flex-row items-center gap-2 rounded-full px-3"
                      >
                        {/* <Icon as={Tag} size={12} /> */}
                        <Text>{tag.name}</Text>
                      </Button>
                    </Link>
                  ))}
                  {tagsMoreNeeded && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex flex-row items-center gap-2 rounded-full px-3"
                      accessibilityLabel={
                        showTagsMore
                          ? "Show fewer tags"
                          : `Show ${numTagsHidden} more tags`
                      }
                      onPress={() => {
                        setShowTagsMore(!showTagsMore)
                      }}
                    >
                      <Icon
                        as={showTagsMore ? ChevronLeft : ChevronRight}
                        size={12}
                      />
                      <Text>
                        {showTagsMore ? "Less" : "More (" + numTagsHidden + ")"}
                      </Text>
                    </Button>
                  )}
                </Group>
              </>
            )}
            {!!book.collections.length && (
              <>
                <Group className="mb-2 flex-row items-center gap-1">
                  <Icon
                    as={LibraryBig}
                    size={16}
                    className="text-muted-foreground"
                  />
                  <Text className="text-muted-foreground text-sm">
                    Collections
                  </Text>
                </Group>
                <Group className="flex-stretch mb-4 flex-wrap gap-2">
                  {collectionsToShow.map((collection) => (
                    <Link
                      href={{
                        pathname: `/collection/[uuid]`,
                        params: { uuid: collection.uuid },
                      }}
                      key={collection.uuid}
                      asChild
                    >
                      <Button
                        accessibilityLabel={`Open collection ${collection.name}`}
                        variant="secondary"
                        className="flex flex-row items-center gap-2 rounded-md px-4 py-0"
                      >
                        <Text>{collection.name}</Text>
                      </Button>
                    </Link>
                  ))}
                  {collectionsMoreNeeded && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex flex-row items-center gap-2 rounded-full px-3"
                      accessibilityLabel={
                        showCollectionsMore
                          ? "Show fewer collections"
                          : `Show ${numCollectionsHidden} more collections`
                      }
                      onPress={() => {
                        setShowCollectionsMore(!showCollectionsMore)
                      }}
                    >
                      <Icon
                        as={showCollectionsMore ? ChevronLeft : ChevronRight}
                        size={12}
                      />
                      <Text>
                        {showCollectionsMore
                          ? "Less"
                          : "More (" + numCollectionsHidden + ")"}
                      </Text>
                    </Button>
                  )}
                </Group>
              </>
            )}
          </Stack>
          <View className="pb-safe px-safe-or-8">
            <BookDescription
              description={book.description}
              textColor={foreground}
              dom={{ matchContents: true }}
            />
          </View>
        </Stack>
        {/* Spacer for the miniplayer */}
        <View className="h-40 w-full" />
      </ScrollView>
      <MiniPlayerWidget />
      <AlertDialog
        open={pendingDeleteFormat !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteFormat(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {pendingDeleteFormat} from device
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the downloaded {pendingDeleteFormat} files from
              your local device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>Cancel</Text>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                accessibilityLabel={`Remove ${pendingDeleteFormat} from device`}
                onPress={() => {
                  if (!pendingDeleteFormat) return
                  deleteBook({
                    bookUuid: book.uuid,
                    format: pendingDeleteFormat,
                    deleteRecord: book.serverUuid === null,
                  }).then(() => {
                    // move back to main screen
                    router.replace("/")

                    refetch()
                  })
                  setPendingDeleteFormat(null)
                }}
              >
                <Text>Remove</Text>
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  )
}
