"use client"

import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@v3/_/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@v3/_/components/ui/tooltip"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"

import * as icon from "@/icons"
import { useAppDispatch } from "@/store/appState"
import { uiSettingsSlice } from "@/store/slices/uiSettingsSlice"

import { JobStatusGlyph } from "./JobStatusGlyph"
import { StaticProgressBar } from "./ProgressVisualization"
import { useProcessingQueue } from "./useProcessingQueue"

export function ProcessingSidebarItem() {
  const t = useTranslation("SettingsPage.tabs.queue")
  const dispatch = useAppDispatch()
  const { current, view, percent, headline, queuedCount } = useProcessingQueue()

  if (!current || !view) return null

  const title = current.bookTitle ?? t.plain("untitled")
  const summary = [
    headline,
    `${percent}%`,
    queuedCount > 0 ? `+${queuedCount}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <SidebarMenuItem>
      <Tooltip delay={500}>
        <TooltipTrigger
          render={
            <SidebarMenuButton
              size="lg"
              className="h-auto flex-col items-stretch gap-0.5 py-1.5 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:py-0"
              render={
                <V3Link href="/settings?tab=queue">
                  <span className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:justify-center">
                    <JobStatusGlyph
                      status={current.status}
                      className="size-3.5! shrink-0"
                    />
                    <span className="min-w-0 truncate group-data-[collapsible=icon]:hidden">
                      {title}
                    </span>
                  </span>
                  <span className="text-sidebar-foreground/70 truncate pl-5.5 text-[11px] tabular-nums group-data-[collapsible=icon]:hidden">
                    {summary}
                  </span>
                  <StaticProgressBar
                    view={view}
                    className="ml-5.5 h-0.5 w-auto flex-none group-data-[collapsible=icon]:hidden"
                  />
                </V3Link>
              }
            />
          }
        />
        <TooltipContent side="right">
          <span className="block">{t("toast.openQueue")}</span>
          <span className="text-muted-foreground block text-xs">
            {title} · {summary}
          </span>
        </TooltipContent>
      </Tooltip>

      <SidebarMenuAction
        showOnHover
        className="top-1.5"
        render={
          <TooltipButton
            variant="ghost"
            className="hover:text-sidebar-primary! size-5"
            tooltip={t.plain("toast.popOut")}
            aria-label={t.plain("toast.popOut")}
            onClick={() => {
              dispatch(
                uiSettingsSlice.actions.setProcessingToastLocation("floating"),
              )
            }}
          >
            <icon.Outbound className="size-3.5" />
          </TooltipButton>
        }
      />
    </SidebarMenuItem>
  )
}
