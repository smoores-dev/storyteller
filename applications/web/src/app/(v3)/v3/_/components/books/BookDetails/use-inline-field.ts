"use client"

import { useCallback, useState } from "react"
import { type FieldPath } from "react-hook-form"

import { useBookForm } from "./BookFormProvider"
import { type BookFormValues } from "./schema"

export type MeasuredSize = { width: number; height: number } | null

export function useInlineField(name: FieldPath<BookFormValues>) {
  const {
    form,
    canEdit,
    isEditing,
    isSaving,
    editingField,
    setEditingField,
    commitField,
    cancelField,
  } = useBookForm()

  const active = canEdit && (isEditing || editingField === name)
  const inlineMode = editingField === name && !isEditing

  const [size, setSize] = useState<MeasuredSize>(null)

  const beginEdit = useCallback(
    (el: HTMLElement | null) => {
      if (!canEdit) return
      const rect = el?.getBoundingClientRect()
      setSize(rect ? { width: rect.width, height: rect.height } : null)
      setEditingField(name)
    },
    [canEdit, name, setEditingField],
  )

  const commit = useCallback(() => commitField(name), [commitField, name])
  const cancel = useCallback(() => {
    cancelField(name)
  }, [cancelField, name])

  return {
    form,
    canEdit,
    isSaving,
    active,
    inlineMode,
    size,
    beginEdit,
    commit,
    cancel,
  }
}
