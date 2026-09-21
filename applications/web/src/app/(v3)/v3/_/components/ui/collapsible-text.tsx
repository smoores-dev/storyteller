"use client"

import { type ReactNode, useEffect, useRef, useState } from "react"

import { useCommon } from "@v3/_/hooks/use-translation"

import { cn } from "@/cn"
import { useSanitizedHtml } from "@/sanitizeHtml"

type CollapsibleTextProps = {
  children?: ReactNode
  html?: string
  collapsedHeight: number
  className?: string
  onClickThrough?: () => void
  clickThroughClassName?: string
}

export function CollapsibleText({
  children,
  html,
  collapsedHeight,
  className,
  onClickThrough,
  clickThroughClassName,
}: CollapsibleTextProps) {
  const c = useCommon()
  const contentRef = useRef<HTMLDivElement>(null)
  const safeHtml = useSanitizedHtml(html)
  const [expanded, setExpanded] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    setIsOverflowing(el.scrollHeight > collapsedHeight + 8)
  }, [children, html, collapsedHeight])

  const mustExpandFirst = !expanded && isOverflowing
  const clickThroughNow = !!onClickThrough && !mustExpandFirst
  const interactive = mustExpandFirst || expanded || clickThroughNow

  const handleActivate = () => {
    if (mustExpandFirst) {
      setExpanded(true)
      return
    }
    if (onClickThrough) {
      onClickThrough()
      return
    }
    if (expanded) setExpanded(false)
  }

  return (
    <div className="relative">
      <div
        ref={contentRef}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={interactive ? handleActivate : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key !== "Enter" && e.key !== " ") return
                e.preventDefault()
                handleActivate()
              }
            : undefined
        }
        className={cn(
          "overflow-hidden transition-[max-height] duration-300",
          (mustExpandFirst || (expanded && !onClickThrough)) &&
            "cursor-pointer",
          clickThroughNow && clickThroughClassName,
          className,
        )}
        style={{
          maxHeight: expanded
            ? contentRef.current?.scrollHeight
            : collapsedHeight,
        }}
        {...(html !== undefined
          ? { dangerouslySetInnerHTML: { __html: safeHtml ?? "" } }
          : { children })}
      />

      {/* collapsed: the link rides the end of the last visible line, with the
          cut-off text fading out right before it */}
      {mustExpandFirst && (
        <div className="absolute right-0 bottom-0 z-10 flex">
          <span
            aria-hidden
            className="to-background w-10 self-stretch bg-linear-to-r from-transparent"
          />
          <button
            type="button"
            onClick={() => {
              setExpanded(true)
            }}
            className="bg-background text-cover-accent text-xs leading-5 font-medium hover:underline"
          >
            {c("actions.showMore")}
          </button>
        </div>
      )}

      {expanded && isOverflowing && (
        <button
          type="button"
          onClick={() => {
            setExpanded(false)
          }}
          className="text-cover-accent relative z-10 mt-1 text-xs font-medium hover:underline"
        >
          {c("actions.showLess")}
        </button>
      )}
    </div>
  )
}
