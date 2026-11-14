"use client"

import { Controller, useFieldArray, useWatch } from "react-hook-form"

import { Button } from "@v3/_/components/ui/button"
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
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useVersionBasePath } from "@v3/_/components/version-context"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type ApiTokenSummary } from "@/database/apiTokens"
import * as icon from "@/icons"

import { ApiTokensCard } from "./api-tokens-card"
import { type PreferencesFormType, PreferencesSection } from "./shared"

export function DevicesTab({
  form,
  kindleSender,
  apiTokens,
}: {
  form: PreferencesFormType
  kindleSender: string | null
  apiTokens: ApiTokenSummary[]
}) {
  const t = useTranslation("PreferencesPage.tabs.devices.sections")
  const basePath = useVersionBasePath()

  return (
    <div className="space-y-6">
      <PreferencesSection id="pairDevice">
        <Card>
          <CardHeader>
            <CardTitle>{t("pairDevice.title")}</CardTitle>
            <CardDescription>{t("pairDevice.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <a href={`${basePath}/device/start`}>
                  <icon.Scan className="mr-1 h-4 w-4" />
                  {t("pairDevice.action")}
                </a>
              }
            />
          </CardContent>
        </Card>
      </PreferencesSection>

      <KindleSection form={form} kindleSender={kindleSender} />

      <PreferencesSection id="apiTokens">
        <ApiTokensCard initialTokens={apiTokens} />
      </PreferencesSection>
    </div>
  )
}

function KindleSection({
  form,
  kindleSender,
}: {
  form: PreferencesFormType
  kindleSender: string | null
}) {
  const t = useTranslation("PreferencesPage.tabs.devices.sections.kindle")

  const {
    fields: addresses,
    append: appendAddress,
    remove: removeAddress,
  } = useFieldArray({
    control: form.control,
    name: "kindleAddresses",
  })

  const watchedAddresses = useWatch({
    control: form.control,
    name: "kindleAddresses",
  })

  const rawDefaultIndex = watchedAddresses.findIndex(
    (address) => address.default,
  )
  const defaultIndex = rawDefaultIndex >= 0 ? rawDefaultIndex : 0

  const handleAddAddress = () => {
    const current = form.getValues("kindleAddresses")
    const hasDefault = current.some((address) => address.default)

    appendAddress({
      name: "",
      email: "",
      default: !hasDefault,
    })
  }

  const handleSetDefault = (index: number) => {
    const current = form.getValues("kindleAddresses")

    current.forEach((_, idx) => {
      form.setValue(`kindleAddresses.${idx}.default`, idx === index, {
        shouldDirty: true,
      })
    })
  }

  const handleRemoveAddress = (index: number) => {
    const current = form.getValues("kindleAddresses")
    const wasDefault =
      current[index]?.default ||
      (index === 0 && !current.some((address) => address.default))

    removeAddress(index)

    if (wasDefault && current.length > 1) {
      form.setValue("kindleAddresses.0.default", true, { shouldDirty: true })
    }
  }

  return (
    <PreferencesSection id="kindle">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel>{t("label")}</FieldLabel>

            <div className="flex flex-col gap-2">
              {addresses.map((address, index) => {
                const isDefault = index === defaultIndex

                return (
                  <div key={address.key} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Controller
                        name={`kindleAddresses.${index}.name`}
                        control={form.control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            placeholder={t("namePlaceholder")}
                            className="w-44 max-w-full"
                          />
                        )}
                      />

                      <Controller
                        name={`kindleAddresses.${index}.email`}
                        control={form.control}
                        render={({ field, fieldState }) => (
                          <Input
                            {...field}
                            type="email"
                            placeholder={t("emailPlaceholder")}
                            aria-invalid={fieldState.invalid}
                            className="w-64 max-w-full flex-1"
                            onChange={(event) => {
                              field.onChange(event.target.value.trim())
                            }}
                          />
                        )}
                      />

                      <TooltipButton
                        type="button"
                        variant="ghost"
                        size="icon"
                        tooltip={isDefault ? t("default") : t("setDefault")}
                        aria-label={isDefault ? t("default") : t("setDefault")}
                        onClick={() => {
                          handleSetDefault(index)
                        }}
                      >
                        <icon.Star
                          className={cn(
                            "size-4",
                            isDefault
                              ? "text-primary fill-current"
                              : "text-muted-foreground",
                          )}
                        />
                      </TooltipButton>

                      <TooltipButton
                        type="button"
                        variant="ghost"
                        size="icon"
                        tooltip={t("remove")}
                        aria-label={t("remove")}
                        onClick={() => {
                          handleRemoveAddress(index)
                        }}
                      >
                        <icon.Trash className="size-4" />
                      </TooltipButton>
                    </div>

                    <Controller
                      name={`kindleAddresses.${index}.email`}
                      control={form.control}
                      render={({ fieldState }) =>
                        fieldState.error ? (
                          <FieldError errors={[fieldState.error]} />
                        ) : (
                          <></>
                        )
                      }
                    />
                  </div>
                )
              })}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={handleAddAddress}
              >
                <icon.Add className="size-4" />
                {t("add")}
              </Button>
            </div>
          </Field>

          {kindleSender ? (
            <Field>
              <FieldLabel>{t("senderLabel")}</FieldLabel>
              <code className="bg-muted w-fit rounded px-1.5 py-0.5 text-xs">
                {kindleSender}
              </code>
              <FieldDescription>{t("senderHint")}</FieldDescription>
            </Field>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("notConfigured")}
            </p>
          )}
        </CardContent>
      </Card>
    </PreferencesSection>
  )
}
