import { useRouter } from "expo-router"
import { ChevronLeft } from "lucide-react-native"
import {
  FlatList,
  RefreshControl,
  View,
  useWindowDimensions,
} from "react-native"

import { type BookWithRelations } from "@/database/books"
import { useListAllServerBooks } from "@/hooks/useListAllServerBooks"
import { cn } from "@/lib/utils"

import { BookThumbnail } from "./BookThumbnail"
import { MiniPlayerWidget } from "./MiniPlayerWidget"
import { Stack } from "./ui/Stack"
import { Button } from "./ui/button"
import { Icon } from "./ui/icon"
import { Text } from "./ui/text"

interface Props {
  title: string
  books: BookWithRelations[]
}

export function BookGrid({ title, books }: Props) {
  const router = useRouter()
  const dimensions = useWindowDimensions()

  const { isLoading, refetch } = useListAllServerBooks()

  const padding = 16
  const minGap = 8
  const thumbnailWidthPlusMinGap = 116 + 8
  const numColumns = Math.floor(
    (dimensions.width - padding - minGap) / thumbnailWidthPlusMinGap,
  )

  const maxGap = 32
  const gap =
    (dimensions.width - padding - numColumns * thumbnailWidthPlusMinGap) /
    (numColumns + 1)

  return (
    <Stack
      className={cn(
        "pt-safe h-screen-safe flex-1",
        books.length < numColumns ? "items-start" : "items-stretch",
      )}
    >
      <View className="flex-row items-center justify-start gap-4 self-start">
        <Button
          variant="ghost"
          size="icon"
          onPress={() => {
            router.back()
          }}
        >
          <Icon as={ChevronLeft} size={24} />
        </Button>
        <Text className="my-4" variant="h2">
          {title}
        </Text>
      </View>
      <Text className="self-start pl-14 text-sm text-muted-foreground">
        {books.length} books
      </Text>
      <FlatList
        key={numColumns}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              refetch()
            }}
          />
        }
        className="px-4"
        numColumns={numColumns}
        data={books}
        columnWrapperStyle={{
          gap: Math.min(gap, maxGap),
          justifyContent: "space-around",
        }}
        renderItem={({ item: book }) => (
          <View className="my-2">
            {book ? (
              <BookThumbnail book={book} />
            ) : (
              <View className="w-[116px]" />
            )}
          </View>
        )}
        ListFooterComponent={<View className="h-40 w-full" />}
      />
      <MiniPlayerWidget />
    </Stack>
  )
}
