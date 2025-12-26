import { skipToken } from "@reduxjs/toolkit/query"
import { type Ref, useRef } from "react"
import { View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"

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
import {
  getCurrentlyPlayingBookUuid,
  getCurrentlyPlayingFormat,
} from "@/store/selectors/bookshelfSelectors"

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
  onClose?: () => void
}

export function TableOfContents({ onClose }: Props) {
  const ref = useRef<null | ScrollView>(null)
  const currentItemRef = useRef<null | View>(null)

  const bookUuid = useAppSelector(getCurrentlyPlayingBookUuid)
  const { data: book } = useGetBookQuery(
    bookUuid ? { uuid: bookUuid } : skipToken,
  )
  const format = useAppSelector(getCurrentlyPlayingFormat)

  const toc =
    format &&
    (format === "readaloud"
      ? book?.readaloud?.epubManifest?.toc
      : book?.[format]?.manifest?.toc)

  const locator = book?.position?.locator

  const currentTocLink =
    locator && searchToc(toc, (link) => isSameChapter(link.href, locator.href))

  if (!toc || !book) return

  return (
    <ScrollView
      className="-max-h-screen-safe-offset-36"
      ref={ref}
      onLayout={() => {
        if (!ref.current) return
        // @ts-expect-error ScrollView is a perfectly valid component, not sure what
        // exactly the issue is here
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
  ref?: Ref<View> | undefined
  onPress?: (() => void) | undefined
}) {
  const dispatch = useAppDispatch()
  const isCurrent = link === currentTocLink

  return (
    <View
      collapsable={false}
      key={link.href}
      ref={isCurrent ? ref : undefined}
      className="px-2"
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
            }),
          )

          onPress?.()
        }}
        className={cn(
          "h-auto justify-start border-b border-b-gray-400 p-4 sm:h-auto",
          {
            "bg-secondary": isCurrent,
          },
        )}
      >
        <Text className="text-sm font-bold">{link.title}</Text>
      </Button>
      {link.children?.map((child) => (
        <View key={child.href} className="pl-4 pr-2">
          <TableOfContentsLink
            book={book}
            link={child}
            currentTocLink={currentTocLink}
            ref={ref}
          />
        </View>
      ))}
    </View>
  )
}
