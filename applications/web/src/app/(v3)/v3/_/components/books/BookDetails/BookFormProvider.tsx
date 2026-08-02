"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useHotkey } from "@tanstack/react-hotkeys"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  type FieldPath,
  type UseFormReturn,
  useForm,
  useFormState,
} from "react-hook-form"
import { toast } from "sonner"

import { useTranslation } from "@v3/_/hooks/use-translation"

import { type Role } from "@/components/books/edit/marcRelators"
import { type BookWithRelations } from "@/database/books"
import { usePermission } from "@/hooks/usePermission"
import { useUpdateBookMutation } from "@/store/api"
import { type UUID } from "@/uuid"

import { type BookFormValues, bookFormSchema } from "./schema"

function bookToFormValues(book: BookWithRelations): BookFormValues {
  return {
    title: book.title,
    subtitle: book.subtitle,
    description: book.description,
    language: book.language,
    publicationDate: book.publicationDate,
    pageCount: book.pageCount,
    duration: book.duration,
    authors: book.authors.map((a) => a.name),
    narrators: book.narrators.map((n) => n.name),
    creators: book.creators
      .filter((c) => c.role !== "aut" && c.role !== "nrt")
      .map((c) => ({ name: c.name, role: c.role ?? "" })),
    tags: book.tags.map((t) => t.name),
    collections: book.collections.map((c) => ({ uuid: c.uuid, name: c.name })),
    series: book.series.map((s) => ({
      uuid: s.uuid,
      name: s.name,
      position: s.position,
      featured: s.featured,
    })),
    textCover: null,
    audioCover: null,
  }
}

type BookFormContextValue = {
  book: BookWithRelations
  form: UseFormReturn<BookFormValues>
  /** whether the current user may edit this book at all */
  canEdit: boolean
  /** global edit mode: every field renders its editor at once */
  isEditing: boolean
  isSaving: boolean
  setIsEditing: (value: boolean) => void
  /** the single field currently being edited inline (outside global mode) */
  editingField: FieldPath<BookFormValues> | null
  setEditingField: (name: FieldPath<BookFormValues> | null) => void
  /** true when a field's editor should be shown (global mode or this field) */
  isFieldActive: (name: FieldPath<BookFormValues>) => boolean
  /** cover-only edit mode: covers become editable, other fields stay read-only */
  editingCovers: boolean
  setEditingCovers: (value: boolean) => void
  submitForm: () => Promise<boolean>
  /** save the whole form and exit every edit mode; toasts on failure */
  saveAndClose: () => Promise<boolean>
  /**
   * commit a single field: no-ops (and exits inline edit) when the field is
   * clean, validates + saves otherwise
   */
  commitField: (name: FieldPath<BookFormValues>) => Promise<boolean>
  /** revert a single field and exit its inline edit */
  cancelField: (name: FieldPath<BookFormValues>) => void
  /** revert all unsaved changes and exit any inline edit */
  discard: () => void
  /** drop pending cover uploads and exit cover edit mode */
  discardCovers: () => void
}

const BookFormContext = createContext<BookFormContextValue | null>(null)

export function useBookForm() {
  const context = useContext(BookFormContext)

  if (!context) {
    throw new Error("useBookForm must be used within a BookFormProvider")
  }

  return context
}

type BookFormProviderProps = {
  book: BookWithRelations
  canEdit?: boolean
  isEditing: boolean
  onEditingChange: (value: boolean) => void
  children: React.ReactNode
}

export function BookFormProvider({
  book,
  isEditing,
  onEditingChange,
  children,
}: BookFormProviderProps) {
  const canEdit = usePermission("bookUpdate") ?? false
  const [updateBook, { isLoading: isSaving }] = useUpdateBookMutation()
  const [editingField, setEditingFieldState] =
    useState<FieldPath<BookFormValues> | null>(null)
  const [editingCovers, setEditingCoversState] = useState(false)
  const t = useTranslation("BookDetailsPage")

  const form = useForm<BookFormValues>({
    resolver: zodResolver(bookFormSchema),
    defaultValues: bookToFormValues(book),
  })

  const { isDirty } = useFormState({ control: form.control })

  useEffect(() => {
    form.reset(bookToFormValues(book), { keepDirtyValues: true })
  }, [book, form])

  const submitFormValues = useCallback(
    async (values: BookFormValues) => {
      const result = await updateBook({
        update: {
          uuid: book.uuid,
          title: values.title,
          subtitle: values.subtitle,
          description: values.description,
          language: values.language,
          publicationDate: values.publicationDate,
          pageCount: values.pageCount,
          duration: values.duration,
          authors: values.authors,
          narrators: values.narrators,
          creators: values.creators
            .filter((c) => c.name.trim())
            .map((c) => ({
              name: c.name,
              fileAs: c.name,
              role: (c.role || "oth") as Role,
            })),
          tags: values.tags,
          collections: values.collections.map((c) => c.uuid as UUID),
          series: values.series.map((s) => ({
            uuid: s.uuid as UUID | undefined,
            name: s.name,
            position: s.position,
            featured: s.featured,
          })),
          // rating is per-user and submitted separately via setBookRating
        },
        textCover: values.textCover,
        audioCover: values.audioCover,
      })

      if (result.error == null) {
        // mark the form clean so the post-save refetch (keepDirtyValues reset
        // above) fully applies the server's normalized values
        form.reset(values)
      }

      return result.error == null
    },
    [book.uuid, updateBook, form],
  )

  const submitForm = useCallback(async (): Promise<boolean> => {
    if (!isDirty) {
      return true
    }

    let success = false
    await form.handleSubmit(async (values) => {
      success = await submitFormValues(values)
    })()

    return success
  }, [form, submitFormValues, isDirty])

  const setEditingField = useCallback(
    (name: FieldPath<BookFormValues> | null) => {
      setEditingFieldState(name)
      if (name !== null) setEditingCoversState(false)
    },
    [],
  )

  const setEditingCovers = useCallback((value: boolean) => {
    setEditingCoversState(value)
    if (value) setEditingFieldState(null)
  }, [])

  const commitField = useCallback(
    async (name: FieldPath<BookFormValues>): Promise<boolean> => {
      // untouched fields exit edit mode without a network call
      if (!form.getFieldState(name).isDirty) {
        setEditingFieldState(null)
        return true
      }

      const valid = await form.trigger(name)
      if (!valid) return false

      const success = await submitFormValues(form.getValues())
      if (success) {
        setEditingFieldState(null)
      }
      return success
    },
    [form, submitFormValues],
  )

  const cancelField = useCallback(
    (name: FieldPath<BookFormValues>) => {
      form.resetField(name)
      setEditingFieldState(null)
    },
    [form],
  )

  const setIsEditing = useCallback(
    (value: boolean) => {
      if (value) {
        form.reset(bookToFormValues(book))
      }
      setEditingFieldState(null)
      setEditingCoversState(false)
      onEditingChange(value)
    },
    [form, book, onEditingChange],
  )

  const discard = useCallback(() => {
    form.reset(bookToFormValues(book))
    setEditingFieldState(null)
    setEditingCoversState(false)
    onEditingChange(false)
  }, [form, book, onEditingChange])

  const discardCovers = useCallback(() => {
    form.resetField("textCover")
    form.resetField("audioCover")
    setEditingCoversState(false)
  }, [form])

  const saveAndClose = useCallback(async (): Promise<boolean> => {
    const ok = await submitForm()
    if (ok) {
      setEditingFieldState(null)
      setEditingCoversState(false)
      onEditingChange(false)
      return true
    }

    toast.error(t("saveFailed"))
    return false
  }, [submitForm, onEditingChange, t])

  // one place decides what cmd+enter means: commit the inline field if there is
  // one, otherwise save the whole book and leave edit mode.
  useHotkey(
    "Mod+Enter",
    () => {
      if (!canEdit) return
      if (editingField) {
        void commitField(editingField)
        return
      }
      if (isEditing || editingCovers) {
        void saveAndClose()
      }
    },
    { ignoreInputs: false },
  )

  const isFieldActive = useCallback(
    (name: FieldPath<BookFormValues>) =>
      canEdit && (isEditing || editingField === name),
    [canEdit, isEditing, editingField],
  )

  const errors = form.formState.errors
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      toast.error("Please fix the errors in the form", {
        description: Object.values(errors)
          .map((error) => error.message)
          .filter(Boolean)
          .join(", "),
      })
    }
  }, [errors])

  const contextValue = useMemo(
    () => ({
      book,
      form,
      canEdit,
      isEditing,
      isSaving,
      setIsEditing,
      editingField,
      setEditingField,
      isFieldActive,
      editingCovers,
      setEditingCovers,
      submitForm,
      saveAndClose,
      commitField,
      cancelField,
      discard,
      discardCovers,
    }),
    [
      book,
      form,
      canEdit,
      isEditing,
      isSaving,
      setIsEditing,
      editingField,
      setEditingField,
      isFieldActive,
      editingCovers,
      setEditingCovers,
      submitForm,
      saveAndClose,
      commitField,
      cancelField,
      discard,
      discardCovers,
    ],
  )

  return (
    <BookFormContext.Provider value={contextValue}>
      {children}
    </BookFormContext.Provider>
  )
}
