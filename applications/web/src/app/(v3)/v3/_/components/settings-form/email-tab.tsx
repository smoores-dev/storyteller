"use client"

import { Controller } from "react-hook-form"

import { Checkbox } from "@v3/_/components/ui/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
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
import { useTranslation } from "@v3/_/hooks/use-translation"

import {
  LockTooltip,
  SettingsFormField,
  useSettingsForm,
} from "./SettingsFormProvider"
import { SettingsCard, SettingsSection } from "./shared"

export function EmailSection() {
  const { form, lockedSettings } = useSettingsForm()
  const t = useTranslation("SettingsPage.tabs.server.sections.email")

  const securityOptions = [
    { value: "starttls", label: t("connectionStarttls") },
    { value: "tls", label: t("connectionTls") },
  ]

  return (
    <div className="space-y-6">
      <SettingsSection id="email">
        <SettingsCard title={t("title")} description={t("description")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsFormField
              name="smtpHost"
              label={t("smtpHost")}
              render={(field, fieldState, isLocked) => (
                <Input
                  id="smtpHost"
                  disabled={isLocked}
                  {...field}
                  aria-invalid={fieldState.invalid}
                />
              )}
            />
            <SettingsFormField
              name="smtpPort"
              label={t("smtpPort")}
              render={(field, fieldState, isLocked) => (
                <Input
                  id="smtpPort"
                  type="number"
                  disabled={isLocked}
                  {...field}
                  onChange={(e) => {
                    field.onChange(parseInt(e.target.value) || 587)
                  }}
                  aria-invalid={fieldState.invalid}
                />
              )}
            />
          </div>

          <SettingsFormField
            name="smtpFrom"
            label={t("smtpFrom")}
            render={(field, fieldState, isLocked) => (
              <Input
                id="smtpFrom"
                disabled={isLocked}
                {...field}
                aria-invalid={fieldState.invalid}
              />
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsFormField
              name="smtpUsername"
              label={t("smtpUsername")}
              render={(field, fieldState, isLocked) => (
                <Input
                  id="smtpUsername"
                  disabled={isLocked}
                  {...field}
                  aria-invalid={fieldState.invalid}
                />
              )}
            />
            <SettingsFormField
              name="smtpPassword"
              label={t("smtpPassword")}
              render={(field, fieldState, isLocked) => (
                <Input
                  id="smtpPassword"
                  type="password"
                  disabled={isLocked}
                  {...field}
                  aria-invalid={fieldState.invalid}
                />
              )}
            />
          </div>

          <SettingsFormField
            name="smtpSsl"
            label={t("connectionSecurity")}
            tip={t("connectionSecurityTip")}
            render={(field, fieldState, isLocked) => (
              <Select
                disabled={isLocked}
                aria-invalid={fieldState.invalid}
                items={securityOptions}
                value={field.value ? "tls" : "starttls"}
                onValueChange={(value) => {
                  field.onChange(value === "tls")
                }}
              >
                <SelectTrigger className="w-60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {securityOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />

          <FieldGroup className="pt-2">
            <Controller
              name="smtpRejectUnauthorized"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field
                  orientation="horizontal"
                  data-invalid={fieldState.invalid}
                  data-disabled={lockedSettings.has("smtpRejectUnauthorized")}
                >
                  <Checkbox
                    id="smtpRejectUnauthorized"
                    disabled={lockedSettings.has("smtpRejectUnauthorized")}
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                  />
                  <FieldLabel htmlFor="smtpRejectUnauthorized">
                    {t("rejectSelfSigned")}
                    {lockedSettings.has("smtpRejectUnauthorized") && (
                      <LockTooltip />
                    )}
                  </FieldLabel>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
