"use client"

import { useTranslations } from "next-intl"
import { useWatch } from "react-hook-form"

import { usePermissions } from "@/hooks/usePermissions"
import {
  useGetScanStateQuery,
  useTriggerScanMutation,
} from "@/store/api"

import { Button } from "@v3/_/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import { Input } from "@v3/_/components/ui/input"
import { Label } from "@v3/_/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { Switch } from "@v3/_/components/ui/switch"
import { TabsContent } from "@v3/_/components/ui/tabs"

import { SettingsFormField, useSettingsForm } from "./SettingsFormProvider"
import { SettingsSection } from "./shared"

export function LibraryTab() {
  return (
    <TabsContent value="library" className="space-y-6">
      <LibrarySection />
      <AutoImportSection />
      <ScanControlsSection />
      <ReadaloudLocationSection />
    </TabsContent>
  )
}

function LibrarySection() {
  const t = useTranslations("SettingsPage.tabs.library.sections.library")

  return (
    <SettingsSection tab="library" section="library">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingsFormField
            name="libraryName"
            label={t("libraryName")}
            render={(field, fieldState, isLocked) => (
              <Input
                id="libraryName"
                disabled={isLocked}
                {...field}
                aria-invalid={fieldState.invalid}
              />
            )}
          />
          <SettingsFormField
            name="webUrl"
            label={t("webUrl")}
            render={(field, fieldState, isLocked) => (
              <Input
                id="webUrl"
                disabled={isLocked}
                {...field}
                aria-invalid={fieldState.invalid}
              />
            )}
          />
        </CardContent>
      </Card>
    </SettingsSection>
  )
}

function AutoImportSection() {
  const t = useTranslations("SettingsPage.tabs.library.sections.autoImport")
  return (
    <SettingsSection tab="library" section="autoImport">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t("title")}
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{t("explanation")}</p>
          <SettingsFormField
            name="importPath"
            label={t("importPath")}
            render={(field, fieldState, isLocked) => (
              <Input
                id="importPath"
                disabled={isLocked}
                placeholder={t("importPathPlaceholder")}
                value={field["value"] ?? ""}
                onChange={(e) => {
                  field["onChange"](e.target.value || null)
                }}
                aria-invalid={fieldState.invalid}
              />
            )}
          />
        </CardContent>
      </Card>
    </SettingsSection>
  )
}

function ScanControlsSection() {
  const { form } = useSettingsForm()
  const t = useTranslations("SettingsPage.tabs.library.sections.scanControls")
  const permissions = usePermissions()

  const { data: scanState } = useGetScanStateQuery(undefined, {
    pollingInterval: 5_000,
    skip: !permissions?.bookProcess,
  })
  const [triggerScan, { isLoading: isTriggeringScan }] =
    useTriggerScanMutation()

  const scheduledInterval = useWatch({
    control: form.control,
    name: "existingBooksScanIntervalMinutes",
  })
  const isScheduled = scheduledInterval !== null

  const metadataOverrideOptions = [
    { value: "fill-empty", label: t("metadataOverrideFillEmpty") },
    { value: "always", label: t("metadataOverrideAlways") },
    { value: "never", label: t("metadataOverrideNever") },
  ]

  return (
    <SettingsSection tab="library" section="scanControls">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {permissions?.bookProcess && (
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={scanState?.running || isTriggeringScan}
                onClick={() => {
                  void triggerScan({ scope: "all", force: true })
                }}
              >
                {t("triggerFullScan")}
              </Button>

              {scanState?.running && (
                <p className="text-muted-foreground text-sm">
                  {t("scanRunning", { source: scanState.source ?? "unknown" })}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch
              id="enableScheduledScans"
              checked={isScheduled}
              onCheckedChange={(checked) => {
                form.setValue(
                  "existingBooksScanIntervalMinutes",
                  checked ? 1440 : null,
                )
              }}
            />
            <Label htmlFor="enableScheduledScans">
              {t("enableScheduledScans")}
            </Label>
          </div>

          {isScheduled && (
            <SettingsFormField
              name="existingBooksScanIntervalMinutes"
              label={t("scanInterval")}
              render={(field, fieldState, isLocked) => (
                <Input
                  id="existingBooksScanIntervalMinutes"
                  type="number"
                  min={1}
                  disabled={isLocked}
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const val = e.target.value
                    field.onChange(val === "" ? null : Number(val))
                  }}
                  aria-invalid={fieldState.invalid}
                />
              )}
            />
          )}

          <SettingsFormField
            name="metadataOverrideMode"
            label={t("metadataOverrideMode")}
            description={t("metadataOverrideModeDescription")}
            render={(field, _, isLocked) => (
              <Select
                items={metadataOverrideOptions}
                disabled={isLocked}
                value={field.value}
                onValueChange={(value) => {
                  if (!value) return
                  field.onChange(value)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metadataOverrideOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </CardContent>
      </Card>
    </SettingsSection>
  )
}

function ReadaloudLocationSection() {
  const { form } = useSettingsForm()
  const t = useTranslations(
    "SettingsPage.tabs.library.sections.readaloudLocation",
  )
  const locationType = useWatch({
    control: form.control,
    name: "readaloudLocationType",
  })

  const readaloudLocationOptions = [
    { value: "SUFFIX", label: t("locationTypeSuffix") },
    { value: "SIBLING_FOLDER", label: t("locationTypeSiblingFolder") },
    { value: "CUSTOM_FOLDER", label: t("locationTypeCustomFolder") },
    { value: "INTERNAL", label: t("locationTypeInternal") },
  ]

  return (
    <SettingsSection tab="library" section="readaloudLocation">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingsFormField
            name="readaloudLocationType"
            label={t("locationType")}
            render={(field, _, isLocked) => (
              <Select
                items={readaloudLocationOptions}
                disabled={isLocked}
                value={field.value}
                onValueChange={(value) => {
                  if (!value) return
                  field.onChange(value)
                  switch (value) {
                    case "SUFFIX":
                      form.setValue("readaloudLocation", " (readaloud)")
                      break
                    case "SIBLING_FOLDER":
                      form.setValue("readaloudLocation", "readaloud")
                      break
                    case "CUSTOM_FOLDER":
                      form.setValue("readaloudLocation", "/readalouds")
                      break
                    case "INTERNAL":
                      form.setValue("readaloudLocation", "")
                      break
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {readaloudLocationOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {locationType !== "INTERNAL" && (
            <SettingsFormField
              name="readaloudLocation"
              label={
                locationType === "SUFFIX"
                  ? t("locationTypeSuffix")
                  : locationType === "SIBLING_FOLDER"
                    ? t("locationTypeSiblingFolder")
                    : t("locationTypeCustomFolder")
              }
              render={(field, fieldState, isLocked) => (
                <Input
                  id="readaloudLocation"
                  disabled={isLocked}
                  {...field}
                  aria-invalid={fieldState.invalid}
                />
              )}
            />
          )}
        </CardContent>
      </Card>
    </SettingsSection>
  )
}
