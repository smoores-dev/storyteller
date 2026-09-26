"use client"

import { useRef } from "react"

import { MediaType } from "@storyteller-platform/media-types"

import { Button } from "@v3/_/components/ui/button"
import { FieldDescription } from "@v3/_/components/ui/field"
import { Input } from "@v3/_/components/ui/input"

import { useIsTauri } from "@/app/(v3)/v3/_/hooks/use-is-tauri"
import { useTranslation } from "@/app/(v3)/v3/_/hooks/use-translation"
import * as icon from "@/icons"
import { getImageUrl, useUploadImageMutation } from "@/store/api"

import { SettingsFormField } from "./SettingsFormProvider"
import { SettingsCard, SettingsSection } from "./shared"

export function ServerIdentitySection() {
  const t = useTranslation("SettingsPage.tabs.server.sections.identity")
  const isTauri = useIsTauri()

  return (
    <SettingsSection id="identity">
      <SettingsCard title={t("title")}>
        <SettingsFormField
          name="libraryName"
          label={t("libraryName")}
          render={(field, fieldState, isLocked) => (
            <Input
              id="libraryName"
              disabled={isLocked}
              placeholder="The Library of Babel"
              {...field}
              aria-invalid={fieldState.invalid}
            />
          )}
        />

        {!isTauri && (
          <SettingsFormField
            name="webUrl"
            label={t("webUrl")}
            description={t("webUrlDescription")}
            render={(field, fieldState, isLocked) => (
              <Input
                id="webUrl"
                disabled={isLocked}
                placeholder="https://<your-domain>.com"
                {...field}
                aria-invalid={fieldState.invalid}
              />
            )}
          />
        )}

        <ServerIconField />
      </SettingsCard>
    </SettingsSection>
  )
}

const ICON_ACCEPT = [
  MediaType.PNG,
  MediaType.JPEG,
  MediaType.WEBP,
  MediaType.AVIF,
  MediaType.GIF,
]
  .map((type) => type.mime)
  .join(",")

function ServerIconField() {
  const t = useTranslation("SettingsPage.tabs.server.sections.identity")
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploadImage, { isLoading, isError, reset }] = useUploadImageMutation()

  return (
    <SettingsFormField
      name="serverIconSha256"
      label={t("serverIcon")}
      render={(field, _, isLocked) => {
        const sha256 = field.value ?? null

        return (
          <>
            <div className="flex items-center gap-3">
              <div className="bg-muted flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border">
                {sha256 ? (
                  <img
                    src={getImageUrl(sha256, 128)}
                    alt=""
                    className="size-full object-cover"
                    width={56}
                    height={56}
                  />
                ) : (
                  <icon.Image className="text-muted-foreground size-5" />
                )}
              </div>

              <input
                ref={inputRef}
                id="serverIconSha256"
                type="file"
                accept={ICON_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (!file) return

                  reset()
                  void uploadImage(file)
                    .unwrap()
                    .then((image) => {
                      field.onChange(image.sha256)
                    })
                    .catch(() => {})
                }}
              />

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isLocked || isLoading}
                onClick={() => inputRef.current?.click()}
              >
                {sha256 ? t("serverIconReplace") : t("serverIconUpload")}
              </Button>

              {sha256 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isLocked || isLoading}
                  onClick={() => {
                    field.onChange(null)
                  }}
                >
                  {t("serverIconRemove")}
                </Button>
              )}
            </div>

            <FieldDescription>
              {isError ? t("serverIconError") : t("serverIconDescription")}
            </FieldDescription>
          </>
        )
      }}
    />
  )
}
