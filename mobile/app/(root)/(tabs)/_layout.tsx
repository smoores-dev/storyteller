import { Tabs } from "expo-router"
import { Platform } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { BookshelfIcon } from "../../../icons/BookshelfIcon"
import { BrowseIcon } from "../../../icons/BrowseIcon"
import { SettingsIcon } from "../../../icons/SettingsIcon"
import { useColorTheme } from "../../../hooks/useColorTheme"

export default function TabLayout() {
  const { foreground } = useColorTheme()
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: foreground,
        tabBarInactiveTintColor: foreground,
        tabBarStyle: [
          {
            height: 84,
            paddingTop: 12,
          },
          Platform.select({
            android: {
              marginBottom: insets.bottom,
            },
            default: {},
          }),
        ],
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Bookshelf",
          href: "/",

          tabBarIcon: BookshelfIcon,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Browse",
          href: "/browse",
          tabBarIcon: BrowseIcon,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          href: "/settings",
          tabBarIcon: SettingsIcon,
        }}
      />
      <Tabs.Screen name="book/[id]" options={{ href: null }} />
      <Tabs.Screen name="login" options={{ href: null }} />
      <Tabs.Screen name="server" options={{ href: null }} />
    </Tabs>
  )
}
