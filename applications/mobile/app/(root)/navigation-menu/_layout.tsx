import { Tabs, router, useGlobalSearchParams, usePathname } from "expo-router"
import { Bookmark, Highlighter, ListTree } from "lucide-react-native"
import { useEffect } from "react"
import { View } from "react-native"
import { useCSSVariable } from "uniwind"

import { NavigationReturnControl } from "@/components/toolbarItems/navigation/NavigationReturnControl"
import {
  getNavigationMenuTabFromPathname,
  setLastNavigationMenuTab,
} from "@/components/toolbarItems/navigation/navigationMenuSessionState"
import {
  readerFormSheetGrabberHeight,
  readerFormSheetTabBarHeight,
  useReaderFormSheetBottomInset,
  useReaderFormSheetHeight,
} from "@/components/toolbarItems/readerFormSheetLayout"
import { Icon } from "@/components/ui/icon"
import { type UUID } from "@/uuid"

type NavigationMenuParams = {
  uuid?: UUID
  format?: "readaloud" | "ebook" | "audiobook"
  mode?: "text" | "audio"
}

export default function NavigationMenuLayout() {
  const params = useGlobalSearchParams<NavigationMenuParams>()
  const pathname = usePathname()
  const height = useReaderFormSheetHeight()
  const bottomInset = useReaderFormSheetBottomInset()
  const background = useCSSVariable("--color-background") as string
  const border = useCSSVariable("--color-border") as string
  const primary = useCSSVariable("--color-primary") as string
  const mutedForeground = useCSSVariable("--color-muted-foreground") as string

  useEffect(() => {
    const tab = getNavigationMenuTabFromPathname(pathname)

    if (tab) {
      setLastNavigationMenuTab(tab)
    }
  }, [pathname])

  const navigateToTab =
    (name: "toc" | "bookmarks" | "highlights") =>
    (event: { preventDefault: () => void }) => {
      event.preventDefault()
      router.navigate({ pathname: `/navigation-menu/${name}`, params })
    }

  return (
    <View
      className="bg-background overflow-hidden"
      style={{ height, marginBottom: -bottomInset }}
    >
      <View
        className="items-center justify-center"
        style={{ height: readerFormSheetGrabberHeight }}
      >
        <View className="bg-muted-foreground/40 h-1 w-12 rounded-full" />
      </View>
      <NavigationReturnControl
        bookUuid={params.uuid}
        onReturn={() => router.dismiss()}
      />
      <View className="flex-1">
        <Tabs
          safeAreaInsets={{ bottom: 0 }}
          screenOptions={{
            headerShown: false,
            tabBarPosition: "top",
            tabBarShowLabel: true,
            tabBarActiveTintColor: primary,
            tabBarInactiveTintColor: mutedForeground,
            tabBarStyle: {
              backgroundColor: background,
              borderBottomColor: border,
              borderBottomWidth: 1,
              borderTopWidth: 0,
              elevation: 0,
              height: readerFormSheetTabBarHeight,
              paddingTop: 0,
              shadowOpacity: 0,
            },
            tabBarItemStyle: {
              height: readerFormSheetTabBarHeight,
              paddingBottom: 5,
              paddingTop: 4,
            },
            tabBarIconStyle: {
              height: 20,
              marginBottom: 1,
              marginTop: 0,
            },
            tabBarLabelStyle: {
              fontSize: 12,
              fontWeight: "700",
              lineHeight: 14,
            },
          }}
        >
          <Tabs.Screen
            name="toc"
            listeners={{ tabPress: navigateToTab("toc") }}
            options={{
              title: "Contents",
              tabBarIcon: ({ color, focused }) => (
                <Icon
                  as={ListTree}
                  color={color}
                  size={focused ? 20 : 19}
                  strokeWidth={focused ? 2.5 : 2}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="bookmarks"
            listeners={{ tabPress: navigateToTab("bookmarks") }}
            options={{
              title: "Bookmarks",
              tabBarIcon: ({ color, focused }) => (
                <Icon
                  as={Bookmark}
                  color={color}
                  size={focused ? 20 : 19}
                  strokeWidth={focused ? 2.5 : 2}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="highlights"
            listeners={{ tabPress: navigateToTab("highlights") }}
            options={{
              title: "Highlights",
              tabBarIcon: ({ color, focused }) => (
                <Icon
                  as={Highlighter}
                  color={color}
                  size={focused ? 20 : 19}
                  strokeWidth={focused ? 2.5 : 2}
                />
              ),
            }}
          />
        </Tabs>
      </View>
    </View>
  )
}
