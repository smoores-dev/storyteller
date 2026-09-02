"use client"

import { TextAlignment } from "@readium/navigator"
import { type ReactNode, useState } from "react"

import { Button } from "@v3/_/components/ui/button"
import {
  FilterableMenuGroup,
  FilterableMenuLabel,
} from "@v3/_/components/ui/filterable-menu"
import { Input } from "@v3/_/components/ui/input"
import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import {
  READER_THEMES,
  type ReadingPreferences,
} from "@/store/slices/preferencesSlice"

import { fontFamilies, highlightColors, spacingModes } from "./prefItems"
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

export type SettingsSection = {
  key: string
  label: string
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
  label,
}: {
  api: PreferenceApi
  scheme: "light" | "dark"
  label: string
}) {
  return (
    <FilterableMenuGroup>
      <FilterableMenuLabel className={readerMenuLabelClassName}>
        {label}
      </FilterableMenuLabel>
      <ChoiceItems
        api={api}
        prefKey="theme"
        options={READER_THEMES.filter((theme) => theme.scheme === scheme).map(
          (theme) => ({
            value: theme.id,
            label: theme.label,
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

export const themeSection: SettingsSection = {
  key: "theme",
  label: "Theme",
  icon: <icon.Palette />,
  keys: THEME_KEYS,
  Content: ({ api }) => (
    <SectionGroup api={api} label="Theme" keys={THEME_KEYS}>
      <ThemeItems api={api} scheme="light" label="Light" />
      <ThemeItems api={api} scheme="dark" label="Dark" />
    </SectionGroup>
  ),
}

const TEXT_KEYS = [
  "fontFamily",
  "customFontFamily",
  "fontSize",
  "fontWeight",
  "spacing",
  "align",
  "hyphens",
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

function CustomFontFields({ api }: { api: PreferenceApi }) {
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
        placeholder="Font name"
        className={readerInputClassName}
        defaultValue={api.values.customFontFamily.name}
      />
      <Input
        name="url"
        required
        type="url"
        placeholder="Stylesheet URL"
        className={readerInputClassName}
        defaultValue={api.values.customFontFamily.url}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-reader-text-muted text-[10px]">
          A stylesheet that defines the font, such as a Google Fonts link
        </span>
        <Button
          type="submit"
          size="xs"
          variant="outline"
          className={readerButtonClassName}
        >
          Save
        </Button>
      </div>
    </form>
  )
}

export const textSection: SettingsSection = {
  key: "text",
  label: "Text",
  icon: <icon.Aa />,
  keys: TEXT_KEYS,
  Content: ({ api, inline }) => (
    <SectionGroup api={api} label="Text" keys={TEXT_KEYS}>
      <NestedSelect
        label="Font"
        icon={<icon.Aa />}
        value={
          fontFamilies.find((family) => family.value === api.values.fontFamily)
            ?.label ?? ""
        }
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
            label:
              family.value === "custom" && api.values.customFontFamily.name
                ? `Custom (${api.values.customFontFamily.name})`
                : family.label,
            className: fontClassName[family.value],
          }))}
        />
        {api.values.fontFamily === "custom" && <CustomFontFields api={api} />}
      </NestedSelect>
      <SliderRow
        api={api}
        prefKey="fontSize"
        label="Size"
        min={50}
        max={200}
        step={10}
        format={(value) => `${value}%`}
      />
      <SliderRow
        api={api}
        prefKey="fontWeight"
        label="Weight"
        min={200}
        max={900}
        step={100}
      />
      <NestedSelect
        label="Letter spacing"
        icon={<icon.TextWrap />}
        value={
          spacingModes.find((mode) => mode.value === api.values.spacing)
            ?.label ?? ""
        }
        changed={api.overridden("spacing")}
        inline={inline}
      >
        <ChoiceItems
          api={api}
          prefKey="spacing"
          options={spacingModes.map((mode) => ({
            value: mode.value,
            label: mode.label,
          }))}
        />
      </NestedSelect>
      <NestedSelect
        label="Alignment"
        icon={<icon.AlignLeft />}
        value={api.values.align === TextAlignment.left ? "Left" : "Justified"}
        changed={api.overridden("align")}
        inline={inline}
      >
        <ChoiceItems
          api={api}
          prefKey="align"
          options={[
            { value: TextAlignment.justify, label: "Justified" },
            { value: TextAlignment.left, label: "Left" },
          ]}
        />
      </NestedSelect>
      <ToggleItem api={api} prefKey="hyphens" label="Hyphenate words" />
    </SectionGroup>
  ),
}

const LAYOUT_KEYS = [
  "layout",
  "columns",
  "lineLength",
  "footerDisplayWidth",
] as const

const footerWidthLabels: Record<
  ReadingPreferences["footerDisplayWidth"],
  string
> = {
  full: "Full width",
  minimal: "Minimal",
  text: "Fit to text",
}

export const layoutSection: SettingsSection = {
  key: "layout",
  label: "Layout",
  icon: <icon.LayoutGrid />,
  keys: LAYOUT_KEYS,
  Content: ({ api, inline }) => (
    <SectionGroup api={api} label="Layout" keys={LAYOUT_KEYS}>
      <ChoiceItems
        api={api}
        prefKey="layout"
        options={[
          { value: "paginated", label: "Paginated", icon: <icon.Columns /> },
          { value: "scrollable", label: "Scrolling", icon: <icon.ArrowDown /> },
        ]}
      />
      <NestedSelect
        label="Columns"
        icon={<icon.Columns3 />}
        value={api.values.columns ? String(api.values.columns) : "Auto"}
        changed={api.overridden("columns")}
        inline={inline}
      >
        <ChoiceItems
          api={api}
          prefKey="columns"
          options={[
            { value: 0, label: "Auto" },
            { value: 1, label: "One" },
            { value: 2, label: "Two" },
          ]}
        />
      </NestedSelect>
      <SliderRow
        api={api}
        prefKey="lineLength"
        label="Line length"
        min={20}
        max={100}
        step={1}
        format={(value) => `${value} characters`}
      />
      <NestedSelect
        label="Footer width"
        icon={<icon.ArrowAutofitWidth />}
        value={footerWidthLabels[api.values.footerDisplayWidth]}
        changed={api.overridden("footerDisplayWidth")}
        inline={inline}
      >
        <ChoiceItems
          api={api}
          prefKey="footerDisplayWidth"
          options={[
            { value: "full", label: footerWidthLabels.full },
            { value: "minimal", label: footerWidthLabels.minimal },
            { value: "text", label: footerWidthLabels.text },
          ]}
        />
      </NestedSelect>
    </SectionGroup>
  ),
}

const SPACING_KEYS = ["lineHeight", "paragraphSpacing"] as const

export const spacingSection: SettingsSection = {
  key: "spacing",
  label: "Spacing",
  icon: <icon.TextWrap />,
  keys: SPACING_KEYS,
  Content: ({ api }) => (
    <SectionGroup api={api} label="Spacing" keys={SPACING_KEYS}>
      <SliderRow
        api={api}
        prefKey="lineHeight"
        label="Line height"
        min={1}
        max={3}
        step={0.1}
        format={(value) => value.toFixed(1)}
      />
      <SliderRow
        api={api}
        prefKey="paragraphSpacing"
        label="Paragraph spacing"
        min={0}
        max={2}
        step={0.1}
        format={(value) => value.toFixed(1)}
      />
    </SectionGroup>
  ),
}

const HIGHLIGHT_KEYS = [
  "highlightColor",
  "customHighlightColor",
  "syncOffset",
] as const

function CustomHighlightColorFields({ api }: { api: PreferenceApi }) {
  const [draft, setDraft] = useState(api.values.customHighlightColor)
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
        placeholder="Any CSS color"
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
        Use
      </Button>
    </form>
  )
}

export const highlightsSection: SettingsSection = {
  key: "highlights",
  label: "Highlights",
  icon: <icon.Highlight />,
  keys: HIGHLIGHT_KEYS,
  Content: ({ api }) => (
    <SectionGroup api={api} label="Highlights" keys={HIGHLIGHT_KEYS}>
      <ChoiceItems
        api={api}
        prefKey="highlightColor"
        options={highlightColors.map((color) => ({
          value: color.value,
          label: color.label,
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
      <SliderRow
        api={api}
        prefKey="syncOffset"
        label="Sync offset"
        min={-1}
        max={1}
        step={0.1}
        format={(value) => `${value > 0 ? "+" : ""}${value.toFixed(1)} s`}
      />
    </SectionGroup>
  ),
}

const BEHAVIOUR_KEYS = [
  "skipOnTurnPage",
  "openPipOnTabOut",
  "scrollBehavior",
  "smoothScrollImplementation",
  "smoothScrollSpeed",
] as const

export const behaviourSection: SettingsSection = {
  key: "behaviour",
  label: "Behaviour",
  icon: <icon.Settings2 />,
  keys: BEHAVIOUR_KEYS,
  Content: ({ api, inline }) => (
    <SectionGroup api={api} label="Behaviour" keys={BEHAVIOUR_KEYS}>
      <ToggleItem
        api={api}
        prefKey="skipOnTurnPage"
        label="Skip audio when turning the page"
        icon={<icon.PlayerSkipForward10 />}
      />
      <ToggleItem
        api={api}
        prefKey="openPipOnTabOut"
        label="Open a floating player when you switch tabs"
        icon={<icon.Maximize />}
        title="Chromium based browsers only. The floating window lets you control playback and turn pages while Storyteller is in the background."
      />
      {api.values.layout === "scrollable" && (
        <>
          <NestedSelect
            label="Scrolling"
            icon={<icon.ArrowDown />}
            value={
              api.values.scrollBehavior === "smooth" ? "Smooth" : "Instant"
            }
            changed={api.overridden("scrollBehavior")}
            inline={inline}
          >
            <ChoiceItems
              api={api}
              prefKey="scrollBehavior"
              options={[
                { value: "smooth", label: "Smooth" },
                { value: "instant", label: "Instant" },
              ]}
            />
          </NestedSelect>
          {api.values.scrollBehavior === "smooth" && (
            <NestedSelect
              label="Scroll engine"
              icon={<icon.Settings2 />}
              value={
                api.values.smoothScrollImplementation === "custom"
                  ? "Custom"
                  : "Native"
              }
              changed={api.overridden("smoothScrollImplementation")}
              inline={inline}
            >
              <ChoiceItems
                api={api}
                prefKey="smoothScrollImplementation"
                options={[
                  {
                    value: "custom",
                    label: "Custom",
                    title: "Usually smoother and lets you set the speed",
                  },
                  {
                    value: "native",
                    label: "Native",
                    title: "Try this if scrolling misbehaves",
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
                label="Scroll speed"
                min={0.1}
                max={2}
                step={0.1}
                format={(value) => `${value.toFixed(1)}x`}
              />
            )}
        </>
      )}
    </SectionGroup>
  ),
}

export const SECTIONS: SettingsSection[] = [
  themeSection,
  textSection,
  layoutSection,
  spacingSection,
  highlightsSection,
  behaviourSection,
]
