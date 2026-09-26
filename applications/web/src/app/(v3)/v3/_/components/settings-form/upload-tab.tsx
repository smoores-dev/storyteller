"use client"

import { useWatch } from "react-hook-form"

import { Field, FieldDescription, FieldLabel } from "@v3/_/components/ui/field"
import { Input } from "@v3/_/components/ui/input"
import { Switch } from "@v3/_/components/ui/switch"
import { useTranslation } from "@v3/_/hooks/use-translation"

import {
  LockTooltip,
  SettingsFormField,
  useSettingsForm,
} from "./SettingsFormProvider"
import { SettingsCard, SettingsSection } from "./shared"

export function UploadSection({
  maxUploadChunkSize,
}: {
  maxUploadChunkSize: { overriden: boolean } | undefined
}) {
  const { form, lockedSettings } = useSettingsForm()
  const t = useTranslation("SettingsPage.tabs.server.sections.upload")
  const maxUploadChunkSizeValue = useWatch({
    control: form.control,
    name: "maxUploadChunkSize",
  })

  const isMaxUploadChunkSizeLocked = lockedSettings.has("maxUploadChunkSize")

  return (
    <div className="space-y-6">
      <SettingsSection id="upload">
        <SettingsCard title={t("title")}>
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
              tip={t("maxChunkSizeTip")}
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
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
