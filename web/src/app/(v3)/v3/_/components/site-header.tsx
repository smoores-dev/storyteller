"use client"

import Link from "next/link"
import { Fragment } from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@v3/_/components/ui/breadcrumb"
import { Separator } from "@v3/_/components/ui/separator"
import { SidebarTrigger } from "@v3/_/components/ui/sidebar"

export function SiteHeader({
  breadcrumbs,
  actions,
}: {
  breadcrumbs: {
    label: string
    url?: string
  }[]
  actions?: React.ReactNode
}) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full min-w-0 items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <>
          {/* Mobile only */}
          <SidebarTrigger className="-ml-1 block shrink-0 md:hidden" />
          <Separator
            orientation="vertical"
            className="mx-2 block shrink-0 data-[orientation=vertical]:h-6 md:hidden"
          />
        </>
        <Breadcrumb className="min-w-0 shrink-0">
          <BreadcrumbList className="flex-nowrap">
            {breadcrumbs.map((breadcrumb, idx) => (
              <Fragment key={breadcrumb.url ?? breadcrumb.label}>
                <BreadcrumbItem className="min-w-0">
                  {breadcrumb.url ? (
                    <BreadcrumbLink
                      href={breadcrumb.url}
                      className="truncate"
                      render={
                        <Link href={breadcrumb.url}>{breadcrumb.label}</Link>
                      }
                    />
                  ) : idx === breadcrumbs.length - 1 ? (
                    <h1 className="min-w-0 text-xs font-medium">
                      <BreadcrumbPage className="truncate">
                        {breadcrumb.label}
                      </BreadcrumbPage>
                    </h1>
                  ) : (
                    <BreadcrumbPage className="truncate">
                      {breadcrumb.label}
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {idx < breadcrumbs.length - 1 && (
                  <BreadcrumbSeparator className="shrink-0" />
                )}
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        {actions && (
          <div className="ml-auto flex min-w-0 flex-1 justify-end">
            {actions}
          </div>
        )}
      </div>
    </header>
  )
}
