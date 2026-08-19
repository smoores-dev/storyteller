"use client"

import { useEffect, useState } from "react"
import { Controller, useWatch } from "react-hook-form"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
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

import {
  LockTooltip,
  SettingsFormField,
  useSettingsForm,
} from "./SettingsFormProvider"
import { SettingsSection, safeUrl } from "./shared"

export function OpdsTab() {
  const { form, lockedSettings } = useSettingsForm()
  const t = useTranslation("SettingsPage.tabs.opds.sections.opds")
  const opdsEnabled = useWatch({ control: form.control, name: "opdsEnabled" })
  const webUrl = useWatch({ control: form.control, name: "webUrl" })

  // prefer the URL the admin is actually browsing; fall back to the configured
  // web URL during SSR / before hydration.
  const [origin, setOrigin] = useState("")
  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])
  const base = origin || webUrl

  const opdsUrl = safeUrl(base, "/opds")
  const opdsV1Url = safeUrl(base, "/opds/v1")
  const opdsV2Url = safeUrl(base, "/opds/v2")

  const formatOptions = [
    { value: "readaloud", label: t("formatReadaloud") },
    { value: "ebook", label: t("formatEbook") },
    { value: "both", label: t("formatBoth") },
  ]

  return (
    <div className="space-y-6">
      <SettingsSection tab="opds" section="opds">
        <Card>
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                    <FieldDescription>
                      {t("enabledDescription", { url: opdsUrl })}
                    </FieldDescription>
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
                  description={t("pageSizeDescription")}
                  render={(field, fieldState, isLocked) => (
                    <Input
                      id="opdsPageSize"
                      type="number"
                      min={1}
                      disabled={isLocked}
                      value={field.value ?? 25}
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
                  description={t("formatDescription")}
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
                        {formatOptions.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />

                <div className="space-y-1 border-t pt-4">
                  <FieldLabel>{t("urlsTitle")}</FieldLabel>
                  <FieldDescription>{t("urlsDescription")}</FieldDescription>
                  <div className="mt-2 space-y-1 text-sm">
                    <div>
                      {t("urlV1")}:{" "}
                      <code className="break-all">{opdsV1Url}</code>
                    </div>
                    <div>
                      {t("urlV2")}:{" "}
                      <code className="break-all">{opdsV2Url}</code>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </SettingsSection>
    </div>
  )
}
