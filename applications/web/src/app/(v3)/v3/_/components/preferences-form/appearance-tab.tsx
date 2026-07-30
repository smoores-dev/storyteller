"use client"

import { Controller, useWatch } from "react-hook-form"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import { Field, FieldDescription } from "@v3/_/components/ui/field"
import { Slider } from "@v3/_/components/ui/slider"
import { Switch } from "@v3/_/components/ui/switch"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { ColorModes, ShellThemes } from "@/database/userPreferencesTypes"

import { AccentColorPicker } from "./accent-color-picker"
import { ColorfulnessPreview } from "./colorfulness-preview"
import {
  SettingLabel,
  useLibraryDefaultValue,
  useResolvedDefault,
} from "./library-defaults"
import {
  type PreferencesFormType,
  PreferencesSection,
  SegmentedControl,
} from "./shared"

export function AppearanceTab({ form }: { form: PreferencesFormType }) {
  const t = useTranslation("PreferencesPage.tabs.appearance.sections")

  const colorModeOptions = ColorModes.map((key) => ({
    value: key,
    label: t(`colorfulness.levels.${key}`),
  }))

  const accentDefault = useLibraryDefaultValue("accentColor")
  const colorModeDefault = useResolvedDefault("colorMode")
  const colorIntensityDefault = useResolvedDefault("colorIntensity")
  const layoutAnimationsDefault = useResolvedDefault("layoutAnimations")
  const animatePanelOpenDefault = useResolvedDefault("animatePanelOpen")

  const colorMode =
    useWatch({ control: form.control, name: "colorMode" }) ?? colorModeDefault
  const colorIntensity =
    useWatch({ control: form.control, name: "colorIntensity" }) ??
    colorIntensityDefault

  const shellThemeOptions = ShellThemes.map((key) => ({
    value: key,
    label: t(`shell.options.${key}`),
  }))

  return (
    <div className="space-y-6">
      <PreferencesSection tab="appearance" section="shell">
        <Card>
          <CardHeader>
            <CardTitle>{t("shell.title")}</CardTitle>
            <CardDescription>{t("shell.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              name="shellTheme"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <SettingLabel field="shellTheme">
                    {t("shell.label")}
                  </SettingLabel>
                  <FieldDescription>{t("shell.hint")}</FieldDescription>
                  <SegmentedControl
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value)
                    }}
                    options={shellThemeOptions}
                  />
                </Field>
              )}
            />
          </CardContent>
        </Card>
      </PreferencesSection>

      <PreferencesSection tab="appearance" section="accent">
        <Card>
          <CardHeader>
            <CardTitle>{t("accent.title")}</CardTitle>
            <CardDescription>{t("accent.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              name="accentColor"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <SettingLabel field="accentColor">
                    {t("accent.label")}
                  </SettingLabel>
                  <FieldDescription>{t("accent.hint")}</FieldDescription>
                  <AccentColorPicker
                    value={field.value ?? null}
                    onChange={(value) => {
                      field.onChange(value)
                    }}
                    defaultLabel={t("accent.useDefault")}
                    customLabel={t("accent.custom")}
                    defaultColor={accentDefault ?? null}
                  />
                </Field>
              )}
            />
          </CardContent>
        </Card>
      </PreferencesSection>

      <PreferencesSection tab="appearance" section="colorfulness">
        <Card>
          <CardHeader>
            <CardTitle>{t("colorfulness.title")}</CardTitle>
            <CardDescription>{t("colorfulness.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Controller
              name="colorMode"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <SettingLabel field="colorMode">
                    {t("colorfulness.label")}
                  </SettingLabel>
                  <FieldDescription>{t("colorfulness.hint")}</FieldDescription>
                  <SegmentedControl
                    value={field.value ?? colorModeDefault}
                    onChange={(value) => {
                      field.onChange(value)
                    }}
                    options={colorModeOptions}
                  />
                </Field>
              )}
            />

            <Controller
              name="colorIntensity"
              control={form.control}
              render={({ field }) => (
                <Field data-disabled={colorMode === "minimal"}>
                  <SettingLabel field="colorIntensity">
                    {t("colorfulness.intensity.label")}
                  </SettingLabel>
                  <FieldDescription>
                    {t("colorfulness.intensity.hint")}
                  </FieldDescription>
                  <Slider
                    className="max-w-xs"
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={colorMode === "minimal"}
                    value={field.value ?? colorIntensityDefault}
                    onValueChange={(value) => {
                      field.onChange(Array.isArray(value) ? value[0] : value)
                    }}
                  />
                </Field>
              )}
            />

            <ColorfulnessPreview level={colorMode} intensity={colorIntensity} />
          </CardContent>
        </Card>
      </PreferencesSection>

      <PreferencesSection tab="appearance" section="motion">
        <Card>
          <CardHeader>
            <CardTitle>{t("motion.title")}</CardTitle>
            <CardDescription>{t("motion.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Controller
              name="layoutAnimations"
              control={form.control}
              render={({ field }) => (
                <Field orientation="vertical">
                  <div className="flex flex-col gap-1">
                    <SettingLabel field="layoutAnimations">
                      {t("motion.label")}
                    </SettingLabel>
                    <FieldDescription>{t("motion.hint")}</FieldDescription>
                  </div>
                  <Switch
                    checked={field.value ?? layoutAnimationsDefault}
                    onCheckedChange={field.onChange}
                  />
                </Field>
              )}
            />
            <Controller
              name="animatePanelOpen"
              control={form.control}
              render={({ field }) => (
                <Field orientation="vertical">
                  <div className="flex flex-col gap-1">
                    <SettingLabel field="animatePanelOpen">
                      {t("motion.panelLabel")}
                    </SettingLabel>
                    <FieldDescription>{t("motion.panelHint")}</FieldDescription>
                  </div>
                  <Switch
                    checked={field.value ?? animatePanelOpenDefault}
                    onCheckedChange={field.onChange}
                  />
                </Field>
              )}
            />
          </CardContent>
        </Card>
      </PreferencesSection>
    </div>
  )
}
