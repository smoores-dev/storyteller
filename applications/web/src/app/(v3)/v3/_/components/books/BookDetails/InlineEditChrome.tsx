"use client"

import { useEffect, useRef } from "react"
import { type FieldPath } from "react-hook-form"

import { cn } from "@/cn"

import { useBookForm } from "./BookFormProvider"
import { type BookFormValues } from "./schema"
import { type MeasuredSize } from "./use-inline-field"

function InlineEditCard({
  children,
  floating,
  className,
}: {
  children: React.ReactNode
  floating?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "tint-surface border-border bg-background border-l-primary z-50 -mt-[8px] -ml-[4px] flex overflow-hidden rounded-lg border shadow-lg",
        floating ? "absolute top-0 left-0 min-w-full" : "w-full",
        className,
      )}
    >
      <div className="bg-primary w-[3px] shrink-0" aria-hidden />

      <div className="min-w-0 flex-1 py-2 pr-2 pl-2.5">{children}</div>
    </div>
  )
}

export function InlineFieldChrome({
  name,
  size,
  inline,
  commitOnEnter = true,
  commitOnBlur = true,
  children,
}: {
  name: FieldPath<BookFormValues>
  size: MeasuredSize
  children: React.ReactNode
  inline?: boolean
  commitOnEnter?: boolean
  commitOnBlur?: boolean
}) {
  const { commitField, cancelField } = useBookForm()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current?.querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >("input, textarea")
    if (!el) return
    el.focus()
    if (el instanceof HTMLInputElement) el.select()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      cancelField(name)
      return
    }
    if (e.key === "Enter" && commitOnEnter && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      void commitField(name)
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!commitOnBlur) return
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    void commitField(name)
  }

  return (
    <div
      ref={ref}
      className={cn("relative", inline && "inline-block align-top")}
      style={{ width: size?.width, height: size?.height }}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      <InlineEditCard floating>{children}</InlineEditCard>
    </div>
  )
}
