import { Tabs } from "expo-router"
import { BookshelfIcon } from "../../../icons/BookshelfIcon"
import { BrowseIcon } from "../../../icons/BrowseIcon"
import { SettingsIcon } from "../../../icons/SettingsIcon"

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "black",
        tabBarInactiveTintColor: "black",
        tabBarStyle: {
          height: 95,
          paddingTop: 12,
        },
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
        options={{ title: "Browse", href: "/browse", tabBarIcon: BrowseIcon }}
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
