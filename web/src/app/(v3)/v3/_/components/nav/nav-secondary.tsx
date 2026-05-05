"use client"

import { type TablerIcon } from "@tabler/icons-react"
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

export type NavSecondaryItem =
  | ({
      title: string
      icon: TablerIcon
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
  const curretPathWithoutV3 = currentPath.replace("/v3", "")
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
              currentPath === item.url ||
              (!!item.url &&
                item.url !== "/" &&
                curretPathWithoutV3.startsWith(item.url))

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
                      <V3Link href={item.url}>
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
