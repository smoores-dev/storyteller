"use client"

import { type TablerIcon } from "@tabler/icons-react"
import * as React from "react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@v3/_/components/ui/sidebar"
import { V3Link } from "@v3/_/components/v3-link"

export type NavSecondaryItem =
  | ({
      title: string
      icon: TablerIcon
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
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) =>
            "custom" in item ? (
              <React.Fragment key={item.key}>{item.custom}</React.Fragment>
            ) : (
              <SidebarMenuItem key={item.title}>
                {item.onClick ? (
                  <SidebarMenuButton size="sm" onClick={item.onClick}>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton
                    size="sm"
                    render={
                      <V3Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </V3Link>
                    }
                  />
                )}
              </SidebarMenuItem>
            ),
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
