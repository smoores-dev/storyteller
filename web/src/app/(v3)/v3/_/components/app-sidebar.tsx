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
import { useCallback, useEffect, useMemo, useRef } from "react"
import { toast } from "sonner"

import { type User } from "@/apiModels"
import {
  // useDeleteUserShelfMutation,
  // useGetSessionQuery,
  useGetLatestVersionQuery,
  useListCollectionsQuery,
} from "@/store/api"
import { extractEmojiIcon } from "@/strings"
import { BETA_TAGS, compareVersions } from "@/versions"

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

import { DISMISSED_VERSION_KEY } from "./settings-form/changelog-tab"

const THIRTY_MINUTES = 30 * 60 * 1000

function UpdateDot() {
  return (
    <span
      className="bg-primary size-2 rounded-full"
      aria-label="Update available"
    />
  )
}

export function AppSidebar({
  user,
  currentVersion,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: User
  currentVersion: string
}) {
  const { data: collections } = useListCollectionsQuery()

  const { data: latestVersionData } = useGetLatestVersionQuery(
    {
      component: "web",
      beta: BETA_TAGS.some((tag) => currentVersion.includes(tag)),
    },
    { pollingInterval: THIRTY_MINUTES },
  )

  const latestVersion = latestVersionData?.version ?? null

  const hasUpdate = useMemo(() => {
    if (!latestVersion) return false

    const dismissed =
      typeof window !== "undefined"
        ? localStorage.getItem(DISMISSED_VERSION_KEY)
        : null

    const isNewerThanCurrent = compareVersions(latestVersion, currentVersion)
    const isNewerThanDismissed =
      !dismissed || compareVersions(latestVersion, dismissed)

    return isNewerThanCurrent === 1 && isNewerThanDismissed
  }, [latestVersion, currentVersion])

  const toastShownRef = useRef(false)

  useEffect(() => {
    if (!hasUpdate || !latestVersion || toastShownRef.current) return

    toastShownRef.current = true

    toast.info(`A new version (v${latestVersion}) is available`, {
      dismissible: true,
      closeButton: true,
      onDismiss: () => {
        localStorage.setItem(DISMISSED_VERSION_KEY, latestVersion)
      },
      action: {
        label: "View changelog",
        onClick: () => {
          window.location.href = "/v3/settings?tab=changelog"
          localStorage.setItem(DISMISSED_VERSION_KEY, latestVersion)
        },
      },
      duration: Infinity,
    })
  }, [hasUpdate, latestVersion])

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
      badge: hasUpdate ? <UpdateDot /> : undefined,
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
