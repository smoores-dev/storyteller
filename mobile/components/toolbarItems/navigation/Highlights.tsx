import { skipToken } from "@reduxjs/toolkit/query"
import deepmerge from "deepmerge"
import { useMemo } from "react"
import { View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"

import { highlightTints, highlightUnderlines } from "@/colors"
import { Stack } from "@/components/ui/Stack"
import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { useColorTheme } from "@/hooks/useColorTheme"
import { getHrefChapterTitle, positionToPageCount } from "@/links"
import { bookmarkPressed } from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  useGetBookHighlightsQuery,
  useGetBookPreferencesQuery,
  useGetBookQuery,
  useGetGlobalPreferencesQuery,
} from "@/store/localApi"
import { getCurrentlyPlayingBookUuid } from "@/store/selectors/bookshelfSelectors"

export function Highlights() {
  const bookUuid = useAppSelector(getCurrentlyPlayingBookUuid)
  const dispatch = useAppDispatch()
  const { dark } = useColorTheme()
  const { data: highlights } = useGetBookHighlightsQuery(
    bookUuid ? { bookUuid } : skipToken,
  )
  const { data: book } = useGetBookQuery(
    bookUuid ? { uuid: bookUuid } : skipToken,
  )

  const highlightTitles = useMemo(() => {
    const toc = book?.readaloud?.epubManifest?.toc
    if (!toc) return []
    return (
      highlights?.map((highlight) => {
        return getHrefChapterTitle(highlight.locator.href, toc)
      }) ?? []
    )
  }, [book?.readaloud?.epubManifest?.toc, highlights])

  const highlightPages = useMemo(() => {
    const positions = book?.readaloud?.positions
    if (!positions) return []

    return (
      highlights?.map((highlight) => {
        const chapterPositions = positions.filter(
          (position) => position.href === highlight.locator.href,
        )
        const highlightPosition =
          (chapterPositions.findIndex(
            (position) =>
              (position.locations?.progression ?? 0) >=
              (highlight.locator.locations?.progression ?? 0),
          ) ?? 0) + 1

        const highlightPage = positionToPageCount(highlightPosition)
        return highlightPage
      }) ?? []
    )
  }, [book?.readaloud?.positions, highlights])

  const { data: bookPreferences } = useGetBookPreferencesQuery(
    bookUuid ? { uuid: bookUuid } : skipToken,
  )

  const { data: globalPreferences } = useGetGlobalPreferencesQuery()

  const preferences = useMemo(
    () =>
      bookPreferences
        ? globalPreferences && deepmerge(globalPreferences, bookPreferences)
        : globalPreferences,
    [globalPreferences, bookPreferences],
  )

  if (!highlights || !bookUuid) return null

  if (!highlights.length) {
    return (
      <Stack className="p-8">
        <Text className="text-muted-foreground">
          No highlights yet! Try adding some by long pressing on the text to
          make a selection.
        </Text>
      </Stack>
    )
  }

  return (
    <ScrollView>
      {highlights.map((highlight, index) => (
        <View key={highlight.uuid} className="px-2">
          <Button
            onPress={async () => {
              dispatch(
                bookmarkPressed({
                  bookUuid,
                  locator: highlight.locator,
                  timestamp: Date.now(),
                }),
              )
            }}
            variant="ghost"
            className="h-auto flex-col border-b border-b-gray-400 p-4 sm:h-auto"
          >
            <Text className="text-sm font-bold">{highlightTitles[index]}</Text>
            {highlight.locator.locations?.position && (
              <Text className="my-2 text-xs">Page {highlightPages[index]}</Text>
            )}
            {highlight.locator.text?.highlight && (
              <Text
                className="text-justify text-sm underline decoration-solid"
                style={{
                  fontFamily: preferences?.typography?.fontFamily,
                  textAlign: "left",
                  backgroundColor:
                    highlightTints[dark ? "dark" : "light"][highlight.color],
                  textDecorationColor:
                    highlightUnderlines[dark ? "dark" : "light"][
                      highlight.color
                    ],
                }}
              >
                {highlight.locator.text.highlight}
              </Text>
            )}
          </Button>
        </View>
      ))}
    </ScrollView>
  )
}
