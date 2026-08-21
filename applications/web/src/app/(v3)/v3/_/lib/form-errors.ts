import {
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form"

import { apiErrorMessage } from "./api-error"

export type ServerFieldError = { path: string; message: string }

function serverFieldErrors(error: unknown): ServerFieldError[] {
  if (!error || typeof error !== "object" || !("data" in error)) return []

  const data = (error as { data: unknown }).data
  if (!data || typeof data !== "object" || !("fieldErrors" in data)) return []

  const fieldErrors = (data as { fieldErrors: unknown }).fieldErrors
  if (!Array.isArray(fieldErrors)) return []

  return fieldErrors.filter(
    (entry): entry is ServerFieldError =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as ServerFieldError).path === "string" &&
      typeof (entry as ServerFieldError).message === "string",
  )
}

export function applyServerErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
  fallback: string,
): string {
  const fieldErrors = serverFieldErrors(error)

  for (const { path, message } of fieldErrors) {
    form.setError(path as FieldPath<T>, { type: "server", message })
  }

  return apiErrorMessage(error) ?? fieldErrors[0]?.message ?? fallback
}
