import { ScrollView, View, Pressable, TouchableOpacity } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { UIText } from "./UIText"
import { ReadiumManifest } from "../modules/readium"
import { ReadiumLink } from "../modules/readium/src/Readium.types"

type Props = {
  navItems: ReadiumManifest["toc"]
  onNavItemTap: (item: ReadiumLink) => void
  onOutsideTap?: () => void
}

export function TableOfContents({
  navItems,
  onNavItemTap,
  onOutsideTap,
}: Props) {
  const insets = useSafeAreaInsets()

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
          <View key={item.href} style={{ paddingHorizontal: 8 }}>
            <Pressable
              onPress={() => onNavItemTap(item)}
              style={{
                borderBottomWidth: 1,
                borderBottomColor: "#CCC",
                paddingVertical: 16,
                paddingHorizontal: 16,
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
            {item.children?.map((item) => (
              <Pressable
                key={item.href}
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: "#CCC",
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  paddingLeft: 24,
                }}
                onPress={() => onNavItemTap(item)}
              >
                <UIText
                  style={{
                    fontSize: 14,
                  }}
                >
                  {item.title}
                </UIText>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </>
  )
}
