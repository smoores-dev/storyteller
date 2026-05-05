import { type HrefObject, useRouter } from "expo-router"
import { TouchableOpacity, View } from "react-native"
import { FlatList } from "react-native-gesture-handler"

import { type BookWithRelations } from "@/database/books"

import { BookThumbnail } from "./BookThumbnail"
import { Stack } from "./ui/Stack"
import { Text } from "./ui/text"

interface Props {
  label: string
  href?: string | HrefObject | undefined
  books: BookWithRelations[]
}

export function Shelf({ label, href, books }: Props) {
  const router = useRouter()

  if (!books.length) return null

  return (
    <Stack>
      <View className="flex-row items-baseline justify-between pr-3">
        <Text variant="h3" className="font-youngserif">
          {label}
        </Text>

        {href && (
          <TouchableOpacity
            onPress={() => router.push(href)}
            className="flex-row items-center"
          >
            <Text className="text-primary text-sm">
              View all ({books.length})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        horizontal
        data={books.slice(0, 25)}
        contentContainerClassName="gap-4"
        renderItem={({ item: book }) => <BookThumbnail book={book} />}
      />
    </Stack>
  )
}
