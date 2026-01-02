import { skipToken } from "@reduxjs/toolkit/query"
import { Link, useLocalSearchParams, useRouter } from "expo-router"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LibraryBig,
  LibrarySquare,
  Tag,
} from "lucide-react-native"
import { Fragment, useState } from "react"
import { RefreshControl, ScrollView, View } from "react-native"

import BookDescription from "@/components/BookDescription"
import { BookThumbnailImage } from "@/components/BookThumbnail"
import { LoadingView } from "@/components/LoadingView"
import { MiniPlayerWidget } from "@/components/MiniPlayerWidget"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Text } from "@/components/ui/text"
import { useAvailableFormats } from "@/hooks/useAvailableFormats"
import { useColorTheme } from "@/hooks/useColorTheme"
import { useDownloadedFormats } from "@/hooks/useDownloadedFormats"
import {
  useDeleteBookMutation,
  useDownloadBookMutation,
  useGetBookQuery,
  useListStatusesQuery,
  useUpdateStatusMutation,
} from "@/store/localApi"
import { useGetBookQuery as useGetServerBookQuery } from "@/store/serverApi"
import { type UUID } from "@/uuid"

export default function BookDetailsScreen() {
  const router = useRouter()
  const { uuid } = useLocalSearchParams() as { uuid: UUID }
  const { foreground } = useColorTheme()

  const [downloadBook] = useDownloadBookMutation()
  const [deleteBook] = useDeleteBookMutation()
  const { data: book, isLoading, isUninitialized } = useGetBookQuery({ uuid })

  const { data: statuses } = useListStatusesQuery()

  const [updateStatus] = useUpdateStatusMutation()

  const { isLoading: isServerLoading, refetch } = useGetServerBookQuery(
    book?.serverUuid
      ? { serverUuid: book.serverUuid, bookUuid: book.uuid }
      : skipToken,
  )

  const [showTagsMore, setShowTagsMore] = useState(false)
  const [showCollectionsMore, setShowCollectionsMore] = useState(false)
  const [pendingDeleteFormat, setPendingDeleteFormat] = useState<
    "readaloud" | "ebook" | "audiobook" | null
  >(null)

  const downloadedFormats = useDownloadedFormats(book)

  const availableFormats = useAvailableFormats(book)
  const onlyFormat = availableFormats[0]

  if (isLoading || isUninitialized) return <LoadingView />

  if (!book) return null

  let numberOfVersions = 0
  if (book.readaloud) numberOfVersions++
  if (book.ebook) numberOfVersions++
  if (book.audiobook) numberOfVersions++

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
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={isServerLoading}
            onRefresh={() => {
              refetch()
            }}
          />
        }
      >
        <Stack className="pt-safe">
          <View className="flex-row justify-between">
            <Button
              variant="ghost"
              size="icon"
              onPress={() => {
                router.back()
              }}
            >
              <Icon as={ChevronLeft} size={24} />
            </Button>
          </View>
          <Stack className="items-start px-8">
            <BookThumbnailImage
              className="self-center"
              book={book}
              height={352}
              width={232}
            />
            <Text className="mb-1 mt-4 text-2xl" variant="h1">
              {book.title}
            </Text>
            {book.subtitle && (
              <Text className="mb-4 text-base italic">{book.subtitle}</Text>
            )}
            <Stack className="mb-4 gap-1 pl-0">
              <Group>
                <Text className="text-sm text-muted-foreground">
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
                        <Text className="text-sm text-brand">
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
                <Text className="text-sm text-muted-foreground">
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
                        <Text className="text-sm text-brand">
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
                  <SelectTrigger className="">
                    <SelectValue placeholder="" />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses?.map((status) => (
                      <SelectItem
                        key={status.uuid}
                        label={status.name}
                        value={status.uuid}
                      />
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Stack className="gap-1">
                <Group className="self-end rounded-md px-2 py-[0.05rem]">
                  {numberOfVersions > 1 ? (
                    <>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="border-primary">
                            <Text className="text-primary">Downloads</Text>
                            <Icon
                              as={ChevronDown}
                              size={16}
                              className="text-primary"
                            />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {availableFormats.map((format) => (
                            <DropdownMenuItem
                              key={format}
                              onPress={() => {
                                if (downloadedFormats.includes(format)) {
                                  setPendingDeleteFormat(format)
                                  return
                                }
                                downloadBook({
                                  bookUuid: book.uuid,
                                  format: format,
                                })
                              }}
                              variant={
                                downloadedFormats.includes(format)
                                  ? "destructive"
                                  : "default"
                              }
                              className={
                                book[format]?.downloadStatus === "DOWNLOADED" ||
                                book[format]?.downloadStatus === "DOWNLOADING"
                                  ? "border-destructive"
                                  : "border-primary"
                              }
                              disabled={
                                book[format]?.downloadStatus === "DOWNLOADING"
                              }
                            >
                              <Text>
                                {downloadedFormats.includes(format)
                                  ? `Remove ${format}`
                                  : `${format[0]?.toUpperCase()}${format.slice(1)}`}
                              </Text>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  ) : (
                    onlyFormat && (
                      <>
                        <Button
                          variant="outline"
                          className={
                            book[onlyFormat]?.downloadStatus === "DOWNLOADED" ||
                            book[onlyFormat]?.downloadStatus === "DOWNLOADING"
                              ? "border-destructive"
                              : "border-primary"
                          }
                          disabled={
                            book[onlyFormat]?.downloadStatus === "DOWNLOADING"
                          }
                          onPress={() => {
                            if (
                              book[onlyFormat]?.downloadStatus === "DOWNLOADED"
                            ) {
                              setPendingDeleteFormat(onlyFormat)
                            } else {
                              downloadBook({
                                bookUuid: book.uuid,
                                format: onlyFormat,
                              })
                            }
                          }}
                        >
                          <Text
                            className={
                              book[onlyFormat]?.downloadStatus ===
                                "DOWNLOADED" ||
                              book[onlyFormat]?.downloadStatus === "DOWNLOADING"
                                ? "text-destructive"
                                : "text-primary"
                            }
                          >
                            {book[onlyFormat]?.downloadStatus === "DOWNLOADED"
                              ? `Remove ${onlyFormat}`
                              : book[onlyFormat]?.downloadStatus ===
                                  "DOWNLOADING"
                                ? "Downloading..."
                                : `Download ${onlyFormat}`}
                          </Text>
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
                  <Text className="text-sm text-muted-foreground">Series</Text>
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
                        variant="link"
                        className="y-0 mt-[-5px] flex flex-row items-center gap-1 px-0"
                      >
                        <Text className="text-brand">{series.name}</Text>
                        <Text className="font-normal text-muted-foreground">
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
                  <Text className="text-sm text-muted-foreground">Tags</Text>
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
                  <Text className="text-sm text-muted-foreground">
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
          <View className="pb-safe px-8">
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
                onPress={() => {
                  if (!pendingDeleteFormat) return
                  deleteBook({
                    bookUuid: book.uuid,
                    format: pendingDeleteFormat,
                    deleteRecord: book.serverUuid === null,
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
