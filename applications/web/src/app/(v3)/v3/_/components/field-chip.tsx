"use client"

import { useCommon } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { isField, isRetiredField } from "@/fields"
import { FieldIcon, type FieldIconKey } from "@/icons/field-icons"

export function useFieldLabel() {
  const c = useCommon()
  return (field: string): string => {
    if (isField(field)) {
      return c.plain(`fields.label.${field}`)
    }
    if (isRetiredField(field)) {
      return c.plain(`fields.retired.${field}`)
    }
    return field
  }
}

export function FieldChip({
  field,
  className,
}: {
  field: string
  className?: string
}) {
  const label = useFieldLabel()
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 align-[-0.125em] font-semibold whitespace-nowrap",
        className,
      )}
    >
      <FieldIcon field={field as FieldIconKey} size="xs" />
      {label(field)}
    </span>
  )
}
