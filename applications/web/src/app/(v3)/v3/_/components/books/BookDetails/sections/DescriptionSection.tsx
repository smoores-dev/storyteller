"use client"

import { useEffect, useRef, useState } from "react"
import { Controller, useWatch } from "react-hook-form"

import { InlineFieldChrome } from "@v3/_/components/books/BookDetails/InlineEditChrome"
import { useInlineField } from "@v3/_/components/books/BookDetails/use-inline-field"
import { Field, FieldError } from "@v3/_/components/ui/field"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { cn } from "@/cn"

import { CollapsibleSection } from "./CollapsibleSection"

const COLLAPSED_HEIGHT = 96

function CollapsibleDescription({
  html,
  canEdit,
  onEdit,
}: {
  html: string
  canEdit: boolean
  onEdit: () => void
}) {
  const t = useTranslation("BookDetailsPage")
  const contentRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    setIsOverflowing(el.scrollHeight > COLLAPSED_HEIGHT + 8)
  }, [html])

  const mustExpandFirst = !expanded && isOverflowing
  const editableNow = canEdit && !mustExpandFirst

  return (
    <div className="relative">
      <div
        ref={contentRef}
        role={mustExpandFirst || editableNow ? "button" : undefined}
        tabIndex={mustExpandFirst || editableNow ? 0 : undefined}
        onClick={() => {
          if (mustExpandFirst) {
            setExpanded(true)
            return
          }
          if (canEdit) onEdit()
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return
          e.preventDefault()
          if (mustExpandFirst) {
            setExpanded(true)
            return
          }
          if (canEdit) onEdit()
        }}
        className={cn(
          "prose dark:prose-invert text-foreground max-w-none overflow-hidden font-serif text-sm leading-snug transition-[max-height] duration-300",
          mustExpandFirst && "cursor-pointer",
          editableNow &&
            "hover:bg-input/10 -mx-1.5 cursor-text rounded-md px-1.5",
          // prevents extra spacing at the top if desc is structured like <div><p>...</p></div>
          "[&_p]:mt-0",
        )}
        style={{
          maxHeight: expanded
            ? contentRef.current?.scrollHeight
            : COLLAPSED_HEIGHT,
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {mustExpandFirst && (
        <div className="from-background pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t to-transparent" />
      )}

      {isOverflowing && (
        <button
          type="button"
          onClick={() => {
            setExpanded((prev) => !prev)
          }}
          className="text-cover-accent relative z-10 mt-1 text-xs font-medium hover:underline"
          aria-label={expanded ? t("showLess") : t("showMore")}
        >
          {expanded ? t("showLess") : t("showMore")}
        </button>
      )}
    </div>
  )
}

export function DescriptionSection({ className }: { className?: string }) {
  const t = useTranslation("BookDetailsPage")
  const c = useCommon()
  const { form, canEdit, active, inlineMode, size, beginEdit } =
    useInlineField("description")

  const value = useWatch({ control: form.control, name: "description" })

  const readRef = useRef<HTMLDivElement>(null)
  const startEdit = () => {
    beginEdit(readRef.current)
  }

  return (
    <CollapsibleSection
      title={c("fields.label.description")}
      sectionKey="description"
      className={className}
    >
      {active ? (
        <Controller
          name="description"
          control={form.control}
          render={({ field, fieldState }) => {
            const editor = (
              <Field orientation="vertical" className="gap-1">
                <textarea
                  name={field.name}
                  ref={field.ref}
                  onChange={field.onChange}
                  value={field.value ?? ""}
                  rows={6}
                  placeholder={t("noDescriptionAvailable")}
                  aria-invalid={fieldState.invalid || undefined}
                  className={cn(
                    "field-sizing-content w-full resize-y font-serif text-xs outline-none",
                    inlineMode
                      ? // the chrome card supplies the frame; the textarea is bare
                        "aria-invalid:text-destructive bg-transparent px-0 py-0.5"
                      : "border-input bg-input/20 dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 rounded-md border px-1.5 py-0.5 focus-visible:ring-[2px] aria-invalid:ring-[2px]",
                  )}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )
            if (!inlineMode) return editor

            return (
              <InlineFieldChrome
                name="description"
                size={size}
                commitOnEnter={false}
              >
                {editor}
              </InlineFieldChrome>
            )
          }}
        />
      ) : value && value.trim() ? (
        <div ref={readRef}>
          <CollapsibleDescription
            html={value}
            canEdit={canEdit}
            onEdit={startEdit}
          />
        </div>
      ) : (
        <div ref={readRef}>
          <p
            role={canEdit ? "button" : undefined}
            tabIndex={canEdit ? 0 : undefined}
            onClick={canEdit ? startEdit : undefined}
            className={cn(
              "text-muted-foreground text-xs italic",
              canEdit &&
                "hover:bg-input/10 -mx-1.5 cursor-text rounded-md px-1.5",
            )}
          >
            {t("noDescriptionAvailable")}
          </p>
        </div>
      )}
    </CollapsibleSection>
  )
}
