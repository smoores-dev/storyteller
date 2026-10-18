"use client"

import { useEffect, useRef, useState } from "react"
import { useWatch } from "react-hook-form"

import { bookDuration, bookPageCount } from "@v3/_/lib/bookMetrics"
import { cn } from "@v3/_/lib/utils"

import { formatTimeHuman } from "@/formatTime"

import { useBookForm } from "./BookFormProvider"
import { SEAMLESS_BOX } from "./EditableText"
import { InlineFieldChrome } from "./InlineEditChrome"
import { useInlineField } from "./use-inline-field"

function metricDisplayClass(canEdit: boolean, empty: boolean) {
  return cn(
    SEAMLESS_BOX,
    "w-fit border-transparent whitespace-nowrap",
    canEdit && "hover:border-input hover:bg-input/10 cursor-text",
    empty && "text-muted-foreground italic",
  )
}

export function PageCountEdit({ className }: { className?: string }) {
  const { book } = useBookForm()
  const { form, canEdit, active, inlineMode, size, beginEdit } =
    useInlineField("pageCount")
  const override = useWatch({ control: form.control, name: "pageCount" })

  const displayRef = useRef<HTMLButtonElement>(null)

  if (!active) {
    const effective = bookPageCount(book)
    if (effective == null && !canEdit) return null
    return (
      <button
        ref={displayRef}
        type="button"
        disabled={!canEdit}
        onClick={() => {
          beginEdit(displayRef.current)
        }}
        className={cn(
          metricDisplayClass(canEdit, effective == null),
          className,
        )}
      >
        {effective != null ? `${effective} pages` : "Add pages"}
      </button>
    )
  }

  const input = (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      value={override ?? ""}
      onChange={(e) => {
        const raw = e.target.value
        form.setValue("pageCount", raw === "" ? null : Number(raw), {
          shouldDirty: true,
        })
      }}
      placeholder="Pages"
      className={cn(
        inlineMode
          ? "border-input focus-visible:border-ring text-foreground! w-full border-0 border-b border-dashed bg-transparent px-0 py-0.5 tabular-nums outline-none dark:text-white!"
          : cn(
              SEAMLESS_BOX,
              "text-foreground! border-input bg-input/20 dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/30 w-20 tabular-nums outline-none focus-visible:ring-2",
            ),
        className,
      )}
    />
  )

  if (!inlineMode) return input

  return (
    <InlineFieldChrome name="pageCount" size={size} inline>
      {input}
    </InlineFieldChrome>
  )
}

function splitDuration(total: number) {
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
  }
}

export function DurationEdit({ className }: { className?: string }) {
  const { book } = useBookForm()
  const { form, canEdit, active, inlineMode, size, beginEdit } =
    useInlineField("duration")
  const override = useWatch({ control: form.control, name: "duration" })

  const effective = bookDuration(book)
  const [parts, setParts] = useState(() => splitDuration(effective ?? 0))
  const displayRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (active) {
      setParts(splitDuration(override ?? effective ?? 0))
    }
  }, [active, setParts, override, effective])

  const commitParts = (next: { h: number; m: number; s: number }) => {
    const seconds = next.h * 3600 + next.m * 60 + next.s
    form.setValue("duration", seconds, { shouldDirty: true })
  }

  if (!active) {
    if (effective == null && !canEdit) return null
    return (
      <button
        ref={displayRef}
        type="button"
        disabled={!canEdit}
        onClick={() => {
          beginEdit(displayRef.current)
        }}
        className={cn(
          metricDisplayClass(canEdit, effective == null),
          className,
        )}
      >
        {effective != null ? formatTimeHuman(effective) : "Add duration"}
      </button>
    )
  }

  const fieldClass =
    "border-input text-muted-foreground bg-input/20 dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/30 w-12 rounded-md border px-1 py-0.5 text-center tabular-nums outline-none focus-visible:ring-2"

  const onPartChange =
    (key: "h" | "m" | "s") => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Math.max(0, Number(e.target.value) || 0)
      const next = { ...parts, [key]: value }
      setParts(next)
      commitParts({ ...next, s: 0 })
    }

  const group = (
    <span className={cn("inline-flex items-center gap-1 text-xs", className)}>
      <input
        type="number"
        min={0}
        value={parts.h || ""}
        onChange={onPartChange("h")}
        placeholder="0"
        className={fieldClass}
        aria-label="Hours"
      />
      <span className="text-muted-foreground">h</span>
      <input
        type="number"
        min={0}
        max={59}
        value={parts.m || ""}
        onChange={onPartChange("m")}
        placeholder="0"
        className={fieldClass}
        aria-label="Minutes"
      />
      <span className="text-muted-foreground">m</span>
      {/* <input
        type="number"
        min={0}
        max={59}
        value={parts.s || ""}
        onChange={onPartChange("s")}
        placeholder="0"
        className={fieldClass}
        aria-label="Seconds"
      />
      <span className="text-muted-foreground">s</span> */}
    </span>
  )

  if (!inlineMode) return group

  return (
    <InlineFieldChrome name="duration" size={size} inline>
      {group}
    </InlineFieldChrome>
  )
}
