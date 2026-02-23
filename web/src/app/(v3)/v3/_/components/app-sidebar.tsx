"use client"

import {
  IconBook2,
  IconBook,
  IconHelpCircle,
  IconHome,
  IconList,
  IconSearch,
  IconSettings,
} from "@tabler/icons-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { useCallback } from "react"

import { type User } from "@/apiModels"
import {
  // useDeleteUserShelfMutation,
  // useGetSessionQuery,
  useListCollectionsQuery,
} from "@/store/api"
import { extractEmojiIcon } from "@/strings"

import { type NavItem, NavMain } from "@v3/_/components/nav/nav-main"
import {
  NavSecondary,
  type NavSecondaryItem,
} from "@v3/_/components/nav/nav-secondary"
import { NavUser } from "@v3/_/components/nav/nav-user"
import { Kbd, KbdGroup } from "@v3/_/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarPinButton,
} from "@v3/_/components/ui/sidebar"
import { V3Link } from "@v3/_/components/v3-link"

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: User
}) {
  const { data: collections } = useListCollectionsQuery()

  const openSearch = useCallback(() => {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    })
    document.dispatchEvent(event)
  }, [])

  const t = useTranslations("AppSidebar")

  const collectionSubItems =
    collections?.map((collection) => {
      const { icon, label } = extractEmojiIcon(collection.name)
      return {
        title: label,
        url: `/collections/${collection.uuid}`,
        icon,
      }
    }) ?? []

  const navMain: NavItem[] =
    // const shelfSubItems =
    //   userShelves?.map((shelf) => {
    //     const { icon, label } = extractEmojiIcon(shelf.name)
    //     return {
    //       title: label,
    //       url: `/shelves/${shelf.uuid}`,
    //       icon,
    //       onRemove: () => deleteShelf({ uuid: shelf.uuid }),
    //     }
    //   }) ?? []

    [
      {
        title: t("home"),
        url: "/",
        icon: IconHome,
      },
      {
        title: t("books"),
        allTitle: t("allBooks"),
        url: "/books",
        icon: IconBook,
        // isCollapsible: shelfSubItems.length > 0,
        // subItems: shelfSubItems,
      },
      {
        title: t("collections"),
        allTitle: t("allCollections"),
        url: "/collections",
        icon: IconBook2,
        isCollapsible: collectionSubItems.length > 0,
        subItems: collectionSubItems,
      },
      {
        title: t("series"),
        url: "/series",
        icon: IconList,
      },
    ]

  const navSecondary: NavSecondaryItem[] = [
    {
      custom: (
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={openSearch}
            className="flex justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <IconSearch />
              {t("search")}
            </div>
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ),
      key: "search",
    },
    {
      title: t("settings"),
      url: "/settings",
      icon: IconSettings,
    },
    {
      title: t("documentation"),
      url: "https://storyteller-platform.gitlab.io/storyteller/",
      icon: IconHelpCircle,
    },
  ]

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader className="flex flex-row items-center justify-between gap-2">
        <V3Link
          href="/"
          className="hover:bg-sidebar-accent flex items-center gap-2 rounded-md p-1"
        >
          <Image
            src="/Storyteller_Logo.png"
            width={28}
            height={28}
            alt="Storyteller"
            className="size-7 shrink-0"
          />
          <span className="font-heading w-auto text-base font-semibold opacity-100 transition-all duration-200 group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
            Storyteller
          </span>
        </V3Link>
        <SidebarPinButton className="group-data-[collapsible=icon]:hidden" />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: user.name ?? null,
            email: user.email,
            username: user.username ?? null,
          }}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
