"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { useVersionBasePath } from "@v3/_/components/version-context"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { getCoverUrl, useGetJobsQuery } from "@/store/api"

export function useFinishedNotifications() {
  const { data: finishedJobs } = useGetJobsQuery({
    type: "finished",
    sort: "finishedAt",
    order: "desc",
    limit: 5,
  })
  const basePath = useVersionBasePath()
  const router = useRouter()
  const t = useTranslation("SettingsPage.tabs.queue")
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
        const href = job.bookUuid
          ? `${basePath}/books/${job.bookUuid}?report=true`
          : null
        const alignment = job.stats?.alignment
        const skipped = alignment
          ? alignment.excluded + alignment.excludedByRule
          : 0
        const description = alignment
          ? [
              t("toast.grade", { grade: alignment.grade }),
              skipped > 0 && t("toast.skipped", { count: skipped }),
              alignment.review > 0 &&
                t("toast.toCheck", { count: alignment.review }),
            ]
              .filter((segment): segment is string => segment !== false)
              .join(" · ")
          : undefined
        toast.success(t("toast.ready", { title }), {
          description,
          duration: 15000,
          ...(href && {
            action: {
              label: t("toast.openReport"),
              onClick: () => {
                router.push(href)
              },
            },
          }),
        })
        if (
          job.bookUuid &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted" &&
          typeof document !== "undefined" &&
          document.hidden
        ) {
          const notification = new Notification(t("toast.notifyReadyTitle"), {
            body: alignment
              ? t("toast.notifyReadyBodyGraded", {
                  title,
                  grade: alignment.grade,
                })
              : t("toast.notifyReadyBody", { title }),
            icon: getCoverUrl(job.bookUuid, {
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

export function useNotificationPermissionPrompt(shouldAsk: boolean) {
  const asked = useRef(false)

  useEffect(() => {
    if (!shouldAsk || asked.current) return
    asked.current = true
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission()
    }
  }, [shouldAsk])
}
