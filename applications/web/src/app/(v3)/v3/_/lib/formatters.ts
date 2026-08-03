import {
  type DateTimeFormatOptions,
  type NumberFormatOptions,
  type RelativeTimeFormatOptions,
  useFormatter,
} from "next-intl"
import { useCallback } from "react"

import { useTranslation } from "@/app/(v3)/v3/_/hooks/use-translation"

export const DEFAULT_DATE_OPTIONS: DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
}

export function useFormatDate() {
  const { dateTime } = useFormatter()

  return (
    date: string | null | Date,
    options?: DateTimeFormatOptions,
  ): string => {
    if (!date) return ""
    return dateTime(new Date(date), {
      ...DEFAULT_DATE_OPTIONS,
      ...options,
    })
  }
}

export function useFormatRelativeTime() {
  const { relativeTime } = useFormatter()

  return (
    date: string | null | Date,
    options?: RelativeTimeFormatOptions,
  ): string => {
    if (!date) return ""
    return relativeTime(new Date(date), {
      style: "short",
      ...options,
    })
  }
}

export function useFormatNumber() {
  const { number } = useFormatter()

  return (value: number, options?: NumberFormatOptions): string => {
    if (!value) return ""
    return number(value, {
      ...options,
    })
  }
}

export function useFormatList() {
  const { list } = useFormatter()

  return (value: string[], options?: Intl.ListFormatOptions): string => {
    return list(value, {
      ...options,
    })
  }
}

export function useFormatDuration() {
  const t = useTranslation("Common.Duration")

  return useCallback(
    (
      seconds: number,
      options?: { approximate?: boolean; compact?: boolean },
    ): string => {
      const totalMinutes = Math.round(seconds / 60)

      if (totalMinutes < 1) {
        return t("lessThanAMinute")
      }

      const hours = Math.floor(totalMinutes / 60)
      const minutes = totalMinutes % 60
      const compact = options?.compact ?? false

      let result: string

      if (hours > 0 && minutes > 0) {
        result = t(compact ? "compactHoursAndMinutes" : "hoursAndMinutes", {
          hours: String(hours),
          minutes: String(minutes),
        })
      } else if (hours > 0) {
        result = t(compact ? "compactHours" : "hours", { hours: String(hours) })
      } else {
        result = t(compact ? "compactMinutes" : "minutes", {
          minutes: String(minutes),
        })
      }

      if (options?.approximate) {
        return t("approximate", { duration: result })
      }

      return result
    },
    [t],
  )
}
