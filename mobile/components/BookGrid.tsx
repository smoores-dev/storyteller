import {
  FlatList,
  RefreshControl,
  View,
  useWindowDimensions,
} from "react-native"

import { type BookWithRelations } from "@/database/books"
import { useListAllServerBooks } from "@/hooks/useListAllServerBooks"

import { BackButton } from "./BackButton"
import { BookThumbnail } from "./BookThumbnail"
import { MiniPlayerWidget } from "./MiniPlayerWidget"
import { Stack } from "./ui/Stack"
import { Text } from "./ui/text"

interface Props {
  title: string
  books: BookWithRelations[]
}

export function BookGrid({ title, books }: Props) {
  const dimensions = useWindowDimensions()

  const { isLoading, refetch } = useListAllServerBooks()

  const horizontalPadding = 32
  const gap = 12
  const minThumbnailWidth = 150

  const numColumns = Math.max(
    1,
    Math.floor(
      (dimensions.width - horizontalPadding + gap) / (minThumbnailWidth + gap),
    ),
  )

  const thumbnailWidth = Math.floor(
    (dimensions.width - horizontalPadding - (numColumns - 1) * gap) /
      numColumns,
  )

  return (
    <Stack className="pt-safe flex-1 items-stretch">
      <View className="w-full flex-row items-center justify-start gap-2 self-start px-2">
        <BackButton />

        <Text className="font-youngserif my-2" variant="h3">
          {title}
        </Text>

        <Text className="text-muted-foreground mr-4 ml-auto text-sm">
          {books.length} books
        </Text>
      </View>

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
        data={books}
        numColumns={numColumns}
        {...(numColumns > 1 && { columnWrapperStyle: { gap } })}
        renderItem={({ item: book }) => (
          <View className="my-2" style={{ width: thumbnailWidth }}>
            <BookThumbnail book={book} width={thumbnailWidth} />
          </View>
        )}
        ListFooterComponent={<View className="h-40 w-full" />}
      />
      <MiniPlayerWidget />
    </Stack>
  )
}
