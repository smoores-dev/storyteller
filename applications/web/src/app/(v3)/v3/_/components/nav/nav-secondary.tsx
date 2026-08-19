"use client"

import { usePathname } from "next/navigation"
import * as React from "react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@v3/_/components/ui/sidebar"
import { V3Link } from "@v3/_/components/v3-link"
import { useVersionBasePath } from "@v3/_/components/version-context"

import { type StyledIcon } from "@/icons"

export type NavSecondaryItem =
  | ({
      title: string
      icon: StyledIcon
      badge?: React.ReactNode
    } & (
      | {
          url?: never
          onClick: () => void
        }
      | {
          url: string
          onClick?: never
        }
    ))
  | { custom: React.ReactNode; key: string }

export function NavSecondary({
  items,
  ...props
}: {
  items: NavSecondaryItem[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const currentPath = usePathname()
  const basePath = useVersionBasePath()
  const normalizedPath = basePath
    ? currentPath.replace(basePath, "")
    : currentPath

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => {
            if ("custom" in item) {
              return (
                <React.Fragment key={item.key}>{item.custom}</React.Fragment>
              )
            }
            const isItemActive =
              normalizedPath === item.url ||
              (!!item.url &&
                item.url !== "/" &&
                normalizedPath.startsWith(item.url))

            return (
              <SidebarMenuItem key={item.title}>
                {item.onClick ? (
                  <SidebarMenuButton size="sm" onClick={item.onClick}>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton
                    size="sm"
                    isActive={isItemActive}
                    render={
                      <V3Link prefetch={true} href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </V3Link>
                    }
                  />
                )}

                {item.badge && (
                  <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
