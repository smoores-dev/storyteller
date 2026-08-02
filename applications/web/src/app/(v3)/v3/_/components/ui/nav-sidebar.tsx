"use client"

import { useHotkey } from "@tanstack/react-hotkeys"
import { useRef } from "react"

import { SearchInput } from "@v3/_/components/books/SearchInput"
import { Button } from "@v3/_/components/ui/button"
import { V3Link } from "@v3/_/components/v3-link"
import { cn } from "@v3/_/lib/utils"
import { usePathname } from "next/navigation"

/**
 * composable settings-style sidebar: grouped vertical tab lists with an
 * optional search box and a footer link. shared by the preferences and
 * settings forms, which differ only in their groups, tabs and search wiring.
 *
 * usage:
 *   <NavSidebar>
 *     <NavSidebarBody>
 *       <NavSidebarGroup label="Preferences">
 *         <NavSidebarSearch value={q} onChange={setQ} placeholder="Search" />
 *         <NavSidebarList tabs={tabs} activeTab={tab} onTabChange={setTab} />
 *       </NavSidebarGroup>
 *     </NavSidebarBody>
 *     <NavSidebarFooterLink href="/settings" icon={icon.Settings} label="Settings" />
 *   </NavSidebar>
 */

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
      className={cn("scroll-y flex h-full flex-col", className)}
      {...props}
    >
      {children}
    </div>
  )
}

/** padded column holding the groups; footer sits below via its own mt-auto. */
function NavSidebarBody({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="nav-sidebar-body"
      className={cn("flex flex-col gap-4 px-2 pt-3 pb-3", className)}
      {...props}
    >
      {children}
    </div>
  )
}

/** a labelled group; children are a NavSidebarList, optionally led by a search. */
function NavSidebarGroup({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { label: string }) {
  return (
    <div data-slot="nav-sidebar-group" className={className} {...props}>
      <p className="text-muted-foreground mb-1.5 px-2 text-xs font-medium tracking-wider uppercase">
        {label}
      </p>
      {children}
    </div>
  )
}

/**
 * search box that focuses on "/" (or the first key in `shortcut`). owns its own
 * input ref + hotkey so callers don't repeat that wiring.
 */
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
    <div className={cn("mb-2 px-1", className)}>
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
    <div data-slot="nav-sidebar-list" className="flex flex-col gap-0.5">
      {tabs.map((tab) => (
        <NavSidebarItem
          key={tab.value}
          tab={tab}
          active={activeTab === tab.value}
          onSelect={onTabChange}
        />
      ))}
    </div>
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
    <V3Link
      href={href}
      onClick={(e) => {
        e.preventDefault()
        onSelect(tab.value)
      }}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        active
          ? "text-sidebar-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
      )}
    >
      <tab.icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{tab.label}</span>
    </V3Link>
  )
}

/** bottom-pinned link to the sibling settings/preferences page. */
function NavSidebarFooterLink({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <div className="border-border mt-auto border-t py-3">
      <Button
        variant="real-ghost"
        size="sm"
        nativeButton={false}
        className="text-muted-foreground hover:text-foreground w-full justify-start gap-2 font-normal"
        render={
          <V3Link href={href}>
            <Icon className="h-4 w-4" />
            {label}
          </V3Link>
        }
      />
    </div>
  )
}

export {
  NavSidebar,
  NavSidebarBody,
  NavSidebarFooterLink,
  NavSidebarGroup,
  NavSidebarItem,
  NavSidebarList,
  NavSidebarSearch,
}
