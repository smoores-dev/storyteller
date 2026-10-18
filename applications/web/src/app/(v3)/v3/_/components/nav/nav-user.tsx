"use client"

import { useHotkey } from "@tanstack/react-hotkeys"
import Link from "next/link"

import { LocaleChanger } from "@v3/_/components/locale-changer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@v3/_/components/ui/sidebar"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { V3Link } from "@v3/_/components/v3-link"
import { useVersionBasePath } from "@v3/_/components/version-context"
import { useTheme } from "@v3/_/hooks/use-theme"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { usePermission } from "@/hooks/usePermission"
import * as icon from "@/icons"
import { api } from "@/store/api"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { selectTheme } from "@/store/slices/uiSettingsSlice"

import { CreateMenu } from "./create-menu"

export function NavUser({
  user,
  onCustomize,
}: {
  user: {
    name: string | null
    email: string | null
    username: string | null
  }
  onCustomize: () => void
}) {
  const { isMobile } = useSidebar()
  const basePath = useVersionBasePath()
  const canAccessSettings = usePermission("settingsUpdate")

  const displayName = user.name ?? user.username ?? "User"

  const t = useTranslation("AppSidebar")
  const dispatch = useAppDispatch()
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

  return (
    <SidebarMenu className="border-sidebar-border w-full flex-row items-center justify-center gap-0.5 overflow-clip border-t py-1">
      <SidebarMenuItem className="opacity-100 group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
        <CreateMenu />
      </SidebarMenuItem>

      <SidebarMenuItem className="opacity-100 group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
        <TooltipButton
          aria-label={t.plain("toggleTheme")}
          variant="ghost"
          size="icon-lg"
          tooltip={t("toggleTheme")}
          shortcut={["Mod+Shift+L"]}
          render={
            <SidebarMenuButton onClick={toggleTheme} suppressHydrationWarning>
              {theme === "dark" ? (
                <icon.DarkMode />
              ) : theme === "system" ? (
                <icon.System />
              ) : (
                <icon.LightMode />
              )}
            </SidebarMenuButton>
          }
        />
      </SidebarMenuItem>

      {canAccessSettings && (
        <SidebarMenuItem className="opacity-100 group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
          <TooltipButton
            aria-label={t.plain("settings")}
            variant="ghost"
            size="icon-lg"
            tooltip={t("settings")}
            nativeButton={false}
            render={
              <SidebarMenuButton
                render={<V3Link prefetch={true} href={`/settings`} />}
              >
                <icon.Settings />
              </SidebarMenuButton>
            }
          />
        </SidebarMenuItem>
      )}

      <SidebarMenuItem className="group-data-[collapsible=icon]:-ml-14">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                className="group-data-[collapsible=icon]:p-1!"
                aria-label={t.plain("account")}
                // size="icon-lg"
              >
                <icon.DotsVertical className="size-4" />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            className="z-0 min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={12}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="py-0 font-normal">
                <div className="grid px-1 py-1.5 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{displayName}</span>

                  {user.username && (
                    <span className="text-muted-foreground truncate text-xs">
                      {user.username}
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                nativeButton={false}
                render={
                  <Link
                    href={`${basePath}/preferences`}
                    className="flex items-center gap-2"
                  >
                    <icon.Settings2 />
                    {t("account")}
                  </Link>
                }
              />

              <DropdownMenuItem onClick={onCustomize}>
                <icon.AdjustmentsHorizontal />
                {t("customize")}
              </DropdownMenuItem>

              <LocaleChanger nested />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                nativeButton={false}
                render={
                  <Link
                    href="https://storyteller-platform.gitlab.io/storyteller/"
                    className="flex items-center gap-2"
                  >
                    <icon.HelpCircle />
                    {t("documentation")}
                  </Link>
                }
              />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link
                  href={`/logout?redirectTo=${encodeURIComponent(`${basePath}/login`)}`}
                  prefetch={false}
                  className="flex items-center gap-2"
                  onClick={() => {
                    dispatch(api.util.invalidateTags(["CurrentUser"]))
                  }}
                >
                  <icon.Logout />
                  {t("logout")}
                </Link>
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
