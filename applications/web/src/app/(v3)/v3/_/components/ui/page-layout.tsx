"use client"

import * as React from "react"
import { useCallback, useState } from "react"

import { cn } from "@v3/_/lib/utils"

import { type CoverScopeProps } from "@/app/(v3)/v3/_/components/books/CoverScope"

/**
 * composable page layout that supports a full-height side panel
 * with independent scrolling and resize capability.
 *
 * usage:
 *   <PageLayout>
 *     <PageMain>
 *       <PageHeader breadcrumbs={[...]} />
 *       <PageContent>
 *         ...scrollable content...
 *       </PageContent>
 *     </PageMain>
 *     <PagePanel open={open} width={400} panelRef={ref} onResizeStart={...}>
 *       ...panel content...
 *     </PagePanel>
 *   </PageLayout>
 */

function PageLayout({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-layout"
      className={cn(
        "group/layout relative flex h-screen overflow-hidden",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function PageMain({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-main"
      className={cn(
        "flex min-w-0 flex-1 flex-col overflow-hidden bg-transparent",
        // while the detail panel slides as an overlay, in-flow chrome (header,
        // filters, anything that isn't the scroll content) tracks the panel
        // edge through the --panel-reveal var the width driver animates. at
        // rest the var is 0px and this is a no-op.
        "[&>*:not([data-slot=page-content])]:max-w-[calc(100%-var(--panel-reveal,0px))]",
        // "group-has-data-[slot=page-panel]/layout:shadow-(--shell-inset-shadow)!",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * flow-based wrapper around the absolutely-positioned SiteHeader,
 * so the header takes up space in the flex column instead of overlapping content.
 */
function PageHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header"
      className={cn("relative h-(--header-height) w-full shrink-0", className)}
      {...props}
    >
      {children}
    </div>
  )
}

function PageContent({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-content"
      className={cn(
        "scroll-y @container/page-content @container-size flex-1",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function ResizeHandle({
  side,
  dragging,
  onPointerDown,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  side: "left" | "right"
  dragging?: boolean
  onPointerDown: (e: React.PointerEvent) => void
}) {
  return (
    <div
      data-slot="resize-handle"
      {...props}
      className={cn(
        "group hover:border-primary/50 relative z-60 flex w-0 items-stretch border-l transition-colors",
        className,
      )}
    >
      <div
        className={cn(
          "absolute top-0 bottom-0 flex w-3.5 cursor-col-resize touch-none items-center justify-center",
          side === "left" ? "-left-[7.5px]" : "-right-[7.5px]",
        )}
        data-dragging={dragging || undefined}
        onPointerDown={onPointerDown}
      >
        <div
          className={cn(
            "bg-foreground/20 h-11 w-1 rounded-full opacity-0 transition-opacity group-hover:opacity-100",
            dragging && "bg-primary opacity-100",
          )}
        />
      </div>
    </div>
  )
}

export const MIN_PANEL_WIDTH = 240
export const MAX_PANEL_WIDTH = 800
// panel content never squishes below this; while the panel animates it is
// revealed from the right edge instead of reflowing.
export const PANEL_CONTENT_MIN_WIDTH = 300

function PagePanel({
  open,
  width,
  phase = null,
  panelRef,
  onResizeStart,
  dragging,
  className,
  children,
  colors,
  ...props
}: React.ComponentProps<"div"> & {
  open: boolean
  width: number
  // open/close slide in progress (transform mode): the panel leaves flex flow
  // and overlays the content while translateX moves it, so the layout only
  // changes once, at rest
  phase?: "opening" | "closing" | null
  panelRef?: React.Ref<HTMLDivElement>
  // pointer-down on the resize handle. width changes are driven externally
  onResizeStart?: (e: React.PointerEvent) => void
  dragging?: boolean
  colors?: CoverScopeProps
}) {
  if (!open) return null

  const overlay = phase !== null

  return (
    <>
      {onResizeStart && (
        <ResizeHandle
          side="left"
          {...(dragging !== undefined && { dragging })}
          onPointerDown={onResizeStart}
          {...colors}
          // keeps its 1px border space during the slide so the swap into flex
          // only changes the layout by the panel width itself
          className={cn(
            // "border-l-primary/30",
            "border-0",

            overlay && "invisible",
          )}
        />
      )}

      <div
        ref={panelRef}
        data-slot="page-panel"
        className={cn(
          "bg-background shrink-0",
          // "shadow-2xl",
          "z-50",
          overlay
            ? "border-l-primary/30 absolute inset-y-0 right-0 z-40 border-l"
            : "relative",
          className,
        )}
        {...props}
        style={
          {
            width,
            "--panel-content-min": `${PANEL_CONTENT_MIN_WIDTH}px`,
            ...(overlay ? colors?.style : {}),
            ...props.style,
          } as React.CSSProperties
        }
      >
        {/* right-anchored reveal mask: content keeps its layout while the
            panel's left edge sweeps open/closed */}
        <div className="absolute inset-y-0 right-0 flex w-full min-w-(--panel-content-min) overflow-hidden">
          {children}
        </div>
      </div>
    </>
  )
}

export const MIN_SIDEBAR_WIDTH = 180
export const MAX_SIDEBAR_WIDTH = 480

/**
 * the sidebar for libraries showing all available tags/collections/shelves etc
 */
function PageSidebar({
  width,
  onWidthChange,
  snapWidth,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  width: number
  onWidthChange?: (width: number) => void
  snapWidth?: (rawWidth: number) => number
}) {
  const sidebarRef = React.useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const clampWidth = useCallback(
    (w: number) => Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, w)),
    [],
  )

  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)

      const startX = e.clientX
      const startWidth = width
      let committed = width
      setDragging(true)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"

      const abortController = new AbortController()
      const handlePointerMove = (e: PointerEvent) => {
        const raw = clampWidth(startWidth + (e.clientX - startX))
        committed = clampWidth(snapWidth ? snapWidth(raw) : raw)
        // live width on the DOM only; content reflows as you drag, and the
        // single commit below keeps per-move persistence writes away
        if (sidebarRef.current) {
          sidebarRef.current.style.width = `${committed}px`
        }
      }

      const handlePointerUp = () => {
        abortController.abort()
        setDragging(false)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        onWidthChange?.(committed)
      }

      document.addEventListener("pointermove", handlePointerMove, {
        signal: abortController.signal,
      })
      document.addEventListener("pointerup", handlePointerUp, {
        signal: abortController.signal,
      })
      document.addEventListener("pointercancel", handlePointerUp, {
        signal: abortController.signal,
      })
    },
    [width, onWidthChange, snapWidth, clampWidth],
  )

  return (
    <>
      <div
        ref={sidebarRef}
        data-slot="page-sidebar"
        className={cn(
          "bg-background flex h-full shrink-0 flex-col overflow-y-auto",
          className,
        )}
        style={{ width }}
        {...props}
      >
        <div className="flex h-full w-full flex-col">{children}</div>
      </div>

      {onWidthChange && (
        <ResizeHandle
          side="right"
          dragging={dragging}
          onPointerDown={handleResizeStart}
          className={cn("border-0")}
        />
      )}
    </>
  )
}

export { PageContent, PageHeader, PageLayout, PageMain, PagePanel, PageSidebar }
