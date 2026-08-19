"use client"

import { skipToken } from "@reduxjs/toolkit/query"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@v3/_/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import {
  Item,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@v3/_/components/ui/item"
import { V3Link } from "@v3/_/components/v3-link"
import { useVersionBasePath } from "@v3/_/components/version-context"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { Cover } from "@/app/(v3)/v3/_/components/books/Cover"
import { type PublicJob } from "@/database/jobs"
import * as icon from "@/icons"
import {
  getCoverUrl,
  useCancelJobMutation,
  useGetBookQuery,
  useGetJobsQuery,
  usePauseJobMutation,
  useResumeJobMutation,
} from "@/store/api"

import { ProgressVisualization } from "./ProgressVisualization"
import { jobToView, overallProgress } from "./shared"
import { useStageLabels } from "./useStageLabels"

export function ProcessingToast() {
  const { data: jobs } = useGetJobsQuery(
    { type: "active" },
    { pollingInterval: 30_000, skipPollingIfUnfocused: true },
  )
  const { data: finishedJobs } = useGetJobsQuery({ type: "finished", limit: 5 })
  const [cancelJob] = useCancelJobMutation()
  const [pauseJob] = usePauseJobMutation()
  const [resumeJob] = useResumeJobMutation()
  const [minimized, setMinimized] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)

  const t = useTranslation("Queue")
  const c = useCommon()
  const stageLabels = useStageLabels()
  const basePath = useVersionBasePath()
  const router = useRouter()

  useFinishedNotifications(finishedJobs, basePath, router)

  const active = (jobs ?? []).filter(
    (j) =>
      j["status"] === "RUNNING" ||
      j["status"] === "QUEUED" ||
      j["status"] === "PAUSED",
  )

  // ask for notification permission once a run is in progress
  const askedRef = useRef(false)
  useEffect(() => {
    if (active.length === 0 || askedRef.current) return
    askedRef.current = true
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission()
    }
  }, [active.length])

  const current = active.find((j) => j.status === "RUNNING") ?? active[0]

  const { data: book } = useGetBookQuery(
    current?.bookUuid
      ? {
          uuid: current.bookUuid,
        }
      : skipToken,
  )
  if (!current) return null
  if (dismissed === current.uuid) return null

  const view = jobToView(current)
  const pct = Math.round(overallProgress(view) * 100)
  const queuedCount = active.length - 1

  const headline =
    current.status === "PAUSED"
      ? t("toast.paused")
      : view.stage
        ? stageLabels[view.stage]
        : current.status === "QUEUED"
          ? t("toast.queued")
          : t("toast.processing")

  return (
    <div className="fixed right-4 bottom-4 z-50 w-[320px] max-w-[calc(100vw-2rem)]">
      <Item
        variant="outline"
        size="sm"
        className="bg-popover text-popover-foreground items-start shadow-lg"
      >
        {!minimized && (
          <ItemMedia variant="image" className="h-18! w-10! object-contain!">
            {book && <Cover interactive={false} book={book} width={96} />}
          </ItemMedia>
        )}

        <ItemContent className="gap-1.5">
          <ItemTitle className="max-w-full">
            <icon.Loader
              className={cn(
                "text-primary size-3.5 shrink-0",
                current.status !== "PAUSED" && "animate-spin",
              )}
            />
            {current.bookUuid ? (
              <V3Link
                href={`/books/${current.bookUuid}`}
                className="hover:text-primary truncate hover:underline"
              >
                {current.bookTitle ?? t("untitled")}
              </V3Link>
            ) : (
              <span className="truncate">{t("toast.processing")}</span>
            )}
          </ItemTitle>

          {minimized ? (
            <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          ) : (
            <>
              <ProgressVisualization view={view} percent={pct} />
            </>
          )}
          <div className="flex items-center justify-between gap-0.5">
            <span className="text-muted-foreground text-xs">
              {headline}
              {queuedCount > 0
                ? ` · ${t("toast.queuedSuffix", { count: queuedCount })}`
                : ""}
            </span>

            <div className="flex items-center gap-0.5">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label={t("toast.moreActions")}
                    />
                  }
                >
                  <icon.DotsVertical className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-50">
                  <DropdownMenuItem
                    nativeButton={false}
                    render={<V3Link href="/settings?tab=queue" />}
                  >
                    <icon.ListNumbers className="size-4" />
                    {t("toast.manageQueue")}
                  </DropdownMenuItem>
                  {current.status === "RUNNING" && (
                    <DropdownMenuItem
                      onClick={() => void pauseJob({ uuid: current.uuid })}
                    >
                      <icon.PlayerPause className="size-4" />
                      {t("toast.pause")}
                    </DropdownMenuItem>
                  )}
                  {current.status === "PAUSED" && (
                    <DropdownMenuItem
                      onClick={() => void resumeJob({ uuid: current.uuid })}
                    >
                      <icon.PlayerPlay className="size-4" />
                      {t("toast.resume")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => void cancelJob({ uuid: current.uuid })}
                  >
                    <icon.Close className="size-4" />
                    {c("actions.cancel")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={minimized ? t("toast.expand") : t("toast.minimize")}
                onClick={() => {
                  setMinimized((m) => !m)
                }}
              >
                {minimized ? (
                  <icon.ChevronUp className="size-3.5" />
                ) : (
                  <icon.ChevronDown className="size-3.5" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={t("toast.dismiss")}
                onClick={() => {
                  setDismissed(current.uuid)
                }}
              >
                <icon.Close className="size-3.5" />
              </Button>
            </div>
          </div>
        </ItemContent>
      </Item>
    </div>
  )
}

function useFinishedNotifications(
  finishedJobs: PublicJob[] | undefined,
  basePath: string,
  router: ReturnType<typeof useRouter>,
) {
  const t = useTranslation("Queue")
  const seen = useRef<Set<string>>(new Set())
  const seeded = useRef(false)

  useEffect(() => {
    if (!finishedJobs) return

    if (!seeded.current) {
      for (const job of finishedJobs) seen.current.add(job.uuid)
      seeded.current = true
      return
    }

    for (const job of finishedJobs) {
      if (seen.current.has(job.uuid)) continue
      seen.current.add(job.uuid)

      const title = job.bookTitle ?? t("toast.aBook")
      if (job.status === "DONE") {
        const href = job.bookUuid ? `${basePath}/books/${job.bookUuid}` : null
        toast.success(t("toast.ready", { title }), {
          ...(href && {
            action: {
              label: t("toast.open"),
              onClick: () => {
                router.push(href)
              },
            },
          }),
        })
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted" &&
          typeof document !== "undefined" &&
          document.hidden
        ) {
          const notification = new Notification(t("toast.notifyReadyTitle"), {
            body: t("toast.notifyReadyBody", { title }),
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            icon: getCoverUrl(job.bookUuid!, {
              width: 96,
              height: 64,
              updatedAt: job.updatedAt,
            }),
          })
          if (href) {
            notification.onclick = () => {
              window.focus()
              router.push(href)
            }
          }
        }
      } else if (job.status === "ERROR") {
        toast.error(t("toast.failed", { title }), {
          description: job.error ?? undefined,
        })
      }
    }
  }, [finishedJobs, basePath, router, t])
}
