"use client"

import { useWatch } from "react-hook-form"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@v3/_/components/ui/field"
import { Input } from "@v3/_/components/ui/input"
import { Switch } from "@v3/_/components/ui/switch"
import { useTranslation } from "@v3/_/hooks/use-translation"

import {
  LockTooltip,
  SettingsFormField,
  useSettingsForm,
} from "./SettingsFormProvider"
import { SettingsSection } from "./shared"

export function UploadTab({
  maxUploadChunkSize,
}: {
  maxUploadChunkSize: { overriden: boolean } | undefined
}) {
  const { form, lockedSettings } = useSettingsForm()
  const t = useTranslation("SettingsPage.tabs.upload.sections.upload")
  const maxUploadChunkSizeValue = useWatch({
    control: form.control,
    name: "maxUploadChunkSize",
  })

  const isMaxUploadChunkSizeLocked = lockedSettings.has("maxUploadChunkSize")

  return (
    <div className="space-y-6">
      <SettingsSection tab="upload" section="upload">
        <Card>
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {maxUploadChunkSize?.overriden && (
              <p className="text-muted-foreground bg-muted rounded-md p-3 text-sm">
                {t("overriddenWarning")}
              </p>
            )}

            <Field
              orientation="horizontal"
              data-disabled={isMaxUploadChunkSizeLocked}
            >
              <Switch
                id="enableMaxChunkSize"
                disabled={
                  isMaxUploadChunkSizeLocked ||
                  (maxUploadChunkSize?.overriden ?? false)
                }
                checked={maxUploadChunkSizeValue !== null}
                onCheckedChange={(checked) => {
                  if (checked) {
                    form.setValue("maxUploadChunkSize", 100_000_000, {
                      shouldDirty: true,
                    })
                  } else {
                    form.setValue("maxUploadChunkSize", null, {
                      shouldDirty: true,
                    })
                  }
                }}
              />
              <div className="space-y-1">
                <FieldLabel htmlFor="enableMaxChunkSize">
                  {t("enableMaxChunkSize")}
                  {isMaxUploadChunkSizeLocked && <LockTooltip />}
                </FieldLabel>
                <FieldDescription>
                  {t("enableMaxChunkSizeDescription")}
                </FieldDescription>
              </div>
            </Field>

            {maxUploadChunkSizeValue !== null && (
              <SettingsFormField
                name="maxUploadChunkSize"
                label={t("maxChunkSize")}
                description={t("maxChunkSizeDescription")}
                render={(field, fieldState, isLocked) => (
                  <Input
                    id="maxUploadChunkSize"
                    type="number"
                    disabled={
                      isLocked || (maxUploadChunkSize?.overriden ?? false)
                    }
                    value={field.value ?? ""}
                    onChange={(e) => {
                      field.onChange(parseInt(e.target.value) || null)
                    }}
                    aria-invalid={fieldState.invalid}
                  />
                )}
              />
            )}
          </CardContent>
        </Card>
      </SettingsSection>
    </div>
  )
}
