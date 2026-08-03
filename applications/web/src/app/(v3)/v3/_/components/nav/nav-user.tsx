"use client"

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
import { useVersionBasePath } from "@v3/_/components/version-context"
import { useTranslation } from "@v3/_/hooks/use-translation"

import * as icon from "@/icons"
import { api } from "@/store/api"
import { useAppDispatch } from "@/store/appState"

export function NavUser({
  user,
}: {
  user: {
    name: string | null
    email: string | null
    username: string | null
  }
}) {
  const { isMobile } = useSidebar()
  const basePath = useVersionBasePath()

  const displayName = user.name ?? user.username ?? "User"

  const t = useTranslation("AppSidebar")
  const dispatch = useAppDispatch()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="default"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:p-1!"
                style={{ scrollbarWidth: "none" }}
                aria-label={t("account")}
              >
                <div className="grid w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden data-[state=open]:w-auto">
                  <span className="truncate font-medium">{displayName}</span>
                  {user.name && (
                    <span className="text-sidebar-foreground/60 truncate font-sans text-xs">
                      {user.username}
                    </span>
                  )}
                </div>
                <icon.DotsVertical className="size-4 data-[collapsible=icon]:-ml-4!" />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            className="z-0 min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            // sidebar is obscuring it
            sideOffset={12}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{displayName}</span>

                    {user.username && (
                      <span className="text-muted-foreground truncate text-xs">
                        {user.username}
                      </span>
                    )}
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                nativeButton={false}
                render={
                  <Link
                    href={`${basePath}/preferences?tab=general`}
                    className="flex items-center gap-2"
                  >
                    <icon.Settings2 />
                    {t("account")}
                  </Link>
                }
              />

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
              <LocaleChanger nested />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link
                  href={`/logout?redirectTo=${encodeURIComponent(`${basePath}/login`)}`}
                  // lmao this would log you out otherwise
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
