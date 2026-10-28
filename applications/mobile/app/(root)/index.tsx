import * as DocumentPicker from "expo-document-picker"
import { Link, useRouter } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { EllipsisVertical } from "lucide-react-native"
import { useEffect, useMemo, useRef } from "react"
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  type ScrollViewInstance,
  TouchableOpacity,
  View,
} from "react-native"

import { MiniPlayerWidget } from "@/components/MiniPlayerWidget"
import { Shelf } from "@/components/Shelf"
import { Group } from "@/components/ui/Group"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Menu } from "@/components/ui/menu"
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

  const scrollViewRef = useRef<ScrollViewInstance>(null)

  return (
    <View className="pt-safe flex-1 items-center gap-2 bg-transparent">
      <StatusBar verticalBarBehaviorIOS="disabled" />
      <Group className="pr-safe-or-2 pl-safe-or-4 items-center gap-2">
        <TouchableOpacity
          accessibilityLabel="Scroll to top"
          accessibilityRole="button"
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
        <Link href="/search" asChild>
          <Pressable className="grow" accessibilityLabel="Search books">
            <Input
              className="min-h-8 text-sm opacity-100"
              editable={false}
              focusable={false}
              pointerEvents="none"
              placeholder="Search"
            />
          </Pressable>
        </Link>
        <Menu
          actions={[
            {
              id: "import-book",
              title: "Import book",
              onPress: async () => {
                const uri = await pickBookFile()
                if (uri) dispatch(bookImported({ url: uri, from: "home" }))
              },
            },
            {
              id: "settings",
              title: "Settings",
              onPress: () => router.push("/settings"),
            },
          ]}
        >
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel="Open home menu"
          >
            <Icon as={EllipsisVertical} size={24} className="text-primary" />
          </Button>
        </Menu>
      </Group>
      <ScrollView
        className="pl-safe-or-6 pr-safe w-full"
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
