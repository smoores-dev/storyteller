import {
  Button,
  Collapse,
  ColorPicker,
  Input,
  Menu,
  Popover,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core"
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
import classNames from "classnames"
import { Fragment, useCallback, useState } from "react"

import { cn } from "@/cn"
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

import { useMenuToggle } from "../hooks/useMenuToggle"

import { type ToolProps, ToolbarIcon } from "./ToolbarIcon"
import {
  popoverClassNames,
  selectClassNames,
  sliderClassNames,
} from "./classNames"
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
      <Collapse in={isOpen} animateOpacity={false}>
        <div className="mt-3 flex flex-col gap-5 px-0.5">{children}</div>
      </Collapse>
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

        <Stack>
          <ResetOrSetGlobalButton
            preference={{
              key: "syncOffset",
              value: preferences.syncOffset,
              globalValue: globalPreferences.syncOffset,
            }}
            scope={scope}
          >
            <Text size="sm" className="text-reader-text-secondary font-medium">
              Highlight sync offset
            </Text>
          </ResetOrSetGlobalButton>
          <Slider
            defaultValue={preferences.syncOffset}
            classNames={sliderClassNames}
            min={-1}
            max={1}
            step={0.1}
            marks={[
              { value: -1, label: "-1" },
              { value: 0, label: "0" },
              { value: 1, label: "1" },
            ]}
            onChangeEnd={(value) => {
              updatePref("syncOffset", value, scope)
            }}
          />
        </Stack>
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
        <Stack>
          <ResetOrSetGlobalButton
            preference={{
              key: "theme",
              value: preferences.theme,
              globalValue: globalPreferences.theme,
            }}
            scope={scope}
          >
            <Text size="sm" className="text-reader-text-secondary font-medium">
              Theme
            </Text>
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
        </Stack>
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
        <Select
          label={
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
          }
          comboboxProps={{ withinPortal: false }}
          classNames={{
            ...selectClassNames,
            input: cn("text-reader-text bg-reader-bg border-reader-border", {
              "font-literata": preferences.fontFamily === "Literata",
              "font-open-dyslexic": preferences.fontFamily === "OpenDyslexic",
              "font-serif": preferences.fontFamily === "serif",
              "font-sans-serif": preferences.fontFamily === "sans-serif",
              "font-monospace": preferences.fontFamily === "monospace",
            }),
          }}
          defaultValue={preferences.fontFamily}
          onChange={(value) => {
            updatePref("fontFamily", value as FontFamily, scope)
          }}
          renderOption={(option) => {
            return (
              <div
                className={cn(
                  "flex items-center gap-2",
                  option.checked ? "text-reader-accent" : "text-reader-text",
                  {
                    "font-literata": option.option.value === "Literata",
                    "font-open-dyslexic":
                      option.option.value === "OpenDyslexic",
                    "font-serif": option.option.value === "serif",
                    "font-sans-serif": option.option.value === "sans-serif",
                    "font-monospace": option.option.value === "monospace",
                  },
                )}
              >
                {option.checked ? <IconCheck size={16} /> : " "}
                {option.option.label}
              </div>
            )
          }}
          data={fontFamilies}
        />

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
                  <Text
                    size="sm"
                    className="text-reader-text-secondary font-medium"
                  >
                    Custom font{" "}
                  </Text>
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
                classNames={{
                  input: "border-reader-border bg-reader-bg text-reader-text",
                }}
                placeholder="Font name"
                name="name"
                required
                defaultValue={preferences.customFontFamily.name}
              />
              <Input
                classNames={{
                  input: "border-reader-border bg-reader-bg text-reader-text",
                }}
                placeholder="Font URL"
                name="url"
                required
                defaultValue={preferences.customFontFamily.url}
              />
            </div>
          </form>
        )}

        <Stack>
          <ResetOrSetGlobalButton
            preference={{
              key: "fontSize",
              value: preferences.fontSize,
              globalValue: globalPreferences.fontSize,
            }}
            scope={scope}
          >
            <Text size="sm" className="text-reader-text-secondary font-medium">
              Font size
            </Text>
          </ResetOrSetGlobalButton>
          <Slider
            defaultValue={preferences.fontSize}
            onChangeEnd={(value) => {
              updatePref("fontSize", value, scope)
            }}
            classNames={sliderClassNames}
            min={50}
            max={200}
            step={10}
            marks={[
              { value: 50, label: "50%" },
              { value: 100, label: "100%" },
              { value: 200, label: "200%" },
            ]}
          />
        </Stack>

        <Stack>
          <ResetOrSetGlobalButton
            preference={{
              key: "fontWeight",
              value: preferences.fontWeight,
              globalValue: globalPreferences.fontWeight,
            }}
            scope={scope}
          >
            <Text size="sm" className="text-reader-text-secondary font-medium">
              Font weight
            </Text>
          </ResetOrSetGlobalButton>
          <Slider
            defaultValue={preferences.fontWeight}
            onChangeEnd={(value) => {
              updatePref("fontWeight", value, scope)
            }}
            classNames={sliderClassNames}
            min={200}
            max={900}
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
        </Stack>
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
        <Stack>
          <ResetOrSetGlobalButton
            preference={{
              key: "footerDisplayWidth",
              value: preferences.footerDisplayWidth,
              globalValue: globalPreferences.footerDisplayWidth,
            }}
            scope={scope}
          >
            <Text size="sm" className="text-reader-text-secondary font-medium">
              Footer display width
            </Text>
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
        </Stack>
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
        <Stack>
          <ResetOrSetGlobalButton
            preference={{
              key: "skipOnTurnPage",
              value: preferences.skipOnTurnPage,
              globalValue: globalPreferences.skipOnTurnPage,
            }}
            scope={scope}
          >
            <Text size="sm" className="text-reader-text-secondary font-medium">
              Skip audio when turning page
            </Text>
          </ResetOrSetGlobalButton>
          <Switch
            checked={preferences.skipOnTurnPage}
            onChange={(value) => {
              updatePref("skipOnTurnPage", value.currentTarget.checked, scope)
            }}
          />
        </Stack>
        <Stack>
          <ResetOrSetGlobalButton
            preference={{
              key: "openPipOnTabOut",
              value: preferences.openPipOnTabOut,
              globalValue: globalPreferences.openPipOnTabOut,
            }}
            scope={scope}
          >
            <Text size="sm" className="text-reader-text-secondary font-medium">
              Open Picture-In-Picture window on tab out
            </Text>
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
        </Stack>
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
        <Stack>
          <ResetOrSetGlobalButton
            preference={{
              key: "layout",
              value: preferences.layout,
              globalValue: globalPreferences.layout,
            }}
            scope={scope}
          >
            <Text size="sm" className="text-reader-text-secondary font-medium">
              Layout mode
            </Text>
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
        </Stack>
        {preferences.layout === "scrollable" && (
          <Stack>
            <ResetOrSetGlobalButton
              preference={{
                key: "scrollBehavior",
                value: preferences.scrollBehavior,
                globalValue: globalPreferences.scrollBehavior,
              }}
              scope={scope}
            >
              <Text
                size="sm"
                className="text-reader-text-secondary font-medium"
              >
                Scroll behavior
              </Text>
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
              <Select
                label={
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
                }
                comboboxProps={{ withinPortal: false }}
                classNames={selectClassNames}
                defaultValue={preferences.smoothScrollImplementation}
                onChange={(value) => {
                  updatePref(
                    "smoothScrollImplementation",
                    value as "native" | "custom",
                    scope,
                  )
                }}
                data={[
                  { value: "custom", label: "Custom" },
                  { value: "native", label: "Native" },
                ]}
              />
            )}
            {preferences.scrollBehavior === "smooth" &&
              preferences.smoothScrollImplementation === "custom" && (
                <Stack>
                  <ResetOrSetGlobalButton
                    preference={{
                      key: "smoothScrollSpeed",
                      value: preferences.smoothScrollSpeed,
                      globalValue: globalPreferences.smoothScrollSpeed,
                    }}
                    scope={scope}
                  >
                    <Text
                      size="sm"
                      className="text-reader-text-secondary font-medium"
                    >
                      Smooth scroll speed
                    </Text>
                  </ResetOrSetGlobalButton>
                  <Slider
                    defaultValue={preferences.smoothScrollSpeed}
                    onChangeEnd={(value) => {
                      updatePref("smoothScrollSpeed", value, scope)
                    }}
                    classNames={sliderClassNames}
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
                </Stack>
              )}
          </Stack>
        )}

        <Stack>
          <ResetOrSetGlobalButton
            preference={{
              key: "columns",
              value: preferences.columns,
              globalValue: globalPreferences.columns,
            }}
            scope={scope}
          >
            <Text size="sm" className="text-reader-text-secondary font-medium">
              Columns
            </Text>
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
        </Stack>

        <Stack>
          <ResetOrSetGlobalButton
            preference={{
              key: "align",
              value: preferences.align,
              globalValue: globalPreferences.align,
            }}
            scope={scope}
          >
            <Text size="sm" className="text-reader-text-secondary font-medium">
              Text alignment
            </Text>
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
        </Stack>
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
        <Stack>
          <ResetOrSetGlobalButton
            preference={{
              key: "spacing",
              value: preferences.spacing,
              globalValue: globalPreferences.spacing,
            }}
            scope={scope}
          >
            <Text size="sm" className="text-reader-text-secondary font-medium">
              Letter spacing
            </Text>
          </ResetOrSetGlobalButton>
          <ClickyPreferenceSelect
            preference={{ key: "spacing", value: preferences.spacing }}
            scope={scope}
            options={spacingModes}
          />
        </Stack>

        <Stack>
          <ResetOrSetGlobalButton
            preference={{
              key: "paragraphSpacing",
              value: preferences.paragraphSpacing,
              globalValue: globalPreferences.paragraphSpacing,
            }}
            scope={scope}
          >
            <Text size="sm" className="text-reader-text-secondary font-medium">
              Paragraph spacing
            </Text>
          </ResetOrSetGlobalButton>
          <Slider
            defaultValue={preferences.paragraphSpacing}
            onChangeEnd={(val) => {
              updatePref("paragraphSpacing", val, scope)
            }}
            classNames={sliderClassNames}
            min={0}
            max={2}
            step={0.1}
            marks={[
              { value: 0, label: "0" },
              { value: 1, label: "1" },
              { value: 2, label: "2" },
            ]}
          />
        </Stack>

        <Stack>
          <ResetOrSetGlobalButton
            preference={{
              key: "lineLength",
              value: preferences.lineLength,
              globalValue: globalPreferences.lineLength,
            }}
            scope={scope}
          >
            <Text size="sm" className="text-reader-text-secondary font-medium">
              Line length
            </Text>
          </ResetOrSetGlobalButton>
          <Slider
            defaultValue={preferences.lineLength}
            onChangeEnd={(val) => {
              updatePref("lineLength", val, scope)
            }}
            classNames={sliderClassNames}
            min={0}
            max={100}
            step={1}
            marks={[
              { value: 0, label: "0" },
              { value: 100, label: "100" },
            ]}
          />
        </Stack>

        <Stack>
          <ResetOrSetGlobalButton
            preference={{
              key: "lineHeight",
              value: preferences.lineHeight,
              globalValue: globalPreferences.lineHeight,
            }}
            scope={scope}
          >
            <Text size="sm" className="text-reader-text font-medium">
              Line height
            </Text>
          </ResetOrSetGlobalButton>
          <Slider
            defaultValue={preferences.lineHeight}
            onChangeEnd={(val) => {
              updatePref("lineHeight", val, scope)
            }}
            classNames={sliderClassNames}
            min={1}
            max={3}
            step={0.1}
            marks={[
              { value: 1, label: "1" },
              { value: 2, label: "2" },
              { value: 3, label: "3" },
            ]}
          />
        </Stack>
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
        icon={<IconLetterCase size={18} />}
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
    <Popover
      withArrow
      closeOnClickOutside
      trapFocus
      opened={isOpen}
      withinPortal={false}
      onDismiss={() => {
        closeMenu()
      }}
      classNames={popoverClassNames}
    >
      <Popover.Target>
        <ToolbarIcon
          label="Reader Settings"
          icon={<IconLetterCase size={18} />}
          onClick={toggleMenu}
        />
      </Popover.Target>
      <Popover.Dropdown className="border-reader-border bg-reader-surface max-h-[80vh] flex-col gap-8 overflow-y-auto overflow-x-clip">
        <ReadingSettingsContent scope={props.scope} />
      </Popover.Dropdown>
    </Popover>
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
          className="w-40 shrink"
          classNames={{
            input:
              "border-reader-border bg-reader-bg text-reader-text font-mono text-xs",
          }}
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
    <Stack>
      <Text size="sm" className="text-reader-text-secondary font-medium">
        Highlight color
      </Text>
      <div className="grid grid-cols-6 justify-items-center gap-1">
        {highlightColors.map((color) => (
          <Fragment key={color.value}>
            {color.value === "custom" ? (
              <Popover withinPortal={false} withArrow trapFocus>
                <Popover.Target>
                  <button
                    key={color.value}
                    className={classNames(
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
                            "custom" as ReadingPreferences["highlightColor"],
                          target: scope,
                        }),
                      )
                    }}
                  >
                    <span className="text-reader-text sr-only">
                      {color.label}
                    </span>
                  </button>
                </Popover.Target>
                <Popover.Dropdown className="border-reader-border bg-reader-surface border-0 p-0">
                  <CustomHighlightColorPicker
                    highlightColor={customHighlightColor}
                    scope={scope}
                  />
                </Popover.Dropdown>
              </Popover>
            ) : (
              <button
                key={color.value}
                className={classNames(
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
    </Stack>
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
            `flex grow flex-col flex-nowrap items-center justify-center gap-1 whitespace-nowrap rounded-lg border p-3 transition-all ${
              preference.value === option.value
                ? "border-reader-accent bg-reader-accent/10 text-reader-accent"
                : "border-reader-border text-reader-text hover:ring-reader-accent/50 ring-offset-1 hover:ring-2"
            }`,
            option.className,
          )}
        >
          {option.icon}
          <Text size="xs">{option.label}</Text>
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
        <Menu withArrow withinPortal={false} classNames={popoverClassNames}>
          <Menu.Target>
            <button
              className="hover:bg-reader-surface-hover hover:text-reader-accent-hover text-reader-text absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-md px-1 py-1"
              onClick={(e) => {
                e.stopPropagation()
              }}
            >
              <IconDotsVertical size={16} />
            </button>
          </Menu.Target>
          <Menu.Dropdown className="border-reader-border bg-reader-surface">
            <Menu.Item
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
            </Menu.Item>
            <Menu.Item
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
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </div>
  )
}

export const InfoTooltip = ({ children }: { children: React.ReactNode }) => {
  return (
    <Tooltip
      withArrow
      closeDelay={1000}
      events={{
        touch: true,
        focus: true,
        hover: true,
      }}
      multiline
      classNames={{
        tooltip: "w-60",
      }}
      label={children}
    >
      <IconInfoCircle size={16} className="text-reader-text" />
    </Tooltip>
  )
}
