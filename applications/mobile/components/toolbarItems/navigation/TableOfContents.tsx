import { skipToken } from "@reduxjs/toolkit/query"
import { type Ref, useRef } from "react"
import { type ScrollViewInstance, View, type ViewInstance } from "react-native"
import { ScrollView } from "react-native-gesture-handler"

import { useReaderFormSheetScrollPaddingBottom } from "@/components/toolbarItems/readerFormSheetLayout"
import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { type BookWithRelations } from "@/database/books"
import { cn } from "@/lib/utils"
import { isSameChapter } from "@/links"
import { locateLink } from "@/modules/readium"
import { type ReadiumLink } from "@/modules/readium/src/Readium.types"
import { navItemPressed } from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { useGetBookQuery } from "@/store/localApi"
import { getCurrentlyPlayingFormat } from "@/store/selectors/bookshelfSelectors"
import { type UUID } from "@/uuid"

function searchToc(
  toc: ReadiumLink[] | null | undefined,
  predicate: (link: ReadiumLink) => boolean,
): ReadiumLink | null {
  if (!toc) return null
  for (const link of toc) {
    if (predicate(link)) return link
    const descendent = searchToc(link.children, predicate)
    if (descendent) return descendent
  }
  return null
}

interface Props {
  bookUuid?: UUID | undefined
  format?: "readaloud" | "ebook" | "audiobook" | undefined
  onClose?: () => void
}

export function TableOfContents({
  bookUuid: bookUuidProp,
  format: formatProp,
  onClose,
}: Props) {
  const ref = useRef<null | ScrollViewInstance>(null)
  const currentItemRef = useRef<null | ViewInstance>(null)

  const selectedFormat = useAppSelector(getCurrentlyPlayingFormat)
  const bookUuid = bookUuidProp
  const { data: book } = useGetBookQuery(
    bookUuid ? { uuid: bookUuid } : skipToken,
  )
  const format = formatProp ?? selectedFormat

  const toc =
    format &&
    (format === "readaloud"
      ? book?.readaloud?.epubManifest?.toc
      : book?.[format]?.manifest?.toc)

  const locator = book?.position?.locator

  const currentTocLink =
    locator && searchToc(toc, (link) => isSameChapter(link.href, locator.href))

  const paddingBottom = useReaderFormSheetScrollPaddingBottom()
  if (!toc || !book) return

  return (
    <ScrollView
      ref={ref}
      className="flex-1"
      contentContainerClassName="px-2 pt-2"
      contentContainerStyle={{ paddingBottom }}
      onLayout={() => {
        if (!ref.current) return
        currentItemRef.current?.measureLayout(ref.current, (_x, y) => {
          ref.current?.scrollTo({
            y: y - 40,
            animated: false,
          })
        })
      }}
    >
      {toc.map((link) => (
        <TableOfContentsLink
          key={link.href}
          book={book}
          link={link}
          currentTocLink={currentTocLink}
          ref={currentItemRef}
          onPress={onClose}
        />
      ))}
    </ScrollView>
  )
}

function TableOfContentsLink({
  book,
  link,
  currentTocLink,
  ref,
  onPress,
}: {
  book: BookWithRelations
  link: ReadiumLink
  currentTocLink: { href: string; title?: string } | null | undefined
  ref?: Ref<ViewInstance> | undefined
  onPress?: (() => void) | undefined
}) {
  const dispatch = useAppDispatch()
  const isCurrent = link === currentTocLink

  return (
    <View
      collapsable={false}
      key={link.href}
      ref={isCurrent ? ref : undefined}
      className="py-0.5"
    >
      <Button
        variant="ghost"
        onPress={async () => {
          const locator = await locateLink(book.uuid, link)

          dispatch(
            navItemPressed({
              bookUuid: book.uuid,
              locator,
              timestamp: Date.now(),
              currentLocator: book.position?.locator,
            }),
          )

          onPress?.()
        }}
        className={cn(
          "h-auto justify-start rounded-md border border-transparent px-3 py-3 sm:h-auto",
          {
            "border-border bg-secondary": isCurrent,
          },
        )}
      >
        <Text className="text-sm font-bold">{link.title}</Text>
      </Button>
      {link.children?.map((child) => (
        <View key={child.href} className="pl-4">
          <TableOfContentsLink
            book={book}
            link={child}
            currentTocLink={currentTocLink}
            ref={ref}
            onPress={onPress}
          />
        </View>
      ))}
    </View>
  )
}
