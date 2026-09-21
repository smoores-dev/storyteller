"use client"

import { useRef } from "react"
import { Controller, type FieldPath, useWatch } from "react-hook-form"

import { Field, FieldError } from "@v3/_/components/ui/field"
import { cn } from "@v3/_/lib/utils"

import { toDateInputValue } from "@/dates"

import { InlineFieldChrome } from "./InlineEditChrome"
import { type BookFormValues } from "./schema"
import { useInlineField } from "./use-inline-field"

export const SEAMLESS_BOX =
  "-mx-1.5 w-full rounded-md border px-1.5 py-0.5 transition-colors"

type EditableTextProps = {
  name: FieldPath<BookFormValues>
  className?: string
  as?: "span" | "p" | "div" | "h1" | "h2" | "h3"
  placeholder?: string
  type?: "text" | "date" | "number"
  multiline?: boolean
  renderDisplay?: (value: string) => React.ReactNode
  fieldClassName?: string
}

export function EditableText({
  name,
  className,
  as: As = "span",
  placeholder,
  type = "text",
  multiline = false,
  renderDisplay,
  fieldClassName,
}: EditableTextProps) {
  const { form, canEdit, active, inlineMode, size, beginEdit } =
    useInlineField(name)

  const rawValue = useWatch({ control: form.control, name }) as unknown
  const value =
    rawValue instanceof Date ? rawValue.toISOString() : (rawValue as string)

  const originalRef = useRef<HTMLDivElement | null>(null)

  if (!active) {
    const text = typeof value === "string" ? value.trim() : ""
    return (
      <As
        className={cn(
          SEAMLESS_BOX,
          "block border-transparent",
          canEdit && "hover:border-input hover:bg-input/10 cursor-text",
          className,
          !text && "text-muted-foreground italic",
        )}
        role={canEdit ? "button" : undefined}
        ref={originalRef}
        tabIndex={canEdit ? 0 : undefined}
        onClick={
          canEdit
            ? () => {
                beginEdit(originalRef.current)
              }
            : undefined
        }
        onKeyDown={
          canEdit
            ? (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  beginEdit(originalRef.current)
                }
              }
            : undefined
        }
      >
        {text ? (renderDisplay ? renderDisplay(text) : text) : placeholder}
      </As>
    )
  }

  return (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => {
        const fieldValue =
          type === "date"
            ? toDateInputValue(field.value)
            : ((field.value as string | null) ?? "")

        const commonProps = {
          id: name,
          value: fieldValue,
          name: field.name,
          placeholder,
          "aria-invalid": fieldState.invalid || undefined,
          onChange: field.onChange,
        }

        const inputClassName = inlineMode
          ? cn(
              "border-input focus-visible:border-ring aria-invalid:border-destructive w-full border-0 border-b border-dashed bg-transparent px-0 py-0.5 outline-none",
              "placeholder:text-muted-foreground placeholder:not-italic",
              className,
            )
          : cn(
              SEAMLESS_BOX,
              "border-input bg-input/20 dark:bg-input/30 outline-none",
              "focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[2px]",
              "aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-[2px]",
              "placeholder:text-muted-foreground placeholder:not-italic",
              className,
            )

        const inputStyle = inlineMode
          ? { width: "100%" }
          : { width: size?.width ?? "100%", height: size?.height }

        const editor = (
          <Field orientation="vertical" className={cn("gap-1", fieldClassName)}>
            {type === "text" ? (
              <textarea
                {...commonProps}
                ref={field.ref}
                rows={multiline ? 5 : 1}
                style={inputStyle}
                className={cn(inputClassName, "field-sizing-content resize-y")}
              />
            ) : (
              <input
                {...commonProps}
                type={type}
                style={inputStyle}
                className={inputClassName}
                ref={field.ref}
              />
            )}
            <FieldError errors={[fieldState.error]} />
          </Field>
        )

        if (!inlineMode) return editor

        return (
          <InlineFieldChrome name={name} size={size} commitOnEnter={!multiline}>
            {editor}
          </InlineFieldChrome>
        )
      }}
    />
  )
}
