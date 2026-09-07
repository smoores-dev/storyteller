"use client"

import { TextAlignment } from "@readium/navigator"
import { type ReactNode, useState } from "react"

import { Button } from "@v3/_/components/ui/button"
import {
  FilterableMenuGroup,
  FilterableMenuLabel,
} from "@v3/_/components/ui/filterable-menu"
import { Input } from "@v3/_/components/ui/input"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import {
  READER_THEMES,
  type ReadingPreferences,
} from "@/store/slices/preferencesSlice"

import {
  fontFamilies,
  highlightColors,
  highlightStyles,
  spacingModes,
} from "./prefItems"
import {
  ChoiceItems,
  NestedSelect,
  type PreferenceApi,
  SectionGroup,
  SliderRow,
  ToggleItem,
  readerMenuLabelClassName,
  stopMenuNavigation,
} from "./readerSettingsRows"

export type SectionContentProps = { api: PreferenceApi; inline: boolean }

export type SettingsSectionLabelKey = Parameters<
  ReturnType<typeof useTranslation<"Reader.readerSettings">>["plain"]
>[0]

export type SettingsSection = {
  key: string
  labelKey: SettingsSectionLabelKey
  icon: ReactNode
  keys: readonly (keyof ReadingPreferences)[]
  Content: (props: SectionContentProps) => ReactNode
}

const readerInputClassName =
  "border-reader-border bg-reader-bg text-reader-text placeholder:text-reader-text-muted focus-visible:border-reader-accent focus-visible:ring-reader-accent/30 h-7"

const readerButtonClassName =
  "border-reader-border text-reader-text hover:bg-reader-surface-hover hover:text-reader-text"

const THEME_KEYS = ["theme"] as const

function ThemeItems({
  api,
  scheme,
}: {
  api: PreferenceApi
  scheme: "light" | "dark"
}) {
  const t = useTranslation("Reader.readerSettings.theme")

  return (
    <FilterableMenuGroup>
      <FilterableMenuLabel className={readerMenuLabelClassName}>
        {t(scheme === "light" ? "schemeLight" : "schemeDark")}
      </FilterableMenuLabel>
      <ChoiceItems
        api={api}
        prefKey="theme"
        options={READER_THEMES.filter((theme) => theme.scheme === scheme).map(
          (theme) => ({
            value: theme.id,
            label: t.plain(theme.id),
            icon: (
              <span
                data-reader-theme={theme.id}
                className={cn(
                  "border-reader-border size-3.5 shrink-0 rounded-full border",
                  theme.id.startsWith("cover-")
                    ? "bg-reader-accent"
                    : "bg-reader-bg",
                )}
              />
            ),
          }),
        )}
      />
    </FilterableMenuGroup>
  )
}

export const themeSection = {
  key: "theme",
  labelKey: "theme.title",
  icon: <icon.Palette />,
  keys: THEME_KEYS,
  Content: function ThemeSection({ api }) {
    const t = useTranslation("Reader.readerSettings.theme")

    return (
      <SectionGroup api={api} label={t.plain("title")} keys={THEME_KEYS}>
        <ThemeItems api={api} scheme="light" />
        <ThemeItems api={api} scheme="dark" />
      </SectionGroup>
    )
  },
} satisfies SettingsSection

const TEXT_KEYS = [
  "fontFamily",
  "customFontFamily",
  "fontSize",
  "fontWeight",
  "align",
  "hyphens",
  "lineHeight",
  "paragraphSpacing",
  "lineLength",
] as const

const fontClassName: Record<ReadingPreferences["fontFamily"], string> = {
  publisher: "",
  Literata: "font-literata",
  OpenDyslexic: "font-open-dyslexic",
  serif: "font-serif",
  "sans-serif": "font-sans",
  monospace: "font-mono",
  custom: "",
}

function fontLabel(
  t: ReturnType<typeof useTranslation<"Reader.readerSettings.text">>,
  api: PreferenceApi,
  value: ReadingPreferences["fontFamily"],
) {
  if (value !== "custom") return t.plain(value)
  const { name } = api.values.customFontFamily
  return name ? t.plain("fontCustomNamed", { name }) : t.plain("fontCustom")
}

function CustomFontFields({ api }: { api: PreferenceApi }) {
  const t = useTranslation("Reader.readerSettings.text")
  const c = useCommon()

  return (
    <form
      className="border-reader-border flex flex-col gap-1.5 border-t p-2"
      onKeyDown={stopMenuNavigation}
      action={(formData) => {
        const name = formData.get("name")
        const url = formData.get("url")
        api.set("customFontFamily", {
          name: typeof name === "string" ? name.trim() : "",
          url: typeof url === "string" ? url.trim() : "",
        })
      }}
    >
      <Input
        name="name"
        required
        placeholder={t.plain("fontNamePlaceholder")}
        className={readerInputClassName}
        defaultValue={api.values.customFontFamily.name}
      />
      <Input
        name="url"
        required
        type="url"
        placeholder={t.plain("fontUrlPlaceholder")}
        className={readerInputClassName}
        defaultValue={api.values.customFontFamily.url}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-reader-text-muted text-[10px]">
          {t("fontUrlHint")}
        </span>
        <Button
          type="submit"
          size="xs"
          variant="outline"
          className={readerButtonClassName}
        >
          {c("actions.save")}
        </Button>
      </div>
    </form>
  )
}

export const textSection = {
  key: "text" as const,
  labelKey: "text.title",
  icon: <icon.Aa />,
  keys: TEXT_KEYS,
  Content: function TextSection({ api, inline }) {
    const t = useTranslation("Reader.readerSettings.text")

    return (
      <SectionGroup api={api} label={t("title")} keys={TEXT_KEYS}>
        <NestedSelect
          label={t("font")}
          icon={<icon.Aa />}
          value={fontLabel(t, api, api.values.fontFamily)}
          changed={
            api.overridden("fontFamily") || api.overridden("customFontFamily")
          }
          inline={inline}
        >
          <ChoiceItems
            api={api}
            prefKey="fontFamily"
            options={fontFamilies.map((family) => ({
              value: family.value,
              label: fontLabel(t, api, family.value),
              className: fontClassName[family.value],
            }))}
          />
          {api.values.fontFamily === "custom" && <CustomFontFields api={api} />}
        </NestedSelect>
        <SliderRow
          api={api}
          prefKey="fontSize"
          label={t("fontSize")}
          min={50}
          max={200}
          step={10}
          format={(value) => `${value}%`}
        />
        <SliderRow
          api={api}
          prefKey="fontWeight"
          label={t("fontWeight")}
          min={200}
          max={900}
          step={100}
        />
        <NestedSelect
          label={t("letterSpacing")}
          icon={<icon.TextWrap />}
          value={t.plain(api.values.spacing)}
          changed={api.overridden("spacing")}
          inline={inline}
        >
          <ChoiceItems
            api={api}
            prefKey="spacing"
            options={spacingModes.map((mode) => ({
              value: mode.value,
              label: t.plain(mode.value),
            }))}
          />
        </NestedSelect>
        <NestedSelect
          label={t("alignment")}
          icon={<icon.AlignLeft />}
          value={t.plain(
            api.values.align === TextAlignment.left
              ? "alignmentLeft"
              : "alignmentJustified",
          )}
          changed={api.overridden("align")}
          inline={inline}
        >
          <ChoiceItems
            api={api}
            prefKey="align"
            options={[
              {
                value: TextAlignment.justify,
                label: t.plain("alignmentJustified"),
              },
              { value: TextAlignment.left, label: t.plain("alignmentLeft") },
            ]}
          />
        </NestedSelect>
        <ToggleItem api={api} prefKey="hyphens" label={t("hyphens")} />

        <SliderRow
          api={api}
          prefKey="lineHeight"
          label={t("lineHeight")}
          min={1}
          max={3}
          step={0.1}
          format={(value) => value.toFixed(1)}
        />
        <SliderRow
          api={api}
          prefKey="paragraphSpacing"
          label={t("paragraphSpacing")}
          min={0}
          max={2}
          step={0.1}
          format={(value) => value.toFixed(1)}
        />

        <SliderRow
          api={api}
          prefKey="lineLength"
          label={t("lineLength")}
          min={20}
          max={100}
          step={1}
          format={(value) => t.plain("lineLengthCharacters", { count: value })}
        />
      </SectionGroup>
    )
  },
} satisfies SettingsSection

const LAYOUT_KEYS = ["layout", "columns", "footerDisplayWidth"] as const

const footerWidthLabelKeys = {
  full: "footerWidthWide",
  minimal: "footerWidthNarrow",
  text: "footerWidthFitToText",
} as const satisfies Record<ReadingPreferences["footerDisplayWidth"], string>

export const layoutSection = {
  key: "layout" as const,
  labelKey: "layout.title",
  icon: <icon.LayoutGrid />,
  keys: LAYOUT_KEYS,
  Content: function LayoutSection({ api, inline }) {
    const t = useTranslation("Reader.readerSettings.layout")

    return (
      <SectionGroup api={api} label={t("title")} keys={LAYOUT_KEYS}>
        <ChoiceItems
          api={api}
          prefKey="layout"
          options={[
            {
              value: "paginated",
              label: t.plain("paginated"),
              icon: <icon.Columns />,
            },
            {
              value: "scrollable",
              label: t.plain("scrolling"),
              icon: <icon.ArrowDown />,
            },
          ]}
        />
        <NestedSelect
          label={t("columns")}
          icon={<icon.Columns3 />}
          value={
            api.values.columns
              ? String(api.values.columns)
              : t.plain("columnsAuto")
          }
          changed={api.overridden("columns")}
          inline={inline}
        >
          <ChoiceItems
            api={api}
            prefKey="columns"
            options={[
              { value: 0, label: t.plain("columnsAuto") },
              { value: 1, label: t.plain("columnsOne") },
              { value: 2, label: t.plain("columnsTwo") },
            ]}
          />
        </NestedSelect>
        <NestedSelect
          label={t("footerWidth")}
          icon={<icon.ArrowAutofitWidth />}
          value={t.plain(footerWidthLabelKeys[api.values.footerDisplayWidth])}
          changed={api.overridden("footerDisplayWidth")}
          inline={inline}
        >
          <ChoiceItems
            api={api}
            prefKey="footerDisplayWidth"
            options={[
              { value: "full", label: t.plain("footerWidthWide") },
              { value: "minimal", label: t.plain("footerWidthNarrow") },
              { value: "text", label: t.plain("footerWidthFitToText") },
            ]}
          />
        </NestedSelect>
      </SectionGroup>
    )
  },
} satisfies SettingsSection

const HIGHLIGHT_KEYS = [
  "highlightStyle",
  "highlightColor",
  "customHighlightColor",
  "dimWhilePlaying",
  "syncOffset",
] as const

function CustomHighlightColorFields({ api }: { api: PreferenceApi }) {
  const [draft, setDraft] = useState(api.values.customHighlightColor)

  const t = useTranslation("Reader.readerSettings.highlights")

  return (
    <form
      className="border-reader-border flex items-center gap-1.5 border-t p-2"
      onKeyDown={stopMenuNavigation}
      onSubmit={(event) => {
        event.preventDefault()
        const color = draft.trim()
        if (!color) return
        api.set("customHighlightColor", color)
        api.set("highlightColor", "custom")
      }}
    >
      <span
        className="border-reader-border size-4 shrink-0 rounded-full border"
        style={{ backgroundColor: draft }}
      />
      <Input
        name="color"
        required
        placeholder={t.plain("customUsePlaceholder")}
        className={cn(readerInputClassName, "font-mono")}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
        }}
      />
      <Button
        type="submit"
        size="xs"
        variant="outline"
        className={readerButtonClassName}
      >
        {t("customUse")}
      </Button>
    </form>
  )
}

export const highlightsSection = {
  key: "highlights" as const,
  labelKey: "highlights.title",
  icon: <icon.Highlight />,
  keys: HIGHLIGHT_KEYS,
  Content: function HighlightsSection({ api, inline }) {
    const t = useTranslation("Reader.readerSettings.highlights")

    return (
      <SectionGroup api={api} label={t("title")} keys={HIGHLIGHT_KEYS}>
        <NestedSelect
          label={t("style")}
          icon={<icon.Highlight />}
          value={t.plain(
            highlightStyles.find(
              (style) => style.value === api.values.highlightStyle,
            )?.labelKey ?? "styleHighlight",
          )}
          changed={api.overridden("highlightStyle")}
          inline={inline}
        >
          <ChoiceItems
            api={api}
            prefKey="highlightStyle"
            options={highlightStyles.map((style) => ({
              value: style.value,
              label: t.plain(style.labelKey),
              icon: (
                <span
                  className={cn(
                    "size-3.5 shrink-0 rounded-[3px]",
                    style.className,
                  )}
                />
              ),
            }))}
          />
        </NestedSelect>
        <ChoiceItems
          api={api}
          prefKey="highlightColor"
          options={highlightColors.map((color) => ({
            value: color.value,
            label: t.plain(color.value),
            icon: (
              <span
                className={cn(
                  "border-reader-border size-3.5 shrink-0 rounded-full border",
                  color.value !== "custom" && color.className,
                )}
                style={
                  color.value === "custom"
                    ? { backgroundColor: api.values.customHighlightColor }
                    : undefined
                }
              />
            ),
          }))}
        />
        <CustomHighlightColorFields api={api} />
        <ToggleItem
          api={api}
          prefKey="dimWhilePlaying"
          label={t("dim")}
          icon={<icon.EyeOff />}
          title={t.plain("dimHint")}
        />
        <SliderRow
          api={api}
          prefKey="syncOffset"
          label={t("syncOffset")}
          min={-1}
          max={1}
          step={0.1}
          format={(value) => `${value > 0 ? "+" : ""}${value.toFixed(1)} s`}
        />
      </SectionGroup>
    )
  },
} satisfies SettingsSection

const BEHAVIOUR_KEYS = [
  "skipOnTurnPage",
  "openPipOnTabOut",
  "scrollBehavior",
  "smoothScrollImplementation",
  "smoothScrollSpeed",
] as const

export const behaviourSection = {
  key: "behaviour" as const,
  labelKey: "behavior.title",
  icon: <icon.Settings2 />,
  keys: BEHAVIOUR_KEYS,
  Content: function BehaviorSection({ api, inline }) {
    const t = useTranslation("Reader.readerSettings.behavior")

    return (
      <SectionGroup api={api} label={t("title")} keys={BEHAVIOUR_KEYS}>
        <ToggleItem
          api={api}
          prefKey="skipOnTurnPage"
          label={t("skipAudioWhenTurningPages")}
          icon={<icon.PlayerSkipForward10 />}
        />
        <ToggleItem
          api={api}
          prefKey="openPipOnTabOut"
          label={t("openFloating")}
          icon={<icon.Maximize />}
          title={t.plain("openFloatingHint")}
        />
        {api.values.layout === "scrollable" && (
          <>
            <NestedSelect
              label={t("scrolling")}
              icon={<icon.ArrowDown />}
              value={t.plain(
                api.values.scrollBehavior === "smooth"
                  ? "scrollingSmooth"
                  : "scrollingInstant",
              )}
              changed={api.overridden("scrollBehavior")}
              inline={inline}
            >
              <ChoiceItems
                api={api}
                prefKey="scrollBehavior"
                options={[
                  { value: "smooth", label: t.plain("scrollingSmooth") },
                  { value: "instant", label: t.plain("scrollingInstant") },
                ]}
              />
            </NestedSelect>
            {api.values.scrollBehavior === "smooth" && (
              <NestedSelect
                label={t("scrollEngine")}
                icon={<icon.Settings2 />}
                value={t.plain(
                  api.values.smoothScrollImplementation === "custom"
                    ? "scrollEngineCustom"
                    : "scrollEngineNative",
                )}
                changed={api.overridden("smoothScrollImplementation")}
                inline={inline}
              >
                <ChoiceItems
                  api={api}
                  prefKey="smoothScrollImplementation"
                  options={[
                    {
                      value: "custom",
                      label: t.plain("scrollEngineCustom"),
                      title: t.plain("scrollEngineCustomHint"),
                    },
                    {
                      value: "native",
                      label: t.plain("scrollEngineNative"),
                      title: t.plain("scrollEngineNativeHint"),
                    },
                  ]}
                />
              </NestedSelect>
            )}
            {api.values.scrollBehavior === "smooth" &&
              api.values.smoothScrollImplementation === "custom" && (
                <SliderRow
                  api={api}
                  prefKey="smoothScrollSpeed"
                  label={t("scrollSpeed")}
                  min={0.1}
                  max={2}
                  step={0.1}
                  format={(value) => `${value.toFixed(1)}x`}
                />
              )}
          </>
        )}
      </SectionGroup>
    )
  },
} satisfies SettingsSection

export const SECTIONS = [
  themeSection,
  textSection,
  layoutSection,
  highlightsSection,
  behaviourSection,
] as const satisfies SettingsSection[]
