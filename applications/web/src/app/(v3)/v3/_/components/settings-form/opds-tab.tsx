"use client"

import { useEffect, useState } from "react"
import { Controller, useWatch } from "react-hook-form"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@v3/_/components/ui/field"
import { Input } from "@v3/_/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { Switch } from "@v3/_/components/ui/switch"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { SETTINGS_DEFAULTS } from "@/database/settingsTypes"

import {
  LockTooltip,
  SettingsFormField,
  useSettingsForm,
} from "./SettingsFormProvider"
import {
  OptionWithHint,
  SettingsCard,
  SettingsSection,
  safeUrl,
} from "./shared"

export function OpdsSection() {
  const { form, lockedSettings } = useSettingsForm()
  const t = useTranslation("SettingsPage.tabs.server.sections.opds")
  const opdsEnabled = useWatch({ control: form.control, name: "opdsEnabled" })
  const webUrl = useWatch({ control: form.control, name: "webUrl" })

  const [origin, setOrigin] = useState("")
  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])
  const base = origin || webUrl

  const opdsV1Url = safeUrl(base, "/opds/v1")
  const opdsV2Url = safeUrl(base, "/opds/v2")

  const formatOptions = [
    {
      value: "readaloud",
      label: t("formatReadaloud"),
      hint: t("formatReadaloudHint"),
    },
    { value: "ebook", label: t("formatEbook"), hint: t("formatEbookHint") },
    { value: "both", label: t("formatBoth"), hint: t("formatBothHint") },
  ]

  return (
    <div className="space-y-6">
      <SettingsSection id="opds">
        <SettingsCard title={t("title")} tip={t("tip")}>
          <Controller
            name="opdsEnabled"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field
                orientation="horizontal"
                data-invalid={fieldState.invalid}
                data-disabled={lockedSettings.has("opdsEnabled")}
              >
                <Switch
                  id="opdsEnabled"
                  disabled={lockedSettings.has("opdsEnabled")}
                  checked={field.value ?? false}
                  onCheckedChange={field.onChange}
                />
                <div className="space-y-1">
                  <FieldLabel htmlFor="opdsEnabled">
                    {t("enabled")}
                    {lockedSettings.has("opdsEnabled") && <LockTooltip />}
                  </FieldLabel>
                  <FieldDescription>{t("enabledDescription")}</FieldDescription>
                </div>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          {opdsEnabled && (
            <>
              <SettingsFormField
                name="opdsPageSize"
                label={t("pageSize")}
                render={(field, fieldState, isLocked) => (
                  <Input
                    id="opdsPageSize"
                    type="number"
                    min={1}
                    placeholder={String(SETTINGS_DEFAULTS.opdsPageSize)}
                    className="w-32"
                    disabled={isLocked}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      field.onChange(parseInt(e.target.value) || null)
                    }}
                    aria-invalid={fieldState.invalid}
                  />
                )}
              />

              <SettingsFormField
                name="opdsFormat"
                label={t("format")}
                tip={t("formatTip")}
                render={(field, fieldState, isLocked) => (
                  <Select
                    disabled={isLocked}
                    aria-invalid={fieldState.invalid}
                    items={formatOptions}
                    value={field.value ?? "readaloud"}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {formatOptions.map(({ value, label, hint }) => (
                        <SelectItem key={value} value={value}>
                          <OptionWithHint label={label} hint={hint} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />

              <div className="space-y-1 border-t pt-4">
                <FieldLabel>{t("urlsTitle")}</FieldLabel>
                <div className="mt-2 space-y-1 text-sm">
                  <div>
                    {t("urlV1")}: <code className="break-all">{opdsV1Url}</code>
                  </div>
                  <div>
                    {t("urlV2")}: <code className="break-all">{opdsV2Url}</code>
                  </div>
                </div>
              </div>
            </>
          )}
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
