"use client"

import { Fragment, type ReactNode } from "react"

import { Button } from "@v3/_/components/ui/button"
import { useSidebarMaybe } from "@v3/_/components/ui/sidebar"
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { cn } from "@/cn"
import * as icon from "@/icons"

export type Breadcrumb = { label: string; url?: string } | { render: ReactNode }

export function SiteHeader({
  breadcrumbs,
  actions,
  afterTitle,
  className,
}: {
  breadcrumbs: [Breadcrumb, ...Breadcrumb[]] | null
  actions?: ReactNode
  afterTitle?: ReactNode
  className?: string
}) {
  const parents = breadcrumbs?.slice(0, -1)
  const current = breadcrumbs?.at(-1)

  return (
    <header
      className={cn(
        "bg-background sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)",
        className,
      )}
    >
      <div className="flex w-full min-w-0 items-center gap-2 px-3 pl-4 md:gap-3">
        <MobileSidebarToggle />
        {breadcrumbs && current && (
          <div className="pointer-events-auto flex min-w-0 flex-col justify-center">
            {parents && parents.length > 0 && (
              <div className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
                {parents.map((crumb, idx) => (
                  <Fragment
                    key={"render" in crumb ? idx : (crumb.url ?? crumb.label)}
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
                  <span className="font-heading font-tracking-tight block truncate leading-tight font-normal md:text-lg">
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
          <div className="pointer-events-auto ml-auto flex shrink-0 items-center justify-end gap-2">
            {actions}
          </div>
        )}
      </div>
    </header>
  )
}

function MobileSidebarToggle() {
  const sidebar = useSidebarMaybe()
  const t = useTranslation("AppSidebar")
  if (!sidebar) return null

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t.plain("openNavigation")}
      onClick={sidebar.toggleSidebar}
      className="text-muted-foreground/70 pointer-events-auto -mr-1 -mb-0.5 -ml-1 shrink-0 md:hidden"
    >
      <icon.LayoutSidebar className="size-5" />
    </Button>
  )
}
