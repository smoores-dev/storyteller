"use client"

import { IconChevronRight, IconX, type TablerIcon } from "@tabler/icons-react"
import { usePathname } from "next/navigation"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@v3/_/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@v3/_/components/ui/sidebar"
import { V3Link } from "@v3/_/components/v3-link"
import { useSidebarState } from "@v3/_/hooks/use-sidebar-state"

export type NavSubItem = {
  title: string
  url: string
  icon?: string | React.ReactNode
  onRemove?: () => void
}

export type NavItem = {
  title: string
  allTitle?: string
  url: string
  icon?: TablerIcon
  isCollapsible?: boolean
  subItems?: NavSubItem[]
}

export function NavMain({ items }: { items: NavItem[] }) {
  const location = usePathname()
  const { isSectionOpen, setSectionOpen } = useSidebarState()

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => {
            if (item.isCollapsible && item.subItems) {
              return (
                <CollapsibleNavItem
                  key={item.title}
                  item={item}
                  currentPath={location}
                  isSectionOpen={isSectionOpen}
                  setSectionOpen={setSectionOpen}
                  allTitle={item.allTitle ?? item.title}
                />
              )
            }

            const isActive =
              location === item.url ||
              (item.url !== "/" && location.startsWith(`/v3${item.url}`))

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  size="sm"
                  isActive={isActive}
                  render={
                    <V3Link href={item.url}>
                      {item.icon && <item.icon />}
                      <span>{item.title}</span>
                    </V3Link>
                  }
                />
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function CollapsibleNavItem({
  item,
  currentPath,
  isSectionOpen,
  setSectionOpen,
  allTitle,
}: {
  item: NavItem
  currentPath: string
  isSectionOpen: (id: string, defaultOpen: boolean) => boolean
  setSectionOpen: (id: string, open: boolean) => void
  allTitle: string
}) {
  const isItemActive =
    currentPath === item.url ||
    (item.url !== "/" && currentPath.startsWith(item.url))

  const sectionId = `nav-${item.title.toLowerCase()}`
  const isOpen = isSectionOpen(sectionId, isItemActive)

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={(open) => {
        setSectionOpen(sectionId, open)
      }}
      className="group/collapsible"
      render={
        <SidebarMenuItem>
          <CollapsibleTrigger
            render={
              <SidebarMenuButton tooltip={item.title} isActive={isItemActive}>
                {item.icon && <item.icon />}
                <span>{item.title}</span>
                <IconChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </SidebarMenuButton>
            }
          />
          <CollapsibleContent>
            <SidebarMenuSub>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  size="sm"
                  isActive={isItemActive}
                  render={
                    <V3Link href={item.url}>
                      <span>{allTitle}</span>
                    </V3Link>
                  }
                />
              </SidebarMenuSubItem>
              {item.subItems?.map((subItem) => {
                const isSubActive = currentPath === subItem.url
                return (
                  <SidebarMenuSubItem
                    key={subItem.url}
                    className="group/subitem"
                  >
                    <SidebarMenuSubButton
                      size="sm"
                      isActive={isSubActive}
                      render={
                        <V3Link href={subItem.url}>
                          {typeof subItem.icon === "string" ? (
                            <span className="flex h-4 w-4 items-center justify-center text-xs">
                              {subItem.icon}
                            </span>
                          ) : (
                            subItem.icon
                          )}
                          <span className="flex-1 truncate">
                            {subItem.title}
                          </span>
                          {subItem.onRemove && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                subItem.onRemove?.()
                              }}
                              className="text-muted-foreground hover:text-destructive ml-auto opacity-0 transition-opacity group-hover/subitem:opacity-100"
                            >
                              <IconX className="h-3 w-3" />
                            </button>
                          )}
                        </V3Link>
                      }
                    />
                  </SidebarMenuSubItem>
                )
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      }
    />
  )
}
