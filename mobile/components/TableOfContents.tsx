import { ScrollView, View, Pressable } from "react-native"
import { UIText } from "./UIText"
import { locateLink } from "../modules/readium"
import { useEffect, useRef, useState } from "react"
import { useAppSelector, useAppDispatch } from "../store/appState"
import {
  getCurrentlyPlayingBook,
  getLocator,
} from "../store/selectors/bookshelfSelectors"
import { bookshelfSlice } from "../store/slices/bookshelfSlice"

function extractPath(href: string) {
  const url = new URL(href, "http://storyteller.local")
  return url.pathname
}

function isSameChapter(href1: string, href2: string) {
  return extractPath(href1) === extractPath(href2)
}

export function TableOfContents() {
  const ref = useRef<null | ScrollView>(null)
  const [parentCoords, setParentCoords] = useState<{
    x: number
    y: number
  }>({ x: 0, y: 0 })
  const [scrollCoords, setScrollCoords] = useState<null | {
    x: number
    y: number
  }>(null)

  const book = useAppSelector(getCurrentlyPlayingBook)
  const locator = useAppSelector((state) => book && getLocator(state, book.id))

  const dispatch = useAppDispatch()

  useEffect(() => {
    if (scrollCoords) {
      ref.current?.scrollTo({
        x: parentCoords.x + scrollCoords.x,
        y: parentCoords.y + scrollCoords.y - 40,
        animated: true,
      })
    }
  }, [parentCoords.x, parentCoords.y, scrollCoords])

  if (!book?.manifest.toc) return

  return (
    <ScrollView ref={ref}>
      {book.manifest.toc.map((item) => (
        <View
          key={item.href}
          {...(isSameChapter(item.href, locator?.href ?? "") && {
            ref: (element) => {
              element?.measure((x, y) =>
                setScrollCoords((prev) =>
                  prev?.x === x && prev.y === y ? prev : { x, y },
                ),
              )
            },
          })}
          {...(item.children?.some(({ href }) =>
            isSameChapter(href, locator?.href ?? ""),
          ) && {
            ref: (element) => {
              element?.measure((x, y) =>
                setParentCoords((prev) =>
                  prev?.x === x && prev.y === y ? prev : { x, y },
                ),
              )
            },
          })}
          style={{ paddingHorizontal: 8 }}
        >
          <Pressable
            onPress={async () => {
              const locator = await locateLink(book.id, item)

              dispatch(
                bookshelfSlice.actions.navItemTapped({
                  bookId: book.id,
                  locator,
                }),
              )
            }}
            style={{
              borderBottomWidth: 1,
              borderBottomColor: "#CCC",
              paddingVertical: 16,
              paddingHorizontal: 16,
              ...(isSameChapter(item.href, locator?.href ?? "") && {
                backgroundColor: "#EEE",
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
              key={child.href}
              {...(isSameChapter(child.href, locator?.href ?? "") && {
                ref: (element) => {
                  element?.measure((x, y) =>
                    setScrollCoords((prev) =>
                      prev?.x === x && prev.y === y ? prev : { x, y },
                    ),
                  )
                },
              })}
              style={{
                borderBottomWidth: 1,
                borderBottomColor: "#CCC",
                paddingVertical: 16,
                paddingHorizontal: 16,
                paddingLeft: 24,
                ...(isSameChapter(child.href, locator?.href ?? "") && {
                  backgroundColor: "#EEE",
                }),
              }}
              onPress={async () => {
                const locator = await locateLink(book.id, child)

                dispatch(
                  bookshelfSlice.actions.navItemTapped({
                    bookId: book.id,
                    locator,
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
