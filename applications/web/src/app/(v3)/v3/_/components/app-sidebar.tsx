"use client"

import {
  type Hotkey,
  useHotkey,
  useHotkeySequence,
  useKeyHold,
} from "@tanstack/react-hotkeys"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import {
  NavSecondary,
  type NavSecondaryItem,
} from "@v3/_/components/nav/nav-secondary"
import { NavUser } from "@v3/_/components/nav/nav-user"
import { KeyboardShortcut } from "@v3/_/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarPinButton,
  useSidebar,
} from "@v3/_/components/ui/sidebar"
import { Skeleton } from "@v3/_/components/ui/skeleton"
import { V3Link } from "@v3/_/components/v3-link"
import { useVersionBasePath } from "@v3/_/components/version-context"
import { useLibraryCounts } from "@v3/_/hooks/use-library-counts"
import { useSidebarPrefetch } from "@v3/_/hooks/use-sidebar-prefetch"
import { useTheme } from "@v3/_/hooks/use-theme"
import { useTranslation } from "@v3/_/hooks/use-translation"

import type { User } from "@/apiModels"
import { cn } from "@/cn"
import { type ShelfWithBooks } from "@/database/shelves"
import {
  type SidebarGroupWithItems,
  type SidebarItemDetail,
} from "@/database/sidebar"
import { usePermission } from "@/hooks/usePermission"
import { usePermissions } from "@/hooks/usePermissions"
import * as icon from "@/icons"
import {
  useGetLatestChangelogQuery,
  useListCollectionsQuery,
  useListSidebarGroupsQuery,
  useListUserShelvesQuery,
  useSetSidebarGroupsMutation,
} from "@/store/api"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  selectCollapsedSidebarGroups,
  selectTheme,
  uiSettingsSlice,
} from "@/store/slices/uiSettingsSlice"
import { extractEmojiIcon } from "@/strings"
import { BETA_TAGS, compareVersions } from "@/versions"

import { CreateCollectionDialog } from "./books/CreateCollectionDialog"
import { CommandSearch, useCommandSearch } from "./command-search"
import { SidebarManager } from "./nav/SidebarManager"
import {
  BUILTIN_SIDEBAR_MAP,
  type BuiltinSidebarItem,
  COLLECTION_ICON,
  SHELF_ICON,
} from "./nav/sidebar-items"
import {
  DISMISSED_VERSION_KEY,
  formatChangelogDescription,
} from "./settings-form/changelog-tab"
import { ShelfEditor } from "./shelves/ShelfEditor"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { DynamicIcon } from "./ui/dynamic-icon"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"
import { TooltipButton } from "./ui/tooltip-button"

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
  initialSidebarGroups,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: User
  currentVersion: string
  initialSidebarGroups: SidebarGroupWithItems[]
}) {
  const { data: sidebarGroups = initialSidebarGroups } =
    useListSidebarGroupsQuery()

  const libraryCounts = useLibraryCounts()
  const {
    handlePointerEnter: prefetchOnEnter,
    handlePointerLeave: prefetchOnLeave,
  } = useSidebarPrefetch()
  const [editMode, setEditMode] = useState(false)
  const [editingShelfUuid, setEditingShelfUuid] = useState<string | null>(null)
  const [creatingCollection, setCreatingCollection] = useState(false)
  const [creatingShelf, setCreatingShelf] = useState(false)
  const [setSidebarGroupsMut] = useSetSidebarGroupsMutation()
  const canAccessSettings = usePermission("settingsUpdate")
  const { pinned } = useSidebar()

  // editing only makes sense while the sidebar stays open
  useEffect(() => {
    if (!pinned) setEditMode(false)
  }, [pinned])

  // items are hidden, never deleted
  const hideWhere = (
    predicate: (
      item: SidebarItemDetail,
      group: SidebarGroupWithItems,
    ) => boolean,
  ) => {
    const updated = sidebarGroups.map((g) => ({
      uuid: g.uuid,
      name: g.name,
      kind: g.kind,
      items: g.items.map((i) => ({
        kind: i.kind,
        builtinKey: i.builtinKey,
        collectionUuid: i.collectionUuid,
        shelfUuid: i.shelfUuid,
        hidden: predicate(i, g) ? true : i.hidden,
      })),
    }))

    void setSidebarGroupsMut(updated)
  }

  const { data: latestChangelog } = useGetLatestChangelogQuery(
    {
      component: "web",
      beta: BETA_TAGS.some((tag) => currentVersion.includes(tag)),
    },
    { pollingInterval: THIRTY_MINUTES },
  )

  const latestVersion = latestChangelog?.version ?? null

  const hasUpdate = useMemo(() => {
    if (!latestVersion) return false

    const dismissed = false
    // typeof window !== "undefined"
    //   ? localStorage.getItem(DISMISSED_VERSION_KEY)
    //   : null

    const isNewerThanCurrent = compareVersions(latestVersion, currentVersion)
    const isNewerThanDismissed =
      !dismissed || compareVersions(latestVersion, dismissed)

    return isNewerThanCurrent === 1 && isNewerThanDismissed
  }, [latestVersion, currentVersion])

  const toastShownRef = useRef(false)

  useEffect(() => {
    if (
      !hasUpdate ||
      !latestVersion ||
      toastShownRef.current ||
      !canAccessSettings
    )
      return

    toastShownRef.current = true

    const cleanedDescription = formatChangelogDescription(
      latestChangelog?.description,
    )

    toast(`A new version (v${latestVersion}) is available`, {
      dismissible: true,
      closeButton: true,
      onDismiss: () => {
        localStorage.setItem(DISMISSED_VERSION_KEY, latestVersion)
      },
      className: "flex flex-col gap-2",
      description: cleanedDescription ? (
        <div
          className="prose prose-sm dark:prose-invert leading-tight"
          dangerouslySetInnerHTML={{
            __html: cleanedDescription,
          }}
        />
      ) : undefined,
      action: {
        label: "View changelog",
        onClick: () => {
          window.location.href = `${window.location.origin}/settings?tab=changelog`
          localStorage.setItem(DISMISSED_VERSION_KEY, latestVersion)
        },
      },
      duration: Infinity,
    })
  }, [hasUpdate, latestVersion, latestChangelog, canAccessSettings])

  const { openSearch } = useCommandSearch()

  const t = useTranslation("AppSidebar")
  const theme = useAppSelector(selectTheme)
  const { setTheme } = useTheme()

  const toggleTheme = () => {
    setTheme(
      theme === "dark" ? "system" : theme === "system" ? "light" : "dark",
    )
  }

  useHotkey("Mod+Shift+L", () => {
    toggleTheme()
  })

  const navSecondary: NavSecondaryItem[] = [
    {
      onClick: () => {
        // this is fine dont hate me react-compiler-chan
        // eslint-disable-next-line react-compiler/react-compiler
        document.cookie = "frontend-version=v2; path=/; max-age=31536000"
        window.location.href = "/"
      },
      icon: icon.ArrowBack,
      title: t("switchToClassic"),
      key: "switchToClassic",
    },
    {
      custom: (
        <SidebarMenuItem>
          <Tooltip delay={500}>
            <TooltipTrigger
              render={
                <SidebarMenuButton
                  onClick={toggleTheme}
                  className="flex items-center gap-2"
                  size="sm"
                  suppressHydrationWarning
                >
                  {theme === "dark" ? (
                    <icon.DarkMode className="size-4" />
                  ) : theme === "system" ? (
                    <icon.System className="size-4" />
                  ) : (
                    <icon.LightMode className="size-4" />
                  )}
                  <span>{t(theme)}</span>
                </SidebarMenuButton>
              }
            />
            <TooltipContent side="right" suppressHydrationWarning>
              {t("toggleTheme")}
              <KeyboardShortcut shortcut={["Mod+Shift+L"]} />
            </TooltipContent>
          </Tooltip>
        </SidebarMenuItem>
      ),
      key: "theme",
    },
    {
      custom: (
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={openSearch}
            size="sm"
            className="flex justify-between gap-2"
          >
            <icon.Search />
            <span className="flex grow justify-between">
              {t("search")}
              <KeyboardShortcut shortcut={["Mod+K"]} />
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ),
      key: "search",
    },
    ...(canAccessSettings
      ? [
          {
            title: t("settings"),
            url: "/settings",
            icon: icon.Settings,
            badge: hasUpdate ? <UpdateDot /> : undefined,
          },
        ]
      : []),
  ]

  return (
    <>
      <Sidebar variant="inset" collapsible="icon" {...props}>
        <SidebarHeader className="flex h-[var(--header-height,3.5rem)] shrink-0 flex-row items-center justify-between gap-2">
          <TooltipButton
            size="sm"
            variant="real-ghost"
            tooltip={`Version: ${currentVersion}`}
            aria-label={`Storyteller version ${currentVersion}`}
            nativeButton={false}
            render={
              <V3Link
                href="/"
                className="hover:bg-sidebar-accent hover:text-primary flex items-center gap-2 rounded-md p-0 pl-1"
              >
                <img
                  loading="eager"
                  src="/Storyteller_Logo.png"
                  width={28}
                  height={28}
                  alt="Storyteller"
                  className="h-7! max-h-7! w-7! max-w-7! shrink-0"
                />
                <span className="w-auto font-[Young_Serif] text-base opacity-100 group-data-[collapsible=icon]:hidden group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
                  Storyteller
                </span>
              </V3Link>
            }
          />

          <div className="relative flex items-center gap-0.5 group-data-[collapsible=icon]:hidden">
            <TooltipButton
              size="sm"
              variant="real-ghost"
              className="hover:text-sidebar-accent-foreground size-7 shrink-0"
              onClick={() => {
                setEditMode(true)
              }}
              tooltip={t("customize")}
              aria-label={t("customize")}
            >
              <icon.AdjustmentsHorizontal className="size-4" />
            </TooltipButton>
            <SidebarPinButton />
          </div>
        </SidebarHeader>

        <SidebarContent>
          {editMode ? (
            <SidebarManager
              onClose={() => {
                setEditMode(false)
              }}
              groups={sidebarGroups}
            />
          ) : (
            <>
              {sidebarGroups.map((group, index) => {
                const startIndex = sidebarGroups
                  .slice(0, index)
                  .reduce((acc, group) => acc + group.items.length, 0)

                return (
                  <SidebarNavGroup
                    key={group.uuid}
                    group={group}
                    startIndex={startIndex}
                    libraryCounts={libraryCounts}
                    onPrefetchEnter={prefetchOnEnter}
                    onPrefetchLeave={prefetchOnLeave}
                    onEditShelf={(uuid) => {
                      setEditingShelfUuid(uuid)
                    }}
                    onHideItem={(itemUuid) => {
                      hideWhere((i) => i.uuid === itemUuid)
                    }}
                    onHideAll={() => {
                      hideWhere((_, g) => g.uuid === group.uuid)
                    }}
                    onCreateNew={
                      group.kind === "collections"
                        ? () => {
                            setCreatingCollection(true)
                          }
                        : group.kind === "shelves"
                          ? () => {
                              setCreatingShelf(true)
                            }
                          : undefined
                    }
                  />
                )
              })}
              <NavSecondary items={navSecondary} className="mt-auto" />
            </>
          )}
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

      <ShelfEditorFromSidebar
        shelfUuid={editingShelfUuid}
        onClose={() => {
          setEditingShelfUuid(null)
        }}
      />

      <ShelfEditor
        open={creatingShelf}
        onOpenChange={(open) => {
          if (!open) setCreatingShelf(false)
        }}
        shelf={null}
      />

      <CreateCollectionDialog
        open={creatingCollection}
        onOpenChange={setCreatingCollection}
      />

      <CommandSearch />
    </>
  )
}

function SidebarNavGroup({
  group,
  startIndex,
  libraryCounts,
  onPrefetchEnter,
  onPrefetchLeave,
  onEditShelf,
  onHideItem,
  onHideAll,
  onCreateNew,
}: {
  group: SidebarGroupWithItems
  libraryCounts: Record<
    string,
    { count: number | undefined; isLoading: boolean }
  >
  startIndex: number
  onPrefetchEnter: (item: SidebarItemDetail) => void
  onPrefetchLeave: () => void
  onEditShelf: (shelfUuid: string) => void
  onHideItem: (itemUuid: string) => void
  onHideAll: () => void
  // present only for the special collections/shelves groups, which also get
  // the header count badge and the hide-all/create/see-all menu
  onCreateNew?: () => void
}) {
  const t = useTranslation("AppSidebar")
  const tLibrary = useTranslation("LibraryPage")
  const permissions = usePermissions()
  const router = useRouter()
  const dispatch = useAppDispatch()
  const collapsedGroups = useAppSelector(selectCollapsedSidebarGroups)
  const isCollapsed = collapsedGroups[group.uuid] ?? false
  const { state: shellState, isMobile } = useSidebar()
  const isIconCollapsed = shellState === "collapsed" && !isMobile

  // header count for the special groups; RTK dedupes these across groups
  const { data: collections = [] } = useListCollectionsQuery()
  const { data: rawShelves = [] } = useListUserShelvesQuery()

  const visibleItems = group.items.filter((item) => {
    if (item.hidden) return false
    // hide builtins the user lacks the permission for (e.g. alignment-quality).
    if (item.kind === "builtin" && item.builtinKey) {
      const builtin = BUILTIN_SIDEBAR_MAP[item.builtinKey]
      if (builtin?.permission && !permissions?.[builtin.permission])
        return false
    }
    return true
  })

  if (visibleItems.length === 0) return null

  const builtinTitle = (builtin: BuiltinSidebarItem) =>
    builtin.labelNs === "AppSidebar"
      ? t(builtin.labelKey)
      : tLibrary(builtin.labelKey)

  const renderItem = (item: SidebarItemDetail, index: number) => (
    <SidebarNavItem
      key={item.uuid}
      index={index + startIndex}
      item={item}
      builtinTitle={builtinTitle}
      libraryCounts={libraryCounts}
      onPrefetchEnter={onPrefetchEnter}
      onPrefetchLeave={onPrefetchLeave}
      onEdit={
        item.kind === "shelf" && item.shelfUuid
          ? () => {
              onEditShelf(item.shelfUuid as string)
            }
          : undefined
      }
      onRemove={() => {
        onHideItem(item.uuid)
      }}
    />
  )

  // "Main" group renders without a collapsible header
  if (group.kind === "main") {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu className="gap-1">
            {visibleItems.map(renderItem)}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  }

  const isCollectionGroup = group.kind === "collections"
  const isSpecial = isCollectionGroup || group.kind === "shelves"
  const totalCount = isSpecial
    ? isCollectionGroup
      ? collections.length
      : rawShelves.length
    : null

  return (
    <Collapsible
      open={!isCollapsed}
      onOpenChange={(open) => {
        dispatch(
          uiSettingsSlice.actions.toggleSidebarGroupCollapsed({
            groupId: group.uuid,
            collapsed: !open,
          }),
        )
      }}
    >
      <SidebarGroup className="py-0">
        <div className="group/group-header relative">
          <CollapsibleTrigger
            render={
              <button className="relative w-full cursor-pointer gap-1.5 font-sans">
                {/* {isIconCollapsed && (
                  <div className="bg-sidebar-foreground/50 absolute inset-x-4 top-4 z-10 h-px" />
                )} */}
                <SidebarGroupLabel className="w-full gap-1.5 pr-1 group-data-[collapsible=icon]:gap-0">
                  <icon.ChevronRight
                    className={cn(
                      "text-muted-foreground size-3 shrink-0 stroke-[1.5] opacity-100 transition-transform duration-200",
                      "group-data-[collapsible=icon]:opacity-0",
                      "group-data-[collapsible=icon]:w-0",
                      !isCollapsed && "rotate-90",
                    )}
                  />
                  <span
                    className={cn(
                      // "text-xs",

                      "small-caps",
                      "group-data-[collapsible=icon]:opacity-0",
                      "group-data-[collapsible=icon]:w-0",

                      "tracking-[0.08em]",
                      // ATKINS
                      // "font-medium tracking-[0.12em] uppercase opacity-70",
                      // "opacity-70",
                    )}
                  >
                    {group.name}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "bg-muted-foreground/60 group-data-[collapsible=icon]:bg-muted-foreground h-px min-w-3 flex-1 group-data-[collapsible=icon]:ml-0.75 group-data-[collapsible=icon]:max-w-6 group-data-[collapsible=icon]:min-w-6",
                      totalCount == null &&
                        "mr-3 group-data-[collapsible=icon]:mr-0",
                    )}
                  />
                  {totalCount != null && (
                    <span className="text-sidebar-foreground/60 mr-2 flex h-5 min-w-5 items-center justify-center text-[11px] tabular-nums opacity-100 transition-opacity group-hover/group-header:opacity-0 group-has-data-popup-open/group-header:opacity-0 group-data-[collapsible=icon]:opacity-0">
                      {totalCount}
                    </span>
                  )}
                </SidebarGroupLabel>
              </button>
            }
          />

          {isSpecial && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarGroupAction className="top-1.5 right-3 opacity-0 transition-opacity group-focus-within/group-header:opacity-100 group-hover/group-header:opacity-100 data-popup-open:opacity-100">
                    <icon.DotsVertical className="size-3.5" />
                  </SidebarGroupAction>
                }
              />

              <DropdownMenuContent side="right" align="start">
                <DropdownMenuItem onClick={onHideAll}>
                  <icon.EyeOff className="mr-2 size-4" />
                  {isCollectionGroup ? t("hideCollections") : t("hideShelves")}
                </DropdownMenuItem>

                {onCreateNew && (
                  <DropdownMenuItem onClick={onCreateNew}>
                    <icon.Plus className="mr-2 size-4" />
                    {isCollectionGroup
                      ? t("createNewCollection")
                      : t("createNewShelf")}
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  onClick={() => {
                    router.push(
                      isCollectionGroup
                        ? "/collections?item=_none"
                        : "/shelves?item=_none",
                    )
                  }}
                >
                  <icon.ArrowRight className="mr-2 size-4" />
                  {isCollectionGroup
                    ? t("seeAllCollections")
                    : t("seeAllShelves")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {visibleItems.map(renderItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}

function SidebarNavItem({
  index,
  item,
  builtinTitle,
  libraryCounts,
  onPrefetchEnter,
  onPrefetchLeave,
  onEdit,
  onRemove,
}: {
  index: number
  item: SidebarItemDetail
  builtinTitle: (builtin: BuiltinSidebarItem) => string
  libraryCounts: Record<
    string,
    { count: number | undefined; isLoading: boolean }
  >
  onPrefetchEnter: (item: SidebarItemDetail) => void
  onPrefetchLeave: () => void
  onEdit?: () => void
  onRemove?: () => void
}) {
  const t = useTranslation("AppSidebar")
  const isAltHeld = useKeyHold("Alt")
  const [firstKey, secondKey] = String(index + 1)
    .padStart(2, "0")
    .split("")

  const router = useRouter()

  const location = usePathname()
  const basePath = useVersionBasePath()
  const normalizedLocation = basePath
    ? location.replace(basePath, "")
    : location

  useHotkeySequence(
    [`Alt+${firstKey}` as Hotkey, `Alt+${secondKey}` as Hotkey],
    () => {
      if (!resolved) return
      router.push(resolved.url)
    },
    {
      conflictBehavior: "replace",
      timeout: 1_000,
    },
  )
  const [tooltipOpen, setTooltipOpen] = useState(false)

  const resolved = resolveItem(item, builtinTitle)
  if (!resolved) return null

  const isActive =
    normalizedLocation === resolved.url ||
    (resolved.url !== "/" && normalizedLocation.startsWith(resolved.url))

  const countResult = resolved.countKey
    ? libraryCounts[resolved.countKey]
    : null
  const count = countResult?.count
  const isCountLoading = countResult?.isLoading ?? false

  const isEntity = item.kind === "shelf" || item.kind === "collection"

  return (
    <SidebarMenuItem
      onPointerEnter={() => {
        if (!isActive) onPrefetchEnter(item)
      }}
      onPointerLeave={onPrefetchLeave}
    >
      <Tooltip
        open={tooltipOpen || isAltHeld}
        delay={500}
        onOpenChange={setTooltipOpen}
      >
        <TooltipTrigger
          render={
            <SidebarMenuButton
              size="sm"
              isActive={isActive}
              render={
                <V3Link href={resolved.url}>
                  {resolved.customIcon ? (
                    <DynamicIcon
                      iconId={resolved.customIcon}
                      color={resolved.color}
                      className="size-3.5! stroke-[1.5]"
                    />
                  ) : resolved.icon ? (
                    <resolved.icon className="size-3.5! stroke-[1.5]" />
                  ) : null}
                  <span>{resolved.title}</span>
                </V3Link>
              }
            />
          }
        />
        <TooltipContent side="right">
          <KeyboardShortcut
            shortcut={[`Alt+${firstKey}` as Hotkey, secondKey as Hotkey]}
          />
        </TooltipContent>
      </Tooltip>

      {isEntity ? (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuAction showOnHover className="peer/item-action">
                  <icon.DotsVertical className={"hidden size-3.5 md:block"} />
                </SidebarMenuAction>
              }
            />
            <DropdownMenuContent side="right" align="start">
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <icon.Edit className="mr-2 size-4" />
                  {t("editItem")}
                </DropdownMenuItem>
              )}
              {onRemove && (
                <DropdownMenuItem onClick={onRemove}>
                  <icon.EyeOff className="mr-2 size-4" />
                  {t("removeFromSidebar")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <SidebarMenuBadge className="group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0 peer-data-popup-open/item-action:opacity-0">
            {count != null ? (
              count
            ) : isCountLoading ? (
              <Skeleton className="h-3.5 w-5 rounded" />
            ) : null}
          </SidebarMenuBadge>
        </>
      ) : (
        <>
          {count != null && <SidebarMenuBadge>{count}</SidebarMenuBadge>}

          {count == null && isCountLoading && resolved.countKey && (
            <SidebarMenuBadge>
              <Skeleton className="h-3.5 w-5 rounded" />
            </SidebarMenuBadge>
          )}
        </>
      )}
    </SidebarMenuItem>
  )
}

function ShelfEditorFromSidebar({
  shelfUuid,
  onClose,
}: {
  shelfUuid: string | null
  onClose: () => void
}) {
  const { data: rawShelves = [] } = useListUserShelvesQuery()

  // kysely inference loses selectAll fields; runtime data has all shelf columns
  const shelves = rawShelves as unknown as Array<
    ShelfWithBooks & { uuid: string }
  >

  const shelf = shelfUuid
    ? shelves.find((s) => s.uuid === shelfUuid) ?? null
    : null

  return (
    <ShelfEditor
      open={!!shelfUuid}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      shelf={shelf}
    />
  )
}

type ResolvedItem = {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }> | null
  customIcon: string | null
  color: string | null
  countKey: string | null
}

function resolveItem(
  item: SidebarItemDetail,
  builtinTitle: (builtin: BuiltinSidebarItem) => string,
): ResolvedItem | null {
  if (item.kind === "builtin" && item.builtinKey) {
    const builtin = BUILTIN_SIDEBAR_MAP[item.builtinKey]
    if (!builtin) return null

    return {
      title: builtinTitle(builtin),
      url: builtin.href,
      icon: builtin.icon,
      customIcon: null,
      color: null,
      countKey: builtin.countKey ?? null,
    }
  }

  if (item.kind === "collection") {
    return {
      title: extractEmojiIcon(item.name ?? "").label || (item.name ?? ""),
      url: `/collections/${item.collectionUuid}`,
      icon: item.icon ? null : COLLECTION_ICON,
      customIcon: item.icon,
      color: item.color,
      countKey: `collection:${item.collectionUuid}`,
    }
  }

  if (item.kind === "shelf") {
    return {
      title: extractEmojiIcon(item.name ?? "").label || (item.name ?? ""),
      url: `/shelves/${item.shelfUuid}`,
      icon: item.icon ? null : SHELF_ICON,
      customIcon: item.icon,
      color: item.color,
      countKey: `shelf:${item.shelfUuid}`,
    }
  }

  return null
}
