import { skipToken } from "@reduxjs/toolkit/query"
import { Link, useLocalSearchParams, useRouter } from "expo-router"
import {
  Book,
  ChevronLeft,
  Headphones,
  LibraryBig,
  Tag,
  Trash2,
} from "lucide-react-native"
import { Fragment } from "react"
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { IconReadaloud, ReadaloudIcon } from "@/components/ui/icon-readaloud"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Text } from "@/components/ui/text"
import { useColorTheme } from "@/hooks/useColorTheme"
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

  const hasDownload = !![book?.readaloud, book?.ebook, book?.audiobook].filter(
    (format) => format?.downloadStatus === "DOWNLOADED",
  ).length

  if (isLoading || isUninitialized) return <LoadingView />

  if (!book) return null

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
            {hasDownload && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost">
                    <Icon as={Trash2} size={24} className="text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove book from device</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove the downloaded book files from your local
                      device.
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
                          deleteBook({
                            bookUuid: uuid,
                            deleteRecord: book.serverUuid === null,
                          })
                          if (book.serverUuid === null) {
                            router.replace("/")
                          }
                        }}
                      >
                        <Text>Remove</Text>
                      </Button>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </View>
          <Stack className="items-start px-8">
            <BookThumbnailImage
              className="self-center"
              book={book}
              height={352}
              width={232}
            />
            <Text className="my-4" variant="h1">
              {book.readaloud?.status === "ALIGNED" && (
                <>
                  <Icon
                    className="translate-y-[3px] text-primary"
                    size={36}
                    as={ReadaloudIcon}
                  />{" "}
                </>
              )}
              {book.title}
            </Text>
            {book.subtitle && (
              <Text variant="h3" className="mb-4">
                {book.subtitle}
              </Text>
            )}
            <Stack className="mb-4 gap-1 pl-2">
              <Group>
                <Text className="text-muted-foreground">
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
                        <Text>{author.name}</Text>
                      </Link>
                      <Text>{index < book.authors.length - 1 && ", "}</Text>
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
                        <Text className="text-sm">{narrator.name}</Text>
                      </Link>
                      <Text className="text-sm">
                        {index < book.narrators.length - 1 && ", "}
                      </Text>
                    </Fragment>
                  ))}
                </Text>
              )}
              {book.series.map((s) => (
                <Text className="text-sm text-muted-foreground" key={s.uuid}>
                  {s.position !== null && `Book ${s.position} of `}
                  <Link
                    href={{
                      pathname: "/series/[uuid]",
                      params: {
                        uuid: s.uuid,
                      },
                    }}
                    className="active:text-primary active:underline"
                  >
                    <Text className="text-sm">{s.name}</Text>
                  </Link>
                </Text>
              ))}
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
                  <SelectTrigger>
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
                <Group className="self-end rounded-md bg-primary px-2 py-1">
                  {!!book.readaloud && (
                    <Button
                      variant="ghost"
                      className="active:bg-white/10"
                      onPress={() => {
                        downloadBook({
                          bookUuid: book.uuid,
                          format: "readaloud",
                        })
                      }}
                    >
                      <Icon
                        as={IconReadaloud}
                        className="text-white"
                        size={24}
                      />
                    </Button>
                  )}
                  {book.ebook && (
                    <Button
                      variant="ghost"
                      className="active:bg-white/10"
                      onPress={() => {
                        downloadBook({ bookUuid: book.uuid, format: "ebook" })
                      }}
                    >
                      <Icon as={Book} className="text-white" size={24} />
                    </Button>
                  )}
                  {book.audiobook && (
                    <Button
                      variant="ghost"
                      className="active:bg-white/10"
                      onPress={() => {
                        downloadBook({
                          bookUuid: book.uuid,
                          format: "audiobook",
                        })
                      }}
                    >
                      <Icon as={Headphones} className="text-white" size={24} />
                    </Button>
                  )}
                </Group>
              </Stack>
            </Group>
            {!!book.tags.length && (
              <Group className="mb-4 flex-wrap gap-2">
                {book.tags.map((tag) => (
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
                      <Icon as={Tag} size={12} />
                      <Text>{tag.name}</Text>
                    </Button>
                  </Link>
                ))}
              </Group>
            )}
            {!!book.collections.length && (
              <Group className="mb-4 gap-2">
                {book.collections.map((collection) => (
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
                      className="flex flex-row items-center gap-2 rounded px-3 py-1"
                    >
                      <Icon as={LibraryBig} size={16} />
                      <Text>{collection.name}</Text>
                    </Button>
                  </Link>
                ))}
              </Group>
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
    </View>
  )
}
