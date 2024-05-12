import { ScrollView, View, Pressable, TouchableOpacity } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { UIText } from "./UIText"
import { ReadiumManifest } from "../modules/readium"
import {
  ReadiumLink,
  ReadiumLocator,
} from "../modules/readium/src/Readium.types"
import { useEffect, useRef, useState } from "react"

function extractPath(href: string) {
  const url = new URL(href, "http://storyteller.local")
  return url.pathname
}

function isSameChapter(href1: string, href2: string) {
  return extractPath(href1) === extractPath(href2)
}

type Props = {
  locator: ReadiumLocator | null
  navItems: ReadiumManifest["toc"]
  onNavItemTap: (item: ReadiumLink) => void
  onOutsideTap?: () => void
}

export function TableOfContents({
  locator,
  navItems,
  onNavItemTap,
  onOutsideTap,
}: Props) {
  const ref = useRef<null | ScrollView>(null)
  const [parentCoords, setParentCoords] = useState<{
    x: number
    y: number
  }>({ x: 0, y: 0 })
  const [scrollCoords, setScrollCoords] = useState<null | {
    x: number
    y: number
  }>(null)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (scrollCoords) {
      ref.current?.scrollTo({
        x: parentCoords.x + scrollCoords.x,
        y: parentCoords.y + scrollCoords.y - 40,
        animated: true,
      })
    }
  }, [parentCoords.x, parentCoords.y, scrollCoords])

  if (!navItems) return

  return (
    <>
      <TouchableOpacity
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2,
        }}
        onPress={onOutsideTap}
      />
      <ScrollView
        ref={ref}
        style={{
          position: "absolute",
          right: 32,
          left: 106,
          top: insets.top + 56,
          // paddingHorizontal: 32,
          paddingVertical: 16,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "black",
          bottom: 300,
          zIndex: 3,
          backgroundColor: "white",
        }}
      >
        {navItems.map((item) => (
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
              onPress={() => onNavItemTap(item)}
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
                onPress={() => onNavItemTap(child)}
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
    </>
  )
}
