"use client"

import { createContext, useContext } from "react"
import {
  Controller,
  type ControllerFieldState,
  type ControllerRenderProps,
  type FieldPath,
  type UseFormReturn,
} from "react-hook-form"
import type z from "zod"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@v3/_/components/ui/field"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@v3/_/components/ui/tooltip"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { type Settings } from "@/apiModels"
import { type SettingsSchema } from "@/database/settingsTypes"
import * as icon from "@/icons"

export type SettingsFormForm = UseFormReturn<z.infer<typeof SettingsSchema>>

export type SettingsFormProviderProps = {
  children: React.ReactNode
  form: SettingsFormForm
  lockedSettings: Set<keyof Settings>
}

export type SettingsFormProviderContext = {
  form: SettingsFormForm
  lockedSettings: Set<keyof Settings>
} | null

export const SettingsFormProviderContext =
  createContext<SettingsFormProviderContext>(null)

export const SettingsFormProvider = ({
  children,
  form,
  lockedSettings,
}: SettingsFormProviderProps) => {
  return (
    <SettingsFormProviderContext.Provider value={{ form, lockedSettings }}>
      {children}
    </SettingsFormProviderContext.Provider>
  )
}

export const useSettingsForm = () => {
  const context = useContext(SettingsFormProviderContext)

  if (!context) {
    throw new Error(
      "useSettingsForm must be used within a SettingsFormProvider",
    )
  }

  return context
}

export type SettingsFormFieldProps<
  T extends FieldPath<z.infer<typeof SettingsSchema>>,
> = {
  name: T
  label: string
  description?: string
  render: (
    field: ControllerRenderProps<z.infer<typeof SettingsSchema>, T>,
    fieldState: ControllerFieldState,
    isLocked: boolean,
  ) => React.ReactNode
}

export const LockTooltip = () => {
  const t = useTranslation("SettingsPage")
  return (
    <Tooltip>
      <TooltipTrigger>
        <icon.Lock size="sm" className="text-amber-500" />
      </TooltipTrigger>
      <TooltipContent>{t("lockedSettingTooltip")}</TooltipContent>
    </Tooltip>
  )
}

export const SettingsFormField = <
  T extends keyof z.infer<typeof SettingsSchema>,
>({
  name,
  label,
  description,
  render,
}: SettingsFormFieldProps<T>) => {
  const { form, lockedSettings } = useSettingsForm()
  const isLocked = lockedSettings.has(name)

  return (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} data-disabled={isLocked}>
          <FieldLabel htmlFor={name}>
            {label}
            {isLocked && <LockTooltip />}
          </FieldLabel>
          {description && <FieldDescription>{description}</FieldDescription>}
          {typeof render === "function"
            ? render(field, fieldState, isLocked)
            : render}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  )
}
