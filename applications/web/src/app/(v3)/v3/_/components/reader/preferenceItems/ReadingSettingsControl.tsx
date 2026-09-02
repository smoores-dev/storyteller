// import {
//   Button,
//   Collapse,
//   ColorPicker,
//   Input,
//   Menu,
//   Popover,
//   Select,
//   Slider,
//   Stack,
//   Switch,
//   Text,
//   Tooltip,
// } from "@mantine/core"
import { useDisclosure, useLocalStorage } from "@mantine/hooks"
import { TextAlignment } from "@readium/navigator"
import {
  IconAdjustments,
  IconAlignJustified,
  IconAlignLeft,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconArrowsTransferUpDown,
  IconBolt,
  IconBoxMultiple,
  IconCheck,
  IconChevronDown,
  IconCircleCheck,
  IconDotsVertical,
  IconHighlight,
  IconInfoCircle,
  IconLayoutGrid,
  IconLetterCase,
  IconManualGearbox,
  IconPalette,
  IconRefresh,
  IconSpacingHorizontal,
  IconTextSize,
  IconTypeface,
  IconWaveSine,
} from "@tabler/icons-react"
// import classNames from "classnames"
import { Fragment, useCallback, useState } from "react"

import { Button } from "@/app/(v3)/v3/_/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
} from "@/app/(v3)/v3/_/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/(v3)/v3/_/components/ui/dropdown-menu"
import { Input } from "@/app/(v3)/v3/_/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/(v3)/v3/_/components/ui/select"
import { Switch } from "@/app/(v3)/v3/_/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/(v3)/v3/_/components/ui/tooltip"
import { cn } from "@/cn"
import { useMenuToggle } from "@/components/reader/hooks/useMenuToggle"
import * as icon from "@/icons"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  type FontFamily,
  type PreferencePayload,
  type ReadingPreferences,
  preferencesSlice,
  selectBookPreferences,
  selectGlobalPreferences,
} from "@/store/slices/preferencesSlice"
import { type UUID } from "@/uuid"

import { ReaderSlider } from "./ReaderSlider"
import { type ToolProps, ToolbarIcon } from "./ToolbarIcon"
import {
  fontFamilies,
  highlightColors,
  readingThemes,
  spacingModes,
} from "./prefItems"

type Props = ToolProps & {
  scope: "global" | UUID
}

type SectionKey =
  | "highlights"
  | "themes"
  | "fonts"
  | "layout"
  | "spacing"
  | "ui"
  | "behavior"

const CollapsibleSection = ({
  title,
  defaultOpen,
  storeSectionState,
  children,
  icon,
}: {
  title: string
  defaultOpen: boolean
  storeSectionState: (value: boolean) => void
  icon: React.ReactNode
  children: React.ReactNode
}) => {
  const [isOpen, { toggle }] = useDisclosure(defaultOpen)
  return (
    <div className={cn("flex flex-col", isOpen && "pb-4")}>
      <button
        onClick={() => {
          toggle()
          storeSectionState(!isOpen)
        }}
        className="hover:bg-reader-accent/10 -mx-2 mb-1 flex w-full items-center justify-between gap-2.5 rounded-md px-2 py-2.5 transition-all"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-reader-text font-medium tracking-tight">
            {title}
          </span>
        </div>
        <span
          className={cn(
            "text-reader-text transition-transform duration-200",
            isOpen && "rotate-0",
            !isOpen && "-rotate-90",
          )}
        >
          <IconChevronDown size={18} strokeWidth={2.5} />
        </span>
      </button>
      <Collapsible open={isOpen}>
        <CollapsibleContent>
          <div className="mt-3 flex flex-col gap-5 px-0.5">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

const ReadingSettingsContent = ({ scope }: { scope: "global" | UUID }) => {
  const preferences = useAppSelector((state) =>
    scope === "global"
      ? selectGlobalPreferences(state)
      : selectBookPreferences(state, scope),
  )
  const globalPreferences = useAppSelector((state) =>
    selectGlobalPreferences(state),
  )

  const dispatch = useAppDispatch()

  // default: highlights and themes open, rest closed
  const [sections, setSections] = useLocalStorage<Record<SectionKey, boolean>>({
    key: "reading-settings-sections",
    getInitialValueInEffect: false,
    defaultValue: {
      highlights: true,
      themes: true,
      fonts: false,
      layout: false,
      spacing: false,
      ui: false,
      behavior: false,
    },
  })

  const setSection = (key: SectionKey, value: boolean) => {
    setSections((prev) => ({ ...prev, [key]: value }))
  }

  const updatePref = useCallback(
    <K extends keyof ReadingPreferences>(
      key: K,
      value: Extract<PreferencePayload, { key: K }>["value"],
      target: Extract<PreferencePayload, { key: K }>["target"],
    ) => {
      dispatch(
        preferencesSlice.actions.updatePreference({
          key,
          value,
          target,
        } as PreferencePayload),
      )
    },
    [dispatch],
  )

  return (
    <div className="flex flex-col gap-2">
      {/* highlights section */}
      <CollapsibleSection
        title="Highlights"
        defaultOpen={sections.highlights}
        storeSectionState={(value) => {
          setSection("highlights", value)
        }}
        icon={<IconHighlight size={18} className="text-reader-text" />}
      >
        <HighlightColorPicker
          highlightColor={preferences.highlightColor}
          customHighlightColor={preferences.customHighlightColor}
          scope={scope}
        />

        <div className="flex flex-col gap-y-2">
          <ResetOrSetGlobalButton
            preference={{
              key: "syncOffset",
              value: preferences.syncOffset,
              globalValue: globalPreferences.syncOffset,
            }}
            scope={scope}
          >
            <span className="text-reader-text-secondary text-sm font-medium">
              Highlight sync offset
            </span>
          </ResetOrSetGlobalButton>
          <ReaderSlider
            defaultValue={preferences.syncOffset}
            min={-1}
            max={1}
            step={0.1}
            marks={[
              { value: -1, label: "-1" },
              { value: 0, label: "0" },
              { value: 1, label: "1" },
            ]}
            onValueCommitted={(value) => {
              updatePref("syncOffset", value, scope)
            }}
          />
        </div>
      </CollapsibleSection>

      {/* themes section */}
      <CollapsibleSection
        title="Themes"
        defaultOpen={sections.themes}
        storeSectionState={(value) => {
          setSection("themes", value)
        }}
        icon={<IconPalette size={18} className="text-reader-text" />}
      >
        <div className="flex flex-col gap-2">
          <ResetOrSetGlobalButton
            preference={{
              key: "theme",
              value: preferences.theme,
              globalValue: globalPreferences.theme,
            }}
            scope={scope}
          >
            <span className="text-reader-text-secondary text-sm font-medium">
              Theme
            </span>
          </ResetOrSetGlobalButton>

          <ClickyPreferenceSelect
            preference={{ key: "theme", value: preferences.theme }}
            scope={scope}
            options={readingThemes.map((theme) => ({
              value: theme.value,
              label: theme.label,
              icon: "",
              className: `${theme.bg} h-20 ${theme.text}`,
            }))}
          />
        </div>
      </CollapsibleSection>

      {/* fonts section */}
      <CollapsibleSection
        title="Fonts"
        defaultOpen={sections.fonts}
        storeSectionState={(value) => {
          setSection("fonts", value)
        }}
        icon={<IconTypeface size={18} className="text-reader-text" />}
      >
        <div className="flex flex-col gap-y-2">
          <ResetOrSetGlobalButton
            preference={{
              key: "fontFamily",
              value: preferences.fontFamily,
              globalValue: globalPreferences.fontFamily,
            }}
            scope={scope}
          >
            <span className="text-reader-text-secondary w-full text-sm font-medium">
              Font family
            </span>
          </ResetOrSetGlobalButton>
          <Select
            // comboboxProps={{ withinPortal: false }}
            defaultValue={preferences.fontFamily}
            onValueChange={(value) => {
              updatePref("fontFamily", value as FontFamily, scope)
            }}
            items={fontFamilies}
          >
            <SelectTrigger className="border-reader-border bg-reader-bg text-reader-text w-full">
              <SelectValue
                placeholder="Select font family"
                className={cn({
                  "font-literata": preferences.fontFamily === "Literata",
                  "font-open-dyslexic":
                    preferences.fontFamily === "OpenDyslexic",
                  "font-serif": preferences.fontFamily === "serif",
                  "font-sans-serif": preferences.fontFamily === "sans-serif",
                  "font-monospace": preferences.fontFamily === "monospace",
                })}
              />
            </SelectTrigger>
            <SelectContent className="bg-reader-surface-hover p-2">
              {fontFamilies.map((family) => (
                <SelectItem
                  key={family.value}
                  value={family.value}
                  className={cn(
                    "flex items-center gap-2",
                    family.value === preferences.fontFamily
                      ? "text-reader-accent"
                      : "text-reader-text",
                    {
                      "font-literata": family.value === "Literata",
                      "font-open-dyslexic": family.value === "OpenDyslexic",
                      "font-serif": family.value === "serif",
                      "font-sans-serif": family.value === "sans-serif",
                      "font-monospace": family.value === "monospace",
                    },
                  )}
                >
                  {family.value === preferences.fontFamily ? (
                    <IconCheck size={16} />
                  ) : (
                    " "
                  )}
                  {family.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {preferences.fontFamily === "custom" && (
          <form
            className="flex flex-col gap-2"
            action={(formData) => {
              updatePref(
                "customFontFamily",
                {
                  ...preferences.customFontFamily,
                  name: formData.get("name") as string,
                  url: formData.get("url") as string,
                },
                scope,
              )
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ResetOrSetGlobalButton
                  preference={{
                    key: "customFontFamily",
                    value: preferences.customFontFamily,
                    globalValue: globalPreferences.customFontFamily,
                  }}
                  scope={scope}
                >
                  <span className="text-reader-text-secondary text-sm font-medium">
                    Custom font{" "}
                  </span>
                </ResetOrSetGlobalButton>
                <InfoTooltip>
                  You can use a custom font by adding the font URL here + name
                  here, usually from a Google font. See{" "}
                  <a
                    href="https://storyteller-platform.gitlab.io/storyteller/docs/reading-your-books/web-reader"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-reader-accent"
                  >
                    the docs
                  </a>{" "}
                  for more information.
                </InfoTooltip>
              </div>

              <Button
                type="submit"
                size="xs"
                className="bg-reader-accent text-reader-accent-text hover:bg-reader-accent-hover"
              >
                Save
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              <Input
                className="border-reader-border bg-reader-bg text-reader-text"
                placeholder="Font name"
                name="name"
                required
                defaultValue={preferences.customFontFamily.name}
              />
              <Input
                className="border-reader-border bg-reader-bg text-reader-text"
                placeholder="Font URL"
                name="url"
                required
                defaultValue={preferences.customFontFamily.url}
              />
            </div>
          </form>
        )}

        <div className="flex flex-col gap-y-2">
          <ResetOrSetGlobalButton
            preference={{
              key: "fontSize",
              value: preferences.fontSize,
              globalValue: globalPreferences.fontSize,
            }}
            scope={scope}
          >
            <span className="text-reader-text-secondary text-sm font-medium">
              Font size
            </span>
          </ResetOrSetGlobalButton>
          <ReaderSlider
            defaultValue={preferences.fontSize}
            onValueCommitted={(value) => {
              updatePref("fontSize", value, scope)
            }}
            min={50}
            max={200}
            step={10}
            marks={[
              { value: 50, label: "50%" },
              { value: 100, label: "100%" },
              { value: 200, label: "200%" },
            ]}
          />
        </div>

        <div className="flex flex-col gap-y-2">
          <ResetOrSetGlobalButton
            preference={{
              key: "fontWeight",
              value: preferences.fontWeight,
              globalValue: globalPreferences.fontWeight,
            }}
            scope={scope}
          >
            <span className="text-reader-text-secondary text-sm font-medium">
              Font weight
            </span>
          </ResetOrSetGlobalButton>
          <ReaderSlider
            defaultValue={preferences.fontWeight}
            onValueCommitted={(value) => {
              updatePref("fontWeight", value, scope)
            }}
            min={200}
            max={900}
            step={100}
            restrictToMarks
            marks={[
              { value: 200, label: "200" },
              { value: 300, label: "300" },
              { value: 400, label: "400" },
              { value: 500, label: "500" },
              { value: 600, label: "600" },
              { value: 700, label: "700" },
              { value: 800, label: "800" },
              { value: 900, label: "900" },
            ]}
          />
        </div>
      </CollapsibleSection>

      {/* --------------------------------
          UI section
      -------------------------------- */}
      <CollapsibleSection
        title="UI"
        icon={<IconAdjustments size={18} className="text-reader-text" />}
        defaultOpen={sections.layout}
        storeSectionState={(value) => {
          setSection("layout", value)
        }}
      >
        <div className="flex flex-col gap-y-2">
          <ResetOrSetGlobalButton
            preference={{
              key: "footerDisplayWidth",
              value: preferences.footerDisplayWidth,
              globalValue: globalPreferences.footerDisplayWidth,
            }}
            scope={scope}
          >
            <span className="text-reader-text-secondary text-sm font-medium">
              Footer display width
            </span>
          </ResetOrSetGlobalButton>
          <ClickyPreferenceSelect
            preference={{
              key: "footerDisplayWidth",
              value: preferences.footerDisplayWidth,
            }}
            scope={scope}
            options={[
              { value: "full", label: "Full", icon: <IconArrowsMaximize /> },
              {
                value: "minimal",
                label: "Minimal",
                icon: <IconArrowsMinimize />,
              },
              { value: "text", label: "Fit Text", icon: <IconTextSize /> },
            ]}
          />
        </div>
      </CollapsibleSection>
      {/* --------------------------------
          Behavior
      -------------------------------- */}
      <CollapsibleSection
        title="Behavior"
        icon={<IconManualGearbox size={18} className="text-reader-text" />}
        defaultOpen={sections.behavior}
        storeSectionState={(value) => {
          setSection("behavior", value)
        }}
      >
        <div className="flex flex-col gap-y-2">
          <ResetOrSetGlobalButton
            preference={{
              key: "skipOnTurnPage",
              value: preferences.skipOnTurnPage,
              globalValue: globalPreferences.skipOnTurnPage,
            }}
            scope={scope}
          >
            <span className="text-reader-text-secondary text-sm font-medium">
              Skip audio when turning page
            </span>
          </ResetOrSetGlobalButton>
          <Switch
            checked={preferences.skipOnTurnPage}
            onChange={(value) => {
              updatePref("skipOnTurnPage", value.currentTarget.checked, scope)
            }}
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <ResetOrSetGlobalButton
            preference={{
              key: "openPipOnTabOut",
              value: preferences.openPipOnTabOut,
              globalValue: globalPreferences.openPipOnTabOut,
            }}
            scope={scope}
          >
            <span className="text-reader-text-secondary text-sm font-medium">
              Open Picture-In-Picture window on tab out
            </span>
            <InfoTooltip>
              On Chromium-based browsers only, when you tab out of Storyteller
              while reading a book, a Picture-In-Picture window will open in
              which you can control the audio playback and navigate the book.
              Switch this off if you don&apos;t want this behavior.
            </InfoTooltip>
          </ResetOrSetGlobalButton>
          <Switch
            checked={preferences.openPipOnTabOut}
            onChange={(value) => {
              updatePref("openPipOnTabOut", value.currentTarget.checked, scope)
            }}
          />
        </div>
      </CollapsibleSection>
      {/* --------------------------------
          Layout 
      -------------------------------- */}
      <CollapsibleSection
        title="Layout"
        icon={<IconLayoutGrid size={18} className="text-reader-text" />}
        defaultOpen={sections.layout}
        storeSectionState={(value) => {
          setSection("layout", value)
        }}
      >
        <div className="flex flex-col gap-y-2">
          <ResetOrSetGlobalButton
            preference={{
              key: "layout",
              value: preferences.layout,
              globalValue: globalPreferences.layout,
            }}
            scope={scope}
          >
            <span className="text-reader-text-secondary text-sm font-medium">
              Layout mode
            </span>
          </ResetOrSetGlobalButton>
          <ClickyPreferenceSelect
            preference={{ key: "layout", value: preferences.layout }}
            scope={scope}
            options={[
              {
                value: "paginated",
                label: "Paginated",
                icon: <IconBoxMultiple />,
              },
              {
                value: "scrollable",
                label: "Scrollable",
                icon: <IconArrowsTransferUpDown />,
              },
            ]}
          />
        </div>
        {preferences.layout === "scrollable" && (
          <div className="flex flex-col gap-y-2">
            <ResetOrSetGlobalButton
              preference={{
                key: "scrollBehavior",
                value: preferences.scrollBehavior,
                globalValue: globalPreferences.scrollBehavior,
              }}
              scope={scope}
            >
              <span className="text-reader-text-secondary text-sm font-medium">
                Scroll behavior
              </span>
            </ResetOrSetGlobalButton>
            <ClickyPreferenceSelect
              preference={{
                key: "scrollBehavior",
                value: preferences.scrollBehavior,
              }}
              scope={scope}
              options={[
                { value: "smooth", label: "Smooth", icon: <IconWaveSine /> },
                { value: "instant", label: "Instant", icon: <IconBolt /> },
              ]}
            />
            {preferences.scrollBehavior === "smooth" && (
              <div className="flex flex-col gap-y-2">
                <ResetOrSetGlobalButton
                  preference={{
                    key: "smoothScrollImplementation",
                    value: preferences.smoothScrollImplementation,
                    globalValue: globalPreferences.smoothScrollImplementation,
                  }}
                  scope={scope}
                >
                  <span className="flex items-center gap-1">
                    Smooth scroll implementation
                    <InfoTooltip>
                      Custom is usually smoother, and controllable. Try native
                      if you experience any issues.
                    </InfoTooltip>
                  </span>
                </ResetOrSetGlobalButton>
                <Select
                  defaultValue={preferences.smoothScrollImplementation}
                  onChange={(value) => {
                    updatePref(
                      "smoothScrollImplementation",
                      value as "native" | "custom",
                      scope,
                    )
                  }}
                  items={[
                    { value: "custom", label: "Custom" },
                    { value: "native", label: "Native" },
                  ]}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select smooth scroll implementation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom</SelectItem>
                    <SelectItem value="native">Native</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {preferences.scrollBehavior === "smooth" &&
              preferences.smoothScrollImplementation === "custom" && (
                <div className="flex flex-col gap-y-2">
                  <ResetOrSetGlobalButton
                    preference={{
                      key: "smoothScrollSpeed",
                      value: preferences.smoothScrollSpeed,
                      globalValue: globalPreferences.smoothScrollSpeed,
                    }}
                    scope={scope}
                  >
                    <span className="text-reader-text-secondary text-sm font-medium">
                      Smooth scroll speed
                    </span>
                  </ResetOrSetGlobalButton>
                  <ReaderSlider
                    defaultValue={preferences.smoothScrollSpeed}
                    onValueCommitted={(value) => {
                      updatePref("smoothScrollSpeed", value, scope)
                    }}
                    min={0.1}
                    max={2}
                    step={0.1}
                    marks={[
                      { value: 0.2, label: "0.2x" },
                      { value: 0.5, label: "0.5x" },
                      { value: 1, label: "1.0x" },
                      { value: 2, label: "2.0x" },
                    ]}
                  />
                </div>
              )}
          </div>
        )}

        <div className="flex flex-col gap-y-2">
          <ResetOrSetGlobalButton
            preference={{
              key: "columns",
              value: preferences.columns,
              globalValue: globalPreferences.columns,
            }}
            scope={scope}
          >
            <span className="text-reader-text-secondary text-sm font-medium">
              Columns
            </span>
          </ResetOrSetGlobalButton>
          <ClickyPreferenceSelect
            preference={{ key: "columns", value: preferences.columns }}
            scope={scope}
            options={[
              { value: 0, label: "Auto", icon: " " },
              { value: 1, label: "1 col", icon: "|" },
              { value: 2, label: "2 cols", icon: "| |" },
            ]}
          />
        </div>

        <div className="flex flex-col gap-y-2">
          <ResetOrSetGlobalButton
            preference={{
              key: "align",
              value: preferences.align,
              globalValue: globalPreferences.align,
            }}
            scope={scope}
          >
            <span className="text-reader-text-secondary text-sm font-medium">
              Text alignment
            </span>
          </ResetOrSetGlobalButton>

          <ClickyPreferenceSelect
            preference={{ key: "align", value: preferences.align }}
            scope={scope}
            options={[
              {
                value: TextAlignment.justify,
                label: "Justify",
                icon: <IconAlignJustified />,
              },
              {
                value: TextAlignment.left,
                label: "Left",
                icon: <IconAlignLeft />,
              },
            ]}
          />
        </div>
      </CollapsibleSection>

      {/* spacing section */}
      <CollapsibleSection
        title="Spacing"
        defaultOpen={sections.spacing}
        storeSectionState={(value) => {
          setSection("spacing", value)
        }}
        icon={<IconSpacingHorizontal size={18} className="text-reader-text" />}
      >
        <div className="flex flex-col gap-y-2">
          <ResetOrSetGlobalButton
            preference={{
              key: "spacing",
              value: preferences.spacing,
              globalValue: globalPreferences.spacing,
            }}
            scope={scope}
          >
            <span className="text-reader-text-secondary text-sm font-medium">
              Letter spacing
            </span>
          </ResetOrSetGlobalButton>
          <ClickyPreferenceSelect
            preference={{ key: "spacing", value: preferences.spacing }}
            scope={scope}
            options={spacingModes}
          />
        </div>

        <div className="flex flex-col gap-y-2">
          <ResetOrSetGlobalButton
            preference={{
              key: "paragraphSpacing",
              value: preferences.paragraphSpacing,
              globalValue: globalPreferences.paragraphSpacing,
            }}
            scope={scope}
          >
            <span className="text-reader-text-secondary text-sm font-medium">
              Paragraph spacing
            </span>
          </ResetOrSetGlobalButton>
          <ReaderSlider
            defaultValue={preferences.paragraphSpacing}
            onValueCommitted={(val) => {
              updatePref("paragraphSpacing", val, scope)
            }}
            min={0}
            max={2}
            step={0.1}
            marks={[
              { value: 0, label: "0" },
              { value: 1, label: "1" },
              { value: 2, label: "2" },
            ]}
          />
        </div>

        <div className="flex flex-col gap-y-2">
          <ResetOrSetGlobalButton
            preference={{
              key: "lineLength",
              value: preferences.lineLength,
              globalValue: globalPreferences.lineLength,
            }}
            scope={scope}
          >
            <span className="text-reader-text-secondary text-sm font-medium">
              Line length
            </span>
          </ResetOrSetGlobalButton>
          <ReaderSlider
            defaultValue={preferences.lineLength}
            onValueCommitted={(val) => {
              updatePref("lineLength", val, scope)
            }}
            min={0}
            max={100}
            step={1}
            marks={[
              { value: 0, label: "0" },
              { value: 100, label: "100" },
            ]}
          />
        </div>

        <div className="flex flex-col gap-y-2">
          <ResetOrSetGlobalButton
            preference={{
              key: "lineHeight",
              value: preferences.lineHeight,
              globalValue: globalPreferences.lineHeight,
            }}
            scope={scope}
          >
            <span className="text-reader-text text-sm font-medium">
              Line height
            </span>
          </ResetOrSetGlobalButton>
          <ReaderSlider
            defaultValue={preferences.lineHeight}
            onValueCommitted={(val) => {
              updatePref("lineHeight", val, scope)
            }}
            min={1}
            max={3}
            step={0.1}
            marks={[
              { value: 1, label: "1" },
              { value: 2, label: "2" },
              { value: 3, label: "3" },
            ]}
          />
        </div>
      </CollapsibleSection>
    </div>
  )
}

export const ReadingSettingsControl = (props: Props) => {
  const { isOpen, closeMenu, toggleMenu } = useMenuToggle()

  if (props.mode === "raw") {
    return <ReadingSettingsContent scope={props.scope} />
  }

  if (props.mode === "drawer") {
    return (
      <ToolbarIcon
        label="Reader Settings"
        icon={<icon.Aa size="lg" />}
        onClick={() => {
          props.openDrawer(
            { type: "reading-settings", scope: props.scope },
            "Reader Settings",
          )
        }}
      />
    )
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={toggleMenu}>
      <DropdownMenuTrigger
        render={
          <ToolbarIcon
            label="Reader Settings"
            icon={<icon.Aa size="lg" />}
            onClick={toggleMenu}
          />
        }
      />
      <DropdownMenuContent className="border-reader-border bg-reader-surface max-h-[80vh] flex-col gap-8 overflow-x-clip overflow-y-auto p-4">
        <ReadingSettingsContent scope={props.scope} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

ReadingSettingsControl.DrawerContent = ReadingSettingsContent

export const CustomHighlightColorPicker = ({
  highlightColor,
  scope,
}: {
  highlightColor: ReadingPreferences["customHighlightColor"]
  scope: "global" | UUID
}) => {
  const dispatch = useAppDispatch()
  const [color, setColor] = useState(highlightColor)
  return (
    <div className="flex flex-col gap-2">
      <ColorPicker
        alphaLabel="Opacity"
        value={color}
        format="rgba"
        onChange={(val) => {
          setColor(val.replace(/\s/g, ""))
        }}
      />
      <div className="flex items-center gap-2">
        <Input
          className="border-reader-border bg-reader-bg text-reader-text w-40 shrink font-mono text-xs"
          value={color}
          onChange={(e) => {
            setColor(e.target.value)
          }}
        />
        <Button
          className="bg-reader-accent text-reader-accent-text hover:bg-reader-accent-hover"
          onClick={() => {
            dispatch(
              preferencesSlice.actions.updatePreference({
                key: "customHighlightColor",
                value: color,
                target: scope,
              }),
            )
            dispatch(
              preferencesSlice.actions.updatePreference({
                key: "highlightColor",
                value: "custom",
                target: scope,
              }),
            )
          }}
        >
          Pick
        </Button>
      </div>
    </div>
  )
}

const HighlightColorPicker = ({
  highlightColor,
  customHighlightColor,
  scope,
}: {
  highlightColor: ReadingPreferences["highlightColor"]
  customHighlightColor: ReadingPreferences["customHighlightColor"]
  scope: "global" | UUID
}) => {
  const dispatch = useAppDispatch()
  /* highlight color */
  return (
    <div className="flex flex-col gap-y-2">
      <p className="text-reader-text-secondary font-medium">Highlight color</p>
      <div className="grid grid-cols-6 justify-items-center gap-1">
        {highlightColors.map((color) => (
          <Fragment key={color.value}>
            {color.value === "custom" ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    `h-8 w-8 rounded-full border text-center transition-all ${color.className}`,
                    {
                      "ring-reader-accent ring-2 ring-offset-1":
                        highlightColor === color.value,
                    },
                  )}
                  onClick={() => {
                    dispatch(
                      preferencesSlice.actions.updatePreference({
                        key: "highlightColor",
                        value: "custom" as ReadingPreferences["highlightColor"],
                        target: scope,
                      }),
                    )
                  }}
                >
                  <span className="text-reader-text sr-only">
                    {color.label}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="border-reader-border bg-reader-surface border-0 p-0">
                  <CustomHighlightColorPicker
                    highlightColor={customHighlightColor}
                    scope={scope}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                key={color.value}
                className={cn(
                  `h-8 w-8 rounded-full border text-center transition-all ${color.className}`,
                  {
                    "ring-reader-accent ring-2 ring-offset-1":
                      highlightColor === color.value,
                  },
                )}
                onClick={() => {
                  dispatch(
                    preferencesSlice.actions.updatePreference({
                      key: "highlightColor",
                      value:
                        color.value as ReadingPreferences["highlightColor"],
                      target: scope,
                    }),
                  )
                }}
              >
                <span className="text-reader-text sr-only">{color.label}</span>
              </button>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

export const ClickyPreferenceSelect = <
  K extends
    | "spacing"
    | "layout"
    | "columns"
    | "align"
    | "theme"
    | "scrollBehavior"
    | "footerDisplayWidth",
>({
  preference,
  options,
  scope,
}: {
  preference: K extends K
    ? {
        key: K
        value: ReadingPreferences[K]
      }
    : never

  options: {
    value: ReadingPreferences[K]
    label: string
    icon: React.ReactNode
    className?: string
  }[]
  scope: "global" | UUID
}) => {
  const dispatch = useAppDispatch()
  return (
    <div
      className={cn(`grid w-full gap-2`, {
        "grid-cols-4": options.length === 4,
        "grid-cols-3": options.length === 3 || options.length === 6,
        "grid-cols-2": options.length === 2,
        "grid-cols-1": options.length === 1,
      })}
    >
      {options.map((option, idx) => (
        <button
          key={idx.toString()}
          onClick={() => {
            dispatch(
              preferencesSlice.actions.updatePreference({
                target: scope,
                key: preference.key,
                value: option.value,
              } as PreferencePayload),
            )
          }}
          className={cn(
            `flex grow flex-col flex-nowrap items-center justify-center gap-1 rounded-lg border p-3 whitespace-nowrap transition-all ${
              preference.value === option.value
                ? "border-reader-accent bg-reader-accent/10 text-reader-accent"
                : "border-reader-border text-reader-text hover:ring-reader-accent/50 ring-offset-1 hover:ring-2"
            }`,
            option.className,
          )}
        >
          {option.icon}
          <span className="text-xs">{option.label}</span>
        </button>
      ))}
    </div>
  )
}

type ResetOrSetGlobalButtonProps<K extends keyof ReadingPreferences> = {
  preference: K extends K
    ? {
        key: K
        value: ReadingPreferences[K]
        globalValue: ReadingPreferences[K]
      }
    : never
  scope: "global" | UUID
  children: React.ReactNode
}

export const ResetOrSetGlobalButton = <K extends keyof ReadingPreferences>(
  props: ResetOrSetGlobalButtonProps<K>,
) => {
  const dispatch = useAppDispatch()

  if (props.scope === "global") {
    return null
  }

  const bookUuid = props.scope

  return (
    <div className="relative flex w-full items-center justify-between">
      <div className="flex items-center gap-2">{props.children}</div>
      {props.preference.globalValue !== props.preference.value && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="hover:bg-reader-surface-hover hover:text-reader-accent-hover text-reader-text absolute top-1/2 right-0 z-10 -translate-y-1/2 rounded-md px-1 py-1"
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <IconDotsVertical size={16} />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="border-reader-border bg-reader-surface">
            <DropdownMenuItem
              className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover border-reader-border bg-reader-surface text-xs"
              onClick={() => {
                dispatch(
                  preferencesSlice.actions.updatePreference({
                    target: "global",
                    ...props.preference,
                  }),
                )
              }}
              leftSection={<IconCircleCheck size={16} />}
            >
              Set as default
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-reader-text hover:bg-reader-surface-hover hover:text-reader-accent-hover text-xs"
              onClick={() => {
                dispatch(
                  preferencesSlice.actions.resetPreference({
                    key: props.preference.key,
                    target: bookUuid,
                  }),
                )
              }}
              leftSection={<IconRefresh size={16} />}
            >
              Reset to default
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

export const InfoTooltip = ({ children }: { children: React.ReactNode }) => {
  return (
    <Tooltip
    // withArrow
    // closeDelay={1000}
    // events={{
    //   touch: true,
    //   focus: true,
    //   hover: true,
    // }}
    // multiline
    // classNames={{
    //   tooltip: "w-60",
    // }}
    >
      <TooltipTrigger>
        <IconInfoCircle size={16} className="text-reader-text" />
      </TooltipTrigger>
      <TooltipContent className="w-60">{children}</TooltipContent>
    </Tooltip>
  )
}
