import * as DocumentPicker from "expo-document-picker"
import { Link, useRouter } from "expo-router"
import { EllipsisVertical, FileUp, Settings } from "lucide-react-native"
import { useEffect, useMemo, useRef } from "react"
import {
  Image,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native"

import { BookSearch } from "@/components/BookSearch"
import { MiniPlayerWidget } from "@/components/MiniPlayerWidget"
import { Shelf } from "@/components/Shelf"
import { Group } from "@/components/ui/Group"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { type BookWithRelations } from "@/database/books"
import { type Collection } from "@/database/collections"
import { useIsFocused } from "@/hooks/useIsFocused"
import { useListAllServerBooks } from "@/hooks/useListAllServerBooks"
import { bookImported } from "@/store/actions"
import { useAppDispatch } from "@/store/appState"
import {
  useListBooksQuery as useListLocalBooksQuery,
  useListCollectionsQuery,
} from "@/store/localApi"

import {
  filterCurrentlyReading,
  filterNextUp,
  filterRecentlyAdded,
  filterStartReading,
} from "./shelf/[type]"

const EMPTY_BOOKS: BookWithRelations[] = []
const EMPTY_COLLECTIONS: Collection[] = []

async function pickBookFile() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/epub+zip", "application/epub"],
    copyToCacheDirectory: true,
  })

  if (result.canceled || !result.assets[0]) return null

  return result.assets[0].uri
}

export default function Home() {
  const router = useRouter()
  const dispatch = useAppDispatch()

  const { isLoading, refetch } = useListAllServerBooks()
  const { data: liveBooks = EMPTY_BOOKS } = useListLocalBooksQuery()
  const { data: collections = EMPTY_COLLECTIONS } = useListCollectionsQuery()

  const staleBooksRef = useRef<BookWithRelations[]>(liveBooks)

  const isFocused = useIsFocused()
  const books = isFocused ? liveBooks : staleBooksRef.current

  useEffect(() => {
    if (isFocused) {
      staleBooksRef.current = liveBooks
    }
  }, [isFocused, liveBooks])

  const onDevice = useMemo(() => {
    return books
      .filter(
        (book) =>
          book.audiobook?.downloadStatus === "DOWNLOADED" ||
          book.ebook?.downloadStatus === "DOWNLOADED" ||
          book.readaloud?.downloadStatus === "DOWNLOADED",
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).valueOf() - new Date(a.createdAt).valueOf(),
      )
  }, [books])

  const currentlyReading = useMemo(() => {
    return filterCurrentlyReading(books)
  }, [books])

  const nextUp = useMemo(() => filterNextUp(books), [books])

  const startReading = useMemo(() => filterStartReading(books), [books])

  const recentlyAdded = useMemo(() => filterRecentlyAdded(books), [books])

  const booksByCollection = useMemo(
    () =>
      Object.fromEntries(
        collections.map((collection) => [
          collection.uuid,
          books
            .filter((book) =>
              book.collections.some((c) => c.uuid === collection.uuid),
            )
            .sort(
              (a, b) =>
                new Date(b.createdAt).valueOf() -
                new Date(a.createdAt).valueOf(),
            ),
        ]),
      ),
    [books, collections],
  )

  const scrollViewRef = useRef<ScrollView>(null)

  return (
    <View className="pt-safe flex-1 items-center gap-2 bg-transparent">
      <Group className="items-center gap-2 pr-2 pl-4">
        <TouchableOpacity
          onPress={() => {
            scrollViewRef.current?.scrollTo({ y: 0, animated: true })
          }}
        >
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            source={require("../../assets/Storyteller_Logo.png")}
            className="h-12 w-12"
          />
        </TouchableOpacity>
        <BookSearch />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <Icon as={EllipsisVertical} size={24} className="text-primary" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onPress={async () => {
                const uri = await pickBookFile()
                if (uri) dispatch(bookImported({ url: uri, from: "home" }))
              }}
            >
              <Icon as={FileUp} size={18} className="text-foreground" />
              <Text>Import book</Text>
            </DropdownMenuItem>

            <DropdownMenuItem onPress={() => router.push("/settings")}>
              <Icon as={Settings} size={18} className="text-foreground" />
              <Text>Settings</Text>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Group>
      <ScrollView
        className="w-full pl-6"
        contentContainerClassName="gap-4"
        ref={scrollViewRef}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              refetch()
            }}
          />
        }
      >
        <Shelf
          label="On this device"
          books={onDevice}
          href={{ pathname: "/shelf/[type]", params: { type: "on-device" } }}
        />
        <Shelf
          label="Currently reading"
          books={currentlyReading}
          href={{
            pathname: "/shelf/[type]",
            params: { type: "currently-reading" },
          }}
        />
        <Shelf
          label="Next up"
          books={nextUp}
          href={{ pathname: "/shelf/[type]", params: { type: "next-up" } }}
        />
        <Shelf
          label="Start reading"
          books={startReading}
          href={{
            pathname: "/shelf/[type]",
            params: { type: "start-reading" },
          }}
        />
        <Shelf
          label="Recently added"
          books={recentlyAdded}
          href={{
            pathname: "/shelf/[type]",
            params: { type: "recently-added" },
          }}
        />
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
          <View className="bg-border mr-5 gap-4 rounded p-4">
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
