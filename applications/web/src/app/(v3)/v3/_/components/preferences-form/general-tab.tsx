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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { locales } from "@/i18n/locales"
import * as icon from "@/icons"

import { SettingLabel, useLibraryDefaultValue } from "./library-defaults"
import { type PreferencesFormType, PreferencesSection } from "./shared"

const localeOptions = Object.entries(locales).map(([key, locale]) => ({
  value: key,
  label: `${locale.flag} ${locale.label}`,
}))

export function GeneralTab({
  form,
  kindleSender,
}: {
  form: PreferencesFormType
  kindleSender: string | null
}) {
  const t = useTranslation("PreferencesPage.tabs.general.sections")
  const localeDefault = useLibraryDefaultValue("locale")

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

      <PreferencesSection tab="general" section="kindle">
        <Card>
          <CardHeader>
            <CardTitle>{t("kindle.title")}</CardTitle>
            <CardDescription>{t("kindle.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field>
              <FieldLabel>{t("kindle.label")}</FieldLabel>

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
                              placeholder={t("kindle.namePlaceholder")}
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
                              placeholder={t("kindle.emailPlaceholder")}
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
                          tooltip={
                            isDefault
                              ? t("kindle.default")
                              : t("kindle.setDefault")
                          }
                          aria-label={
                            isDefault
                              ? t("kindle.default")
                              : t("kindle.setDefault")
                          }
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
                          tooltip={t("kindle.remove")}
                          aria-label={t("kindle.remove")}
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
                  {t("kindle.add")}
                </Button>
              </div>
            </Field>

            {kindleSender ? (
              <Field>
                <FieldLabel>{t("kindle.senderLabel")}</FieldLabel>
                <code className="bg-muted w-fit rounded px-1.5 py-0.5 text-xs">
                  {kindleSender}
                </code>
                <FieldDescription>{t("kindle.senderHint")}</FieldDescription>
              </Field>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("kindle.notConfigured")}
              </p>
            )}
          </CardContent>
        </Card>
      </PreferencesSection>
    </div>
  )
}
