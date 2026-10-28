import { LegendList } from "@legendapp/list/react-native"
import { Stack as RouterStack } from "expo-router"
import { type ReactNode } from "react"
import { RefreshControl, View, useWindowDimensions } from "react-native"
import {
  KeyboardAwareScrollView,
  KeyboardGestureArea,
} from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { withUniwind } from "uniwind"

import { type BookWithRelations } from "@/database/books"
import { useListAllServerBooks } from "@/hooks/useListAllServerBooks"
import { usesSystemHeader } from "@/lib/nativeChrome"
import { cn } from "@/lib/utils"

import { BackButton } from "./BackButton"
import { BookThumbnail } from "./BookThumbnail"
import { MiniPlayerWidget } from "./MiniPlayerWidget"
import { ScreenBackButton } from "./ScreenBackButton"
import { calculateBookGridLayout } from "./bookGridLayout"
import { Stack } from "./ui/Stack"
import { Text } from "./ui/text"

const BookLegendList = withUniwind(LegendList<BookWithRelations>)

interface Props {
  title: string
  books: BookWithRelations[]
  header?: ReactNode
  refreshable?: boolean
}

export function BookGrid({ title, books, header, refreshable = true }: Props) {
  const dimensions = useWindowDimensions()
  const insets = useSafeAreaInsets()

  const { isLoading, refetch } = useListAllServerBooks()

  const { numColumns, thumbnailWidth } = calculateBookGridLayout(
    dimensions.width - insets.left - insets.right,
  )

  const bookCount = (className: string) => (
    <Text className={className}>{books.length} books</Text>
  )

  return (
    <>
      {usesSystemHeader && (
        <>
          {/* Header options rather than views, so that iOS is free to host the
              bar — and the back action in particular — in the iPhone Duo rail. */}
          <RouterStack.Header style={{ shadowColor: "transparent" }} />
          <RouterStack.Title style={{ fontFamily: "YoungSerif" }}>
            {title}
          </RouterStack.Title>
          <ScreenBackButton />
        </>
      )}
      <Stack
        className={cn("flex-1 items-stretch", !usesSystemHeader && "pt-safe")}
      >
        {!usesSystemHeader && (
          <View className="px-safe-or-2 w-full flex-row items-center justify-start gap-2 self-start">
            <BackButton />

            <Text className="font-youngserif my-2" variant="h3">
              {title}
            </Text>

            {bookCount("text-muted-foreground mr-4 ml-auto text-sm")}
          </View>
        )}

        {/* Under the system bar the header scrolls with the grid, so the system
            can hand it the height of the bar as a content inset. */}
        {!usesSystemHeader && header}

        <KeyboardGestureArea style={{ flex: 1 }} enableSwipeToDismiss>
          <BookLegendList
            key={numColumns}
            className="flex-1"
            contentContainerClassName="px-safe-or-3"
            data={books}
            ListHeaderComponent={
              usesSystemHeader ? (
                <>
                  {header}
                  {bookCount("text-muted-foreground px-safe-or-3 pb-2 text-sm")}
                </>
              ) : undefined
            }
            numColumns={numColumns}
            keyExtractor={(book) => book.uuid}
            recycleItems
            drawDistance={dimensions.height}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="always"
            renderScrollComponent={(props) => (
              <KeyboardAwareScrollView
                {...props}
                contentInsetAdjustmentBehavior={
                  usesSystemHeader ? "automatic" : "never"
                }
              />
            )}
            refreshControl={
              refreshable ? (
                <RefreshControl
                  refreshing={isLoading}
                  onRefresh={() => {
                    refetch()
                  }}
                />
              ) : undefined
            }
            renderItem={({ item: book }) => (
              <View className="mx-1.5 my-2" style={{ width: thumbnailWidth }}>
                <BookThumbnail book={book} width={thumbnailWidth} />
              </View>
            )}
            ListFooterComponent={<View className="h-40 w-full" />}
          />
        </KeyboardGestureArea>
        <MiniPlayerWidget />
      </Stack>
    </>
  )
}
