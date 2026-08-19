"use client"

import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"

import { FieldLabel } from "@v3/_/components/ui/field"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@v3/_/components/ui/tooltip"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import {
  type LibraryDefaultKey as LibraryDefaultKey,
  type PreferenceDefaults,
  type UserPreferences,
  defaultUserPreferences,
} from "@/database/userPreferencesTypes"
import * as icon from "@/icons"
import { useUpdatePreferenceDefaultsMutation } from "@/store/api"

import { type PreferencesFormType } from "./shared"

type LibraryDefaultsContextValue = {
  form: PreferencesFormType
  canManage: boolean
  locked: boolean
  savedDefaults: PreferenceDefaults
  setSavedDefaults: (defaults: PreferenceDefaults) => void
}

const LibraryDefaultsContext =
  createContext<LibraryDefaultsContextValue | null>(null)

export function LibraryDefaultsProvider({
  form,
  canManage,
  locked,
  defaults,
  children,
}: {
  form: PreferencesFormType
  canManage: boolean
  locked: boolean
  defaults: PreferenceDefaults
  children: ReactNode
}) {
  const [savedDefaults, setSavedDefaults] =
    useState<PreferenceDefaults>(defaults)

  const value = useMemo<LibraryDefaultsContextValue>(
    () => ({ form, canManage, locked, savedDefaults, setSavedDefaults }),
    [form, canManage, locked, savedDefaults],
  )

  return (
    <LibraryDefaultsContext.Provider value={value}>
      {children}
    </LibraryDefaultsContext.Provider>
  )
}

export function useLibraryDefaultValue<K extends LibraryDefaultKey>(
  field: K,
): PreferenceDefaults[K] | null {
  const ctx = useContext(LibraryDefaultsContext)
  return ctx?.savedDefaults[field] ?? null
}

export function useResolvedDefault<K extends LibraryDefaultKey>(
  field: K,
): UserPreferences[K] {
  const ctx = useContext(LibraryDefaultsContext)
  return (ctx?.savedDefaults[field] ??
    defaultUserPreferences[field]) as UserPreferences[K]
}

function displayable(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
}

function RestoreDefault({ field }: { field: LibraryDefaultKey }) {
  const ctx = useContext(LibraryDefaultsContext)
  const t = useTranslation("PreferencesPage.libraryDefault")
  const value = useWatch({ control: ctx?.form.control, name: field })

  if (!ctx || value == null) return null

  const resolved = ctx.savedDefaults[field] ?? defaultUserPreferences[field]
  if (JSON.stringify(value) === JSON.stringify(resolved ?? null)) return null

  const tooltip = displayable(resolved)
    ? t("restoreDefaultValue", { value: String(resolved) })
    : t("restoreDefault")

  return (
    <TooltipButton
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        ctx.form.setValue(field, null, { shouldDirty: true })
      }}
      className="text-muted-foreground h-6 shrink-0 gap-1.5 px-1.5 text-xs font-normal"
      tooltip={tooltip}
      aria-label={tooltip}
    >
      <icon.History className="size-3.5" />
    </TooltipButton>
  )
}

export function LibraryDefault({ field }: { field: LibraryDefaultKey }) {
  const ctx = useContext(LibraryDefaultsContext)
  const t = useTranslation("PreferencesPage.libraryDefault")
  const [update, { isLoading }] = useUpdatePreferenceDefaultsMutation()
  const value = useWatch({ control: ctx?.form.control, name: field })

  if (!ctx || !ctx.canManage) return null

  if (ctx.locked) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <icon.Lock className="size-3" />
              {t("locked")}
            </span>
          }
        />
        <TooltipContent>{t("lockedHint")}</TooltipContent>
      </Tooltip>
    )
  }

  const saved = ctx.savedDefaults[field]
  const hasSaved = saved !== undefined
  const isCurrent =
    value != null && JSON.stringify(saved ?? null) === JSON.stringify(value)

  const setAsDefault = async () => {
    if (value == null || isCurrent || isLoading) return
    try {
      const merged = await update({ [field]: value }).unwrap()
      ctx.setSavedDefaults(merged)
      toast.success(t("saved"))
    } catch {
      toast.error(t("failed"))
    }
  }

  const clearDefault = async () => {
    if (!hasSaved || isLoading) return
    try {
      const merged = await update({ [field]: null }).unwrap()
      ctx.setSavedDefaults(merged)
      toast.success(t("cleared"))
    } catch {
      toast.error(t("failed"))
    }
  }

  const setTooltip = isCurrent
    ? displayable(saved)
      ? t("isDefaultValue", { value: String(saved) })
      : t("isDefault")
    : t("setAsDefault")

  return (
    <>
      <TooltipButton
        type="button"
        variant="ghost"
        size="sm"
        disabled={isLoading || isCurrent || value == null}
        onClick={() => void setAsDefault()}
        className={cn(
          "text-muted-foreground h-6 shrink-0 gap-1.5 px-1.5 text-xs font-normal",
          isCurrent && "opacity-70",
        )}
        tooltip={setTooltip}
        aria-label={setTooltip}
      >
        {isCurrent ? (
          <icon.Check className="size-3.5" />
        ) : (
          <icon.LibraryDefault className="size-3.5" />
        )}
      </TooltipButton>
      {hasSaved && (
        <TooltipButton
          type="button"
          variant="ghost"
          size="sm"
          disabled={isLoading}
          onClick={() => void clearDefault()}
          className="text-muted-foreground h-6 shrink-0 gap-1.5 px-1.5 text-xs font-normal"
          tooltip={
            displayable(saved)
              ? t("clearDefaultValue", { value: String(saved) })
              : t("clearDefault")
          }
          aria-label={t("clearDefault")}
        >
          <icon.Close className="size-3.5" />
        </TooltipButton>
      )}
    </>
  )
}

export function SettingLabel({
  field,
  children,
  className,
}: {
  field?: LibraryDefaultKey
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-6 items-center justify-between gap-2",
        className,
      )}
    >
      <FieldLabel>{children}</FieldLabel>
      {field ? (
        <div className="flex items-center gap-0.5">
          <RestoreDefault field={field} />
          <LibraryDefault field={field} />
        </div>
      ) : null}
    </div>
  )
}
