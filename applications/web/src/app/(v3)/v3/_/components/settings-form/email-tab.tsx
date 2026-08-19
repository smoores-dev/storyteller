"use client"

import { Controller } from "react-hook-form"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import { Checkbox } from "@v3/_/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@v3/_/components/ui/field"
import { Input } from "@v3/_/components/ui/input"
import { useTranslation } from "@v3/_/hooks/use-translation"

import {
  LockTooltip,
  SettingsFormField,
  useSettingsForm,
} from "./SettingsFormProvider"
import { SettingsSection } from "./shared"

export function EmailTab() {
  const { form, lockedSettings } = useSettingsForm()
  const t = useTranslation("SettingsPage.tabs.email.sections.email")

  return (
    <div className="space-y-6">
      <SettingsSection tab="email" section="email">
        <Card>
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <FieldGroup className="pt-4">
              <Controller
                name="smtpSsl"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field
                    orientation="horizontal"
                    data-invalid={fieldState.invalid}
                    data-disabled={lockedSettings.has("smtpSsl")}
                  >
                    <Checkbox
                      id="smtpSsl"
                      disabled={lockedSettings.has("smtpSsl")}
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                    <div className="space-y-1">
                      <FieldLabel htmlFor="smtpSsl">
                        {t("forceTls")}
                        {lockedSettings.has("smtpSsl") && <LockTooltip />}
                      </FieldLabel>
                      <FieldDescription>
                        {t("forceTlsDescription")}
                      </FieldDescription>
                    </div>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

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
          </CardContent>
        </Card>
      </SettingsSection>
    </div>
  )
}
