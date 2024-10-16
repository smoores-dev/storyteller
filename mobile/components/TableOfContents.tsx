import { ScrollView, View, Pressable } from "react-native"
import { UIText } from "./UIText"
import { locateLink } from "../modules/readium"
import { useRef } from "react"
import { useAppSelector, useAppDispatch } from "../store/appState"
import {
  getCurrentlyPlayingBook,
  getLocator,
} from "../store/selectors/bookshelfSelectors"
import { bookshelfSlice } from "../store/slices/bookshelfSlice"
import { isSameChapter } from "../links"
import { activeBackgroundColor } from "../design"

export function TableOfContents() {
  const ref = useRef<null | ScrollView>(null)
  const currentItemRef = useRef<null | View>(null)

  const book = useAppSelector(getCurrentlyPlayingBook)
  const timestampedLocator = useAppSelector(
    (state) => book && getLocator(state, book.id),
  )
  const locator = timestampedLocator?.locator

  const dispatch = useAppDispatch()

  if (!book?.manifest.toc) return

  return (
    <ScrollView
      ref={ref}
      onLayout={() => {
        if (!ref.current) return
        // @ts-expect-error ScrollView is a perfectly valid component, not sure what
        // exactly the issue is here
        currentItemRef.current?.measureLayout(ref.current, (_x, y) => {
          ref.current?.scrollTo({
            y: y - 40,
            animated: true,
          })
        })
      }}
    >
      {book.manifest.toc.map((item) => (
        <View
          collapsable={false}
          key={item.href}
          {...(isSameChapter(item.href, locator?.href ?? "") && {
            ref: currentItemRef,
          })}
          style={{ paddingHorizontal: 8 }}
        >
          <Pressable
            onPress={async () => {
              const locator = await locateLink(book.id, item)

              dispatch(
                bookshelfSlice.actions.navItemTapped({
                  bookId: book.id,
                  locator: { locator, timestamp: Date.now() },
                }),
              )
            }}
            style={{
              borderBottomWidth: 1,
              borderBottomColor: "#CCC",
              paddingVertical: 16,
              paddingHorizontal: 16,
              ...(isSameChapter(item.href, locator?.href ?? "") && {
                backgroundColor: activeBackgroundColor,
              }),
            }}
          >
            <UIText
              style={{
                fontSize: 14,
                fontWeight: "bold",
              }}
            >
              {item.title}
            </UIText>
          </Pressable>
          {item.children?.map((child) => (
            <Pressable
              collapsable={false}
              key={child.href}
              {...(isSameChapter(child.href, locator?.href ?? "") && {
                ref: currentItemRef,
              })}
              style={{
                borderBottomWidth: 1,
                borderBottomColor: "#CCC",
                paddingVertical: 16,
                paddingHorizontal: 16,
                paddingLeft: 24,
                ...(isSameChapter(child.href, locator?.href ?? "") && {
                  backgroundColor: activeBackgroundColor,
                }),
              }}
              onPress={async () => {
                const locator = await locateLink(book.id, child)

                dispatch(
                  bookshelfSlice.actions.navItemTapped({
                    bookId: book.id,
                    locator: { locator, timestamp: Date.now() },
                  }),
                )
              }}
            >
              <UIText
                style={{
                  fontSize: 14,
                }}
              >
                {child.title}
              </UIText>
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  )
}
