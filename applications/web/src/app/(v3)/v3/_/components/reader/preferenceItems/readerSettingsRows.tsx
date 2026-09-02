"use client"

import { type KeyboardEvent, type ReactNode, useState } from "react"

import {
  FilterableMenuGroup,
  FilterableMenuItem,
  FilterableMenuLabel,
  FilterableMenuSub,
  FilterableMenuSubContent,
  FilterableMenuSubTrigger,
} from "@v3/_/components/ui/filterable-menu"
import { ResetButton } from "@v3/_/components/ui/reset-button"
import { Switch } from "@v3/_/components/ui/switch"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  type PreferencePayload,
  type ReadingPreferences,
  preferencesSlice,
  selectBookPreferences,
} from "@/store/slices/preferencesSlice"
import { type UUID } from "@/uuid"


import { ReaderSlider } from "./ReaderSlider"

export type NumericPreferenceKey = {
  [K in keyof ReadingPreferences]: ReadingPreferences[K] extends number
    ? K
    : never
}[keyof ReadingPreferences]

export type BooleanPreferenceKey = {
  [K in keyof ReadingPreferences]: ReadingPreferences[K] extends boolean
    ? K
    : never
}[keyof ReadingPreferences]

export type PreferenceApi = {
  values: ReadingPreferences
  overridden: (key: keyof ReadingPreferences) => boolean
  set: <K extends keyof ReadingPreferences>(
    key: K,
    value: ReadingPreferences[K],
  ) => void
  reset: (key: keyof ReadingPreferences) => void
}

export function usePreferenceApi(bookUuid: UUID): PreferenceApi {
  const dispatch = useAppDispatch()
  const values = useAppSelector((state) =>
    selectBookPreferences(state, bookUuid),
  )
  const overrides = useAppSelector(
    (state) => state.preferences.perBook[bookUuid],
  )
  return {
    values,
    overridden: (key) => overrides?.[key] !== undefined,
    set: (key, value) => {
      dispatch(
        preferencesSlice.actions.updatePreference({
          key,
          value,
          target: bookUuid,
        } as PreferencePayload),
      )
    },
    reset: (key) => {
      dispatch(
        preferencesSlice.actions.resetPreference({ key, target: bookUuid }),
      )
    },
  }
}

const MENU_NAV_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "Enter",
])

export function stopMenuNavigation(event: KeyboardEvent) {
  if (MENU_NAV_KEYS.has(event.key)) event.stopPropagation()
}

export const readerMenuClassName =
  "bg-reader-surface text-reader-text ring-reader-border [&_[role=menuitem][data-highlighted]]:bg-reader-accent/20 [&_[role=menuitem][data-highlighted]]:text-reader-text [&_[role=menuitem][data-open]]:bg-reader-accent/20 [&_[role=menuitem][data-open]]:text-reader-text"

export const readerMenuLabelClassName = "text-reader-text-secondary"

export const readerMenuSeparatorClassName = "bg-reader-border"

export function OverrideMark({ show }: { show: boolean }) {
  const t = useTranslation("Reader.readerSettings")
  if (!show) return null
  return (
    <span
      title={t.plain("setForThisBookOnly")}
      className="bg-reader-accent size-1.5 shrink-0 rounded-full"
    />
  )
}

export function SectionGroup({
  api,
  label,
  keys,
  children,
}: {
  api: PreferenceApi
  label: string
  keys: readonly (keyof ReadingPreferences)[]
  children: ReactNode
}) {
  const t = useTranslation("Reader.readerSettings")
  const anyChanged = keys.some(api.overridden)
  return (
    <FilterableMenuGroup>
      <FilterableMenuLabel
        className={readerMenuLabelClassName}
        action={
          <ResetButton
            tooltip={t.plain("followAllBooks")}
            disabled={!anyChanged}
            className="text-reader-text-muted hover:text-reader-text"
            onReset={() => {
              keys.forEach(api.reset)
            }}
          />
        }
      >
        {label}
      </FilterableMenuLabel>
      {children}
    </FilterableMenuGroup>
  )
}

export function NestedSelect({
  label,
  icon: leading,
  value,
  changed,
  inline,
  children,
}: {
  label: string
  icon?: ReactNode
  value: string
  changed: boolean
  inline: boolean
  children: ReactNode
}) {
  if (inline) {
    return (
      <FilterableMenuGroup>
        <FilterableMenuLabel className={cn(readerMenuLabelClassName, "pt-2")}>
          {label}
        </FilterableMenuLabel>
        {children}
      </FilterableMenuGroup>
    )
  }
  return (
    <FilterableMenuSub>
      <FilterableMenuSubTrigger icon={leading} textValue={label}>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <OverrideMark show={changed} />
        <span className="text-reader-text-muted max-w-24 truncate">
          {value}
        </span>
      </FilterableMenuSubTrigger>
      <FilterableMenuSubContent
        searchable={false}
        className={cn(readerMenuClassName, "w-56")}
      >
        {children}
      </FilterableMenuSubContent>
    </FilterableMenuSub>
  )
}

export function ChoiceItems<K extends keyof ReadingPreferences>({
  api,
  prefKey,
  options,
}: {
  api: PreferenceApi
  prefKey: K
  options: readonly {
    value: ReadingPreferences[K]
    label: string
    icon?: ReactNode
    className?: string
    title?: string
  }[]
}) {
  return (
    <>
      {options.map((option) => (
        <FilterableMenuItem
          key={option.label}
          closeOnClick={false}
          textValue={option.label}
          icon={option.icon}
          title={option.title}
          className={option.className}
          onSelect={() => {
            api.set(prefKey, option.value)
          }}
        >
          <span className="min-w-0 flex-1 truncate">{option.label}</span>
          {api.values[prefKey] === option.value && (
            <icon.Check className="text-reader-accent" />
          )}
        </FilterableMenuItem>
      ))}
    </>
  )
}

export function ToggleItem({
  api,
  prefKey,
  label,
  icon: leading,
  title,
}: {
  api: PreferenceApi
  prefKey: BooleanPreferenceKey
  label: string
  icon?: ReactNode
  title?: string
}) {
  const checked = api.values[prefKey]
  return (
    <FilterableMenuItem
      closeOnClick={false}
      textValue={label}
      icon={leading}
      title={title}
      onSelect={() => {
        api.set(prefKey, !checked)
      }}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <OverrideMark show={api.overridden(prefKey)} />
      <Switch
        size="sm"
        checked={checked}
        tabIndex={-1}
        className="data-checked:bg-reader-accent data-unchecked:bg-reader-border pointer-events-none"
      />
    </FilterableMenuItem>
  )
}

export function SliderRow({
  api,
  prefKey,
  label,
  min,
  max,
  step,
  format,
  afterCommit,
}: {
  api: PreferenceApi
  prefKey: NumericPreferenceKey
  label: string
  min: number
  max: number
  step: number
  format?: (value: number) => string
  afterCommit?: (value: number) => void
}) {
  const value = api.values[prefKey]
  const [dragging, setDragging] = useState<number | null>(null)
  const shown = dragging ?? value
  return (
    <div
      className="flex flex-col gap-0.5 px-2 py-1"
      onKeyDown={stopMenuNavigation}
    >
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-reader-text-secondary">{label}</span>
        <OverrideMark show={api.overridden(prefKey)} />
        <span className="text-reader-text ml-auto tabular-nums">
          {format ? format(shown) : String(shown)}
        </span>
      </div>
      <ReaderSlider
        value={shown}
        min={min}
        max={max}
        step={step}
        className="py-1 **:data-[slot='slider-marks']:hidden"
        onValueChange={(next) => {
          setDragging(next)
        }}
        onValueCommitted={(next) => {
          setDragging(null)
          api.set(prefKey, next)
          afterCommit?.(next)
        }}
      />
    </div>
  )
}
