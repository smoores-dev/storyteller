"use client"

import { Controller } from "react-hook-form"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import { Field } from "@v3/_/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { locales } from "@/i18n/locales"

import { SettingLabel, useLibraryDefaultValue } from "./library-defaults"
import { type PreferencesFormType, PreferencesSection } from "./shared"

const localeOptions = Object.entries(locales).map(([key, locale]) => ({
  value: key,
  label: `${locale.flag} ${locale.label}`,
}))

export function GeneralTab({ form }: { form: PreferencesFormType }) {
  const t = useTranslation("PreferencesPage.tabs.general.sections")
  const localeDefault = useLibraryDefaultValue("locale")

  return (
    <div className="space-y-6">
      <PreferencesSection tab="general" section="language">
        <Card>
          <CardHeader>
            <CardTitle>{t("language.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Controller
              name="locale"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <SettingLabel field="locale">
                    {t("language.label")}
                  </SettingLabel>
                  <Select
                    items={localeOptions}
                    value={field.value ?? localeDefault ?? ""}
                    onValueChange={(value) => {
                      field.onChange(value || null)
                    }}
                  >
                    <SelectTrigger className="w-60">
                      <SelectValue placeholder={t("language.systemDefault")} />
                    </SelectTrigger>
                    <SelectContent>
                      {localeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
          </CardContent>
        </Card>
      </PreferencesSection>
    </div>
  )
}
