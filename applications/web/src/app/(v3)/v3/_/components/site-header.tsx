"use client"

import { Fragment, type ReactNode } from "react"

import { Button } from "@v3/_/components/ui/button"
import { useSidebarMaybe } from "@v3/_/components/ui/sidebar"
import { V3Link } from "@v3/_/components/v3-link"

import { cn } from "@/cn"
import * as icon from "@/icons"

type Breadcrumb = { label: string; url?: string } | { render: ReactNode }

export function SiteHeader({
  breadcrumbs,
  actions,
  afterTitle,
  className,
}: {
  breadcrumbs: Breadcrumb[]
  actions?: ReactNode
  // rendered inline right after the current title (e.g. a "X of Y" count)
  afterTitle?: ReactNode
  className?: string
}) {
  const parents = breadcrumbs.slice(0, -1)
  const current = breadcrumbs.at(-1)

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)",
          className,
        )}
      >
        <div className="flex w-full min-w-0 items-center gap-3 px-3 pl-5">
          {current && (
            <div className="flex min-w-0 flex-col justify-center">
              {parents.length > 0 && (
                <div className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
                  {parents.map((crumb, idx) => (
                    <Fragment
                      key={"render" in crumb ? idx : crumb.url ?? crumb.label}
                    >
                      {idx > 0 && (
                        <span aria-hidden className="opacity-50">
                          /
                        </span>
                      )}
                      {"render" in crumb ? (
                        crumb.render
                      ) : crumb.url ? (
                        <V3Link
                          href={crumb.url}
                          className="hover:text-foreground truncate transition-colors"
                        >
                          {crumb.label}
                        </V3Link>
                      ) : (
                        <span className="truncate">{crumb.label}</span>
                      )}
                    </Fragment>
                  ))}
                  <span aria-hidden className="opacity-50">
                    /
                  </span>
                </div>
              )}
              <div className="flex min-w-0 items-baseline gap-2">
                {"render" in current ? (
                  current.render
                ) : (
                  <h1 className="min-w-0">
                    <span className="font-heading font-tracking-tight block truncate text-lg leading-tight font-normal">
                      {current.label}
                    </span>
                  </h1>
                )}
                {afterTitle && (
                  <div className="flex shrink-0 items-center">{afterTitle}</div>
                )}
              </div>
            </div>
          )}

          {actions && (
            <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
              {actions}
            </div>
          )}
        </div>
      </header>

      {/* mobile only: reclaims the header space the inline trigger used to eat */}
      <MobileSidebarToggle />
    </>
  )
}

function MobileSidebarToggle() {
  const sidebar = useSidebarMaybe()
  if (!sidebar) return null

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Open navigation"
      onClick={sidebar.toggleSidebar}
      className="bg-background/90 fixed bottom-4 left-4 z-30 size-11 rounded-full shadow-lg backdrop-blur md:hidden"
    >
      <icon.LayoutSidebar className="size-4" />
    </Button>
  )
}
