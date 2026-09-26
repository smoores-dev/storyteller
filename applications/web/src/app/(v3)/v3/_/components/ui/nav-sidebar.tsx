"use client"

import { useHotkey } from "@tanstack/react-hotkeys"
import { usePathname } from "next/navigation"
import { useRef } from "react"

import { SearchInput } from "@v3/_/components/books/SearchInput"
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@v3/_/components/ui/sidebar"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { V3Link } from "@v3/_/components/v3-link"
import { cn } from "@v3/_/lib/utils"

export type NavSidebarTab<T extends string = string> = {
  value: T
  label: string
  icon: React.ComponentType<{ className?: string }>
}

function NavSidebar({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="nav-sidebar"
      className={cn("flex h-full flex-col", className)}
      {...props}
    >
      {children}
    </div>
  )
}

function NavSidebarBody({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <SidebarContent
      data-slot="nav-sidebar-body"
      className={cn("gap-4 px-2 py-3", className)}
      {...props}
    >
      {children}
    </SidebarContent>
  )
}

function NavSidebarGroup({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { label: string }) {
  return (
    <SidebarGroup
      data-slot="nav-sidebar-group"
      className={cn("p-0", className)}
      {...props}
    >
      <SidebarGroupLabel className="text-muted-foreground mb-1.5 h-auto font-medium">
        {label}
      </SidebarGroupLabel>
      {children}
    </SidebarGroup>
  )
}

function NavSidebarSearch({
  shortcut = ["/"],
  className,
  ...props
}: React.ComponentProps<typeof SearchInput>) {
  const inputRef = useRef<HTMLInputElement>(null)
  useHotkey(
    shortcut[0] ?? "/",
    () => {
      inputRef.current?.focus()
    },
    { ignoreInputs: true },
  )

  return (
    <div className={cn("px-1", className)}>
      <SearchInput ref={inputRef} shortcut={shortcut} {...props} />
    </div>
  )
}

function NavSidebarList<T extends string>({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: NavSidebarTab<T>[]
  activeTab: T | null
  onTabChange: (tab: T) => void
}) {
  return (
    <SidebarGroupContent data-slot="nav-sidebar-list">
      <SidebarMenu className="gap-0.5">
        {tabs.map((tab) => (
          <NavSidebarItem
            key={tab.value}
            tab={tab}
            active={activeTab === tab.value}
            onSelect={onTabChange}
          />
        ))}
      </SidebarMenu>
    </SidebarGroupContent>
  )
}

function NavSidebarItem<T extends string>({
  tab,
  active,
  onSelect,
}: {
  tab: NavSidebarTab<T>
  active: boolean
  onSelect: (tab: T) => void
}) {
  const pathname = usePathname()
  const href = `${pathname}?tab=${tab.value}`

  return (
    <SidebarMenuItem className="px-0">
      <SidebarMenuButton
        isActive={active}
        className={cn(!active && "text-muted-foreground hover:text-foreground")}
        render={
          <V3Link
            href={href}
            onClick={(e) => {
              e.preventDefault()
              onSelect(tab.value)
            }}
          >
            <tab.icon className="size-4 shrink-0" />
            <span className="truncate">{tab.label}</span>
          </V3Link>
        }
      />
    </SidebarMenuItem>
  )
}

function NavSidebarHeader({
  title,
  link,
}: {
  title: string
  link?: {
    href: string
    icon: React.ComponentType<{ className?: string }>
    label: string
  }
}) {
  return (
    <div
      data-slot="nav-sidebar-header"
      className="@container/nav-header flex h-(--header-height) shrink-0 items-center justify-between gap-2 px-4"
    >
      <h2 className="font-heading text-foreground truncate text-lg font-medium">
        {title}
      </h2>
      {link && (
        <TooltipButton
          variant="ghost"
          size="sm"
          tooltip={link.label}
          aria-label={link.label}
          nativeButton={false}
          className="text-muted-foreground hover:text-foreground shrink-0 font-normal"
          render={
            <V3Link href={link.href}>
              <link.icon className="size-4" />
              <span className="hidden @[16rem]/nav-header:inline">
                {link.label}
              </span>
            </V3Link>
          }
        />
      )}
    </div>
  )
}

function NavSidebarEmpty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground px-3 text-sm">{children}</p>
}

export {
  NavSidebar,
  NavSidebarBody,
  NavSidebarEmpty,
  NavSidebarGroup,
  NavSidebarHeader,
  NavSidebarItem,
  NavSidebarList,
  NavSidebarSearch,
}
