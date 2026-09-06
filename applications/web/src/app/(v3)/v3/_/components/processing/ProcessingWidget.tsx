"use client"

import { skipToken } from "@reduxjs/toolkit/query"
import { motion } from "motion/react"

import { Cover } from "@v3/_/components/books/Cover"
import { useCoverScope } from "@v3/_/components/books/CoverScope"
import {
  FloatingCard,
  FloatingCardBody,
  FloatingCardContent,
  FloatingCardFooter,
  FloatingCardHeader,
  FloatingCardMedia,
  FloatingCardTitle,
} from "@v3/_/components/floating/FloatingCard"
import { Button } from "@v3/_/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { useFormatDuration } from "@v3/_/lib/formatters"
import { cn } from "@v3/_/lib/utils"

import { type BookWithRelations } from "@/database/books"
import { type DisplayJob } from "@/database/jobs"
import * as icon from "@/icons"
import {
  useCancelJobMutation,
  useGetBookQuery,
  usePauseJobMutation,
  useResumeJobMutation,
} from "@/store/api"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  selectProcessingToastCollapsed,
  selectProcessingToastLocation,
  uiSettingsSlice,
} from "@/store/slices/uiSettingsSlice"

import { JobStatusGlyph } from "./JobStatusGlyph"
import {
  ProgressVisualization,
  StaticProgressBar,
} from "./ProgressVisualization"
import { type ProcessingView } from "./shared"
import { useEstimatedRemaining } from "./useEstimatedRemaining"
import {
  useFinishedNotifications,
  useNotificationPermissionPrompt,
} from "./useFinishedNotifications"
import { type ProcessingQueue, useProcessingQueue } from "./useProcessingQueue"

export function ProcessingWidget() {
  const location = useAppSelector(selectProcessingToastLocation)
  const collapsed = useAppSelector(selectProcessingToastCollapsed)
  const queue = useProcessingQueue()
  const dispatch = useAppDispatch()

  useFinishedNotifications()
  useNotificationPermissionPrompt(queue.active.length > 0)

  const { data: book } = useGetBookQuery(
    queue.current?.bookUuid ? { uuid: queue.current.bookUuid } : skipToken,
  )
  const coverScope = useCoverScope(book)

  const { current, view } = queue
  if (location !== "floating" || !current || !view) return null

  const setCollapsed = (value: boolean) =>
    dispatch(uiSettingsSlice.actions.setProcessingToastCollapsed(value))

  return (
    <FloatingCard className="w-[min(24rem,calc(100vw-2rem))]">
      <motion.div
        key={collapsed ? "bar" : "card"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, delay: 0.1 }}
      >
        {collapsed ? (
          <CollapsedBar
            queue={queue}
            current={current}
            view={view}
            onExpand={() => setCollapsed(false)}
          />
        ) : (
          <ExpandedCard
            queue={queue}
            current={current}
            view={view}
            book={book}
            style={coverScope.style}
            onCollapse={() => setCollapsed(true)}
            onDock={() =>
              dispatch(
                uiSettingsSlice.actions.setProcessingToastLocation("sidebar"),
              )
            }
          />
        )}
      </motion.div>
    </FloatingCard>
  )
}

function JobCover({
  book,
  width,
  className,
}: {
  book: BookWithRelations | undefined
  width: number
  className?: string
}) {
  if (book) {
    return (
      <Cover
        book={book}
        width={width}
        fill
        interactive={false}
        displayMode="ebook"
        className={className}
      />
    )
  }
  return (
    <div
      className={cn(
        "bg-muted flex size-full items-center justify-center",
        className,
      )}
    >
      <icon.BookAlt className="text-muted-foreground size-5" />
    </div>
  )
}

function PauseResumeButton({ current }: { current: DisplayJob }) {
  const t = useTranslation("SettingsPage.tabs.queue")
  const [pauseJob] = usePauseJobMutation()
  const [resumeJob] = useResumeJobMutation()

  if (current.status === "PAUSED") {
    return (
      <TooltipButton
        variant="ghost"
        tooltip={t.plain("toast.resume")}
        aria-label={t.plain("toast.resume")}
        onClick={() => void resumeJob({ uuid: current.uuid })}
      >
        <icon.PlayerPlay />
      </TooltipButton>
    )
  }
  return (
    <TooltipButton
      variant="ghost"
      tooltip={t.plain("toast.pause")}
      aria-label={t.plain("toast.pause")}
      onClick={() => void pauseJob({ uuid: current.uuid })}
    >
      <icon.PlayerPause />
    </TooltipButton>
  )
}

function CollapsedBar({
  queue,
  current,
  view,
  onExpand,
}: {
  queue: ProcessingQueue
  current: DisplayJob
  view: ProcessingView
  onExpand: () => void
}) {
  const t = useTranslation("SettingsPage.tabs.queue")
  const title = current.bookTitle ?? t.plain("untitled")

  return (
    <FloatingCardHeader className="relative py-1.5">
      <TooltipButton
        variant="ghost"
        tooltip={t.plain("toast.expand")}
        aria-label={t.plain("toast.expand")}
        onClick={onExpand}
      >
        <icon.ChevronUp />
      </TooltipButton>
      <FloatingCardTitle className="text-foreground">
        <JobStatusGlyph status={current.status} className="size-3.5" />
        <span className="truncate">{title}</span>
      </FloatingCardTitle>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {queue.percent}%
      </span>
      <PauseResumeButton current={current} />
      <StaticProgressBar
        view={view}
        className="absolute inset-x-0 bottom-0 h-0.5 rounded-none"
      />
    </FloatingCardHeader>
  )
}

function ExpandedCard({
  queue,
  current,
  view,
  book,
  style,
  onCollapse,
  onDock,
}: {
  queue: ProcessingQueue
  current: DisplayJob
  view: ProcessingView
  book: BookWithRelations | undefined
  style?: React.CSSProperties
  onCollapse: () => void
  onDock: () => void
}) {
  const t = useTranslation("SettingsPage.tabs.queue")
  const formatDuration = useFormatDuration()
  const [cancelJob] = useCancelJobMutation()
  const remaining = useEstimatedRemaining(current)

  const title = current.bookTitle ?? t.plain("untitled")
  const detail = [
    queue.queuedCount > 0
      ? t.plain("toast.queuedSuffix", { count: queue.queuedCount })
      : null,
    remaining != null
      ? t.plain("detail.remaining", {
          duration: formatDuration(remaining, { approximate: true }),
        })
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="flex flex-col" style={style}>
      <FloatingCardHeader className="pt-1">
        <TooltipButton
          variant="ghost"
          tooltip={t.plain("toast.minimize")}
          aria-label={t.plain("toast.minimize")}
          onClick={onCollapse}
        >
          <icon.ChevronDown />
        </TooltipButton>
        <FloatingCardTitle>
          <JobStatusGlyph status={current.status} className="size-3.5" />
          <span className="truncate">{queue.headline}</span>
        </FloatingCardTitle>
        <PauseResumeButton current={current} />
        <TooltipButton
          variant="ghost"
          tooltip={t.plain("toast.openQueue")}
          aria-label={t.plain("toast.openQueue")}
          nativeButton={false}
          render={<V3Link href="/settings?tab=queue" />}
        >
          <icon.ListNumbers />
        </TooltipButton>
        <TooltipButton
          variant="ghost"
          tooltip={t.plain("toast.moveToSidebar")}
          aria-label={t.plain("toast.moveToSidebar")}
          onClick={onDock}
        >
          <icon.LayoutSidebar />
        </TooltipButton>
      </FloatingCardHeader>
      <FloatingCardBody className="py-1">
        <FloatingCardMedia className="size-12">
          <JobCover book={book} width={48} className="size-full" />
        </FloatingCardMedia>
        <FloatingCardContent>
          <p className="font-heading truncate text-sm font-semibold">
            {current.bookUuid ? (
              <V3Link
                href={`/books/${current.bookUuid}`}
                className="hover:text-primary hover:underline"
              >
                {title}
              </V3Link>
            ) : (
              title
            )}
          </p>
          {detail && (
            <p className="text-muted-foreground truncate text-xs">{detail}</p>
          )}
        </FloatingCardContent>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.plain("toast.moreActions")}
              />
            }
          >
            <icon.DotsVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {current.bookUuid && (
              <DropdownMenuItem
                nativeButton={false}
                render={<V3Link href={`/books/${current.bookUuid}`} />}
              >
                <icon.BookAlt className="size-4" />
                {t("toast.openBook")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void cancelJob({ uuid: current.uuid })}
            >
              <icon.Close className="size-4" />
              {t("toast.cancelJob")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </FloatingCardBody>
      <FloatingCardFooter className="pb-2">
        <ProgressVisualization view={view} percent={queue.percent} />
      </FloatingCardFooter>
    </div>
  )
}
