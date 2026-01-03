import { type TriggerRef } from "@rn-primitives/dropdown-menu"
import { Link } from "expo-router"
import { useMemo, useRef, useState } from "react"
import { FlatList } from "react-native-gesture-handler"

import { type BookWithRelations } from "@/database/books"
import { useListBooksQuery } from "@/store/localApi"

import { BookThumbnailImage } from "./BookThumbnail"
import { Group } from "./ui/Group"
import { Stack } from "./ui/Stack"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Input } from "./ui/input"
import { Text } from "./ui/text"

const EMPTY_BOOKS: BookWithRelations[] = []

export function BookSearch() {
  const triggerRef = useRef<TriggerRef | null>(null)
  const [query, setQuery] = useState("")

  const { data: books = EMPTY_BOOKS } = useListBooksQuery()

  const [width, setWidth] = useState(0)

  const filteredBooks = useMemo(() => {
    const terms = query
      .split(/\s+/)
      .map((t) =>
        t.toLocaleLowerCase().replaceAll(/[.,/#!$%^&*;:{}=\-_`~()'"]/g, ""),
      )
      .filter((term) => !!term)

    return books
      .map((book) => {
        const titleScores = terms.map((term) =>
          book.title
            .toLocaleLowerCase()
            .split(/\s+/)
            .filter((t) => !!t)
            .map((t) => t.replaceAll(/[.,/#!$%^&*;:{}=\-_`~()'"]/g, ""))
            .reduce(
              (acc, t) =>
                t === term
                  ? acc + 1
                  : t.includes(term)
                    ? acc + term.length / t.length
                    : acc,
              0,
            ),
        )

        const titleScore =
          !titleScores.length || titleScores.includes(0)
            ? 0
            : titleScores.reduce((acc, s) => acc + s)

        const authorsScores = terms.map((term) =>
          book.authors.reduce(
            (acc, a) =>
              a.name
                .toLocaleLowerCase()
                .split(/\s+/)
                .filter((term) => !!term)
                .reduce(
                  (acc, t) =>
                    t === term
                      ? acc + 1
                      : t.includes(term)
                        ? acc + term.length / t.length
                        : acc,
                  0,
                ) + acc,
            0,
          ),
        )

        const authorsScore =
          !authorsScores.length || authorsScores.includes(0)
            ? 0
            : authorsScores.reduce((acc, s) => acc + s)

        const seriesScores = terms.map((term) =>
          book.series.reduce(
            (acc, s) =>
              s.name
                .toLocaleLowerCase()
                .split(/\s+/)
                .filter((term) => !!term)
                .reduce(
                  (acc, t) =>
                    t === term
                      ? acc + 1
                      : t.includes(term)
                        ? acc + term.length / t.length
                        : acc,
                  0,
                ) + acc,
            0,
          ),
        )

        const seriesScore =
          !seriesScores.length || seriesScores.includes(0)
            ? 0
            : seriesScores.reduce((acc, s) => acc + s)

        const tagsScores = terms.map((term) =>
          book.tags.reduce(
            (acc, a) =>
              a.name
                .toLocaleLowerCase()
                .split(/\s+/)
                .filter((term) => !!term)
                .reduce(
                  (acc, t) =>
                    t === term
                      ? acc + 1
                      : t.includes(term)
                        ? acc + term.length / t.length
                        : acc,
                  0,
                ) + acc,
            0,
          ),
        )

        const tagsScore =
          !tagsScores.length || tagsScores.includes(0)
            ? 0
            : tagsScores.reduce((acc, s) => acc + s)

        return [
          book,
          titleScore + authorsScore + seriesScore * 0.75 + tagsScore * 0.5,
        ] as const
      })
      .filter(([_, score]) => score > 0)
      .sort(([_a, a], [_b, b]) => b - a)
      .map(([book]) => book)
  }, [books, query])

  return (
    <DropdownMenu className="grow">
      <DropdownMenuTrigger
        ref={triggerRef}
        onLayout={({
          nativeEvent: {
            layout: { width },
          },
        }) => {
          setWidth(width)
        }}
        asChild
      >
        <Input
          maxFontSizeMultiplier={2}
          value={query}
          onChangeText={(value) => {
            if (!value) {
              triggerRef.current?.close()
            } else {
              triggerRef.current?.open()
            }
            setQuery(value)
          }}
          placeholder="Search"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="mt-2"
        style={{
          width,
        }}
      >
        {query && !!filteredBooks.length && (
          <FlatList
            data={filteredBooks}
            renderItem={({ item: book }) => (
              <DropdownMenuItem asChild>
                <Link
                  className="active:bg-secondary"
                  href={{
                    pathname: "/book/[uuid]",
                    params: { uuid: book.uuid },
                  }}
                  onPress={() => {
                    triggerRef.current?.close()
                    setQuery("")
                  }}
                >
                  <Group className="gap-4" style={{ width }}>
                    <BookThumbnailImage height={64} width={42} book={book} />
                    <Stack className="shrink">
                      <Text numberOfLines={2} className="text-sm font-semibold">
                        {book.title}
                      </Text>
                      <Text numberOfLines={1} className="text-sm">
                        {book.authors[0]?.name}
                      </Text>
                    </Stack>
                  </Group>
                </Link>
              </DropdownMenuItem>
            )}
          ></FlatList>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
