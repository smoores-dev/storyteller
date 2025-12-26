import { Link } from "expo-router"
import { Settings } from "lucide-react-native"
import { useMemo } from "react"
import { Image, RefreshControl, ScrollView, View } from "react-native"

import { BookSearch } from "@/components/BookSearch"
import { MiniPlayerWidget } from "@/components/MiniPlayerWidget"
import { Shelf } from "@/components/Shelf"
import { Group } from "@/components/ui/Group"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { type BookWithRelations } from "@/database/books"
import { type Collection } from "@/database/collections"
import { useListAllServerBooks } from "@/hooks/useListAllServerBooks"
import {
  useListBooksQuery as useListLocalBooksQuery,
  useListCollectionsQuery,
} from "@/store/localApi"
import { type UUID } from "@/uuid"

const EMPTY_BOOKS: BookWithRelations[] = []
const EMPTY_COLLECTIONS: Collection[] = []

export default function Home() {
  const { isLoading, refetch } = useListAllServerBooks()
  const { data: books = EMPTY_BOOKS } = useListLocalBooksQuery()
  const { data: collections = EMPTY_COLLECTIONS } = useListCollectionsQuery()

  const onDevice = useMemo(() => {
    return (
      books.filter(
        (book) =>
          book.audiobook?.downloadStatus === "DOWNLOADED" ||
          book.ebook?.downloadStatus === "DOWNLOADED" ||
          book.readaloud?.downloadStatus === "DOWNLOADED",
      ) ?? []
    )
  }, [books])

  const currentlyReading = useMemo(() => {
    return (
      books
        .filter((book) => book.status?.name === "Reading")
        .sort(
          (a, b) => (b.position?.timestamp ?? 0) - (a.position?.timestamp ?? 0),
        ) ?? []
    )
  }, [books])

  const nextUp = useMemo(() => {
    const latestReadInSeries = new Map<UUID, BookWithRelations>()
    const resultSet = new Set<UUID>()
    for (const book of books) {
      if (!book.series.length) continue

      const series = book.series
      for (const s of series) {
        const latestRead = latestReadInSeries.get(s.uuid)
        if (!latestRead) {
          if (book.status?.name === "Read") {
            latestReadInSeries.set(s.uuid, book)
            continue
          } else {
            continue
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const latestSeriesPos = latestRead.series.find(
          (ls) => ls.uuid === s.uuid,
        )!.position
        if ((latestSeriesPos ?? 0) < (s.position ?? 0)) {
          if (book.status?.name === "Read") {
            latestReadInSeries.set(s.uuid, book)
          } else if (!resultSet.has(book.uuid)) {
            resultSet.add(book.uuid)
          }
        }
      }
    }

    return books
      .filter((book) => resultSet.has(book.uuid))
      .sort((a, b) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const latestA = a.series
          .map((s) => latestReadInSeries.get(s.uuid))
          .filter((book) => !!book)[0]!
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const latestB = b.series
          .map((s) => latestReadInSeries.get(s.uuid))
          .filter((book) => !!book)[0]!

        return (
          (latestB.position?.timestamp ?? 0) -
          (latestA.position?.timestamp ?? 0)
        )
      })
  }, [books])

  const startReading = useMemo(() => {
    return books
      .filter((book) => book.status?.name === "To read")
      .sort(
        (a, b) =>
          new Date(b.createdAt).valueOf() - new Date(a.createdAt).valueOf(),
      )
  }, [books])

  const recentlyAdded = useMemo(() => {
    return books
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).valueOf() - new Date(a.createdAt).valueOf(),
      )
  }, [books])

  const booksByCollection = useMemo(
    () =>
      Object.fromEntries(
        collections.map((collection) => [
          collection.uuid,
          books.filter((book) =>
            book.collections.some((c) => c.uuid === collection.uuid),
          ),
        ]),
      ),
    [books, collections],
  )

  return (
    <View className="pt-safe flex-1 items-center gap-4 bg-transparent">
      <Group className="items-center gap-2 px-2">
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require("../../assets/Storyteller_Logo.png")}
          className="h-16 w-16"
        />
        <BookSearch />
        <Link href="/settings" asChild>
          <Button variant="ghost" size="icon">
            <Icon as={Settings} size={24} className="text-primary" />
          </Button>
        </Link>
      </Group>
      <ScrollView
        className="w-full pl-6"
        contentContainerClassName="gap-4"
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              refetch()
            }}
          />
        }
      >
        <Shelf label="On this device" books={onDevice} />
        <Shelf label="Currently reading" books={currentlyReading} />
        <Shelf label="Next up" books={nextUp} />
        <Shelf label="Start reading" books={startReading} />
        <Shelf label="Recently added" books={recentlyAdded} />
        {collections.map((collection) => (
          <Shelf
            key={collection.uuid}
            label={collection.name}
            books={booksByCollection[collection.uuid] ?? []}
            href={{
              pathname: "/collection/[uuid]",
              params: {
                uuid: collection.uuid,
              },
            }}
          />
        ))}
        {books.length === 0 && (
          <View className="mr-5 gap-4 rounded bg-border p-4">
            <Text>You don’t have any books available, yet!</Text>
            <Text>
              You can{" "}
              <Link href="/server">
                <Text className="text-link">
                  connect to a Storyteller instance
                </Text>
              </Link>{" "}
              to download some.
            </Text>
          </View>
        )}
        {/* Spacer for the miniplayer */}
        <View className="h-40 w-full" />
      </ScrollView>
      <MiniPlayerWidget />
    </View>
  )
}
