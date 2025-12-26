import { type HrefObject, Link } from "expo-router"
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
  if (!books.length) return null

  return (
    <Stack>
      <Text variant="h3">
        {href ? (
          <Link className="underline active:decoration-primary" href={href}>
            {label}
          </Link>
        ) : (
          label
        )}
      </Text>
      <FlatList
        horizontal
        data={books}
        contentContainerClassName="gap-4"
        renderItem={({ item: book }) => <BookThumbnail book={book} />}
      />
    </Stack>
  )
}
