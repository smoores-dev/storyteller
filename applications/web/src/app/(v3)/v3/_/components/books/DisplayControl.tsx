import { useHotkeys } from "@tanstack/react-hotkeys"

import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuGroup,
  FilterableMenuItem,
  FilterableMenuLabel,
  FilterableMenuSeparator,
  FilterableMenuSub,
  FilterableMenuSubContent,
  FilterableMenuSubTrigger,
  FilterableMenuTrigger,
} from "@/app/(v3)/v3/_/components/ui/filterable-menu"
import { ResetButton } from "@/app/(v3)/v3/_/components/ui/reset-button"
import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import { useUserPreferences } from "@/app/(v3)/v3/_/components/user-preferences-provider"
import { useTranslation } from "@/app/(v3)/v3/_/hooks/use-translation"
import {
  type ColorMode,
  ColorModes,
  defaultUserPreferences,
} from "@/database/userPreferencesTypes"
import { getFieldDef } from "@/fields"
import * as icon from "@/icons"
import { FieldIcon } from "@/icons"
import { DISPLAY_FIELDS, type DisplayField, insertDisplayField } from "@/sort"
import { useSetUserSettingMutation } from "@/store/api"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  type BookLayout,
  type GridSpacing,
  UI_SETTINGS_DEFAULTS,
  selectBookLayout,
  selectGridSpacing,
  selectGridView,
  selectListDisplayFields,
  selectListShowThumbnail,
  selectListView,
  selectShowMissingBadge,
  selectShowProcessingBadge,
  selectShowReadaloudBadge,
  uiSettingsSlice,
} from "@/store/slices/uiSettingsSlice"

const displayHotKey = "Shift+D"

export function DisplayControl({
  displayOverrides,
  onDisplayOverridesChange,
  currentFields,
  open,
  onOpenChange,
  showLayout = true,
  forceLayout,
}: {
  // null = auto (derived from sort/filter); an explicit array is the user's own
  // choice (an empty array shows nothing under the cover).
  displayOverrides: DisplayField[] | null
  onDisplayOverridesChange: (fields: DisplayField[] | null) => void
  // the fields actually being shown right now (the resolved auto/manual set), so
  // toggling out of auto starts from what the user already sees.
  currentFields: DisplayField[]
  open: boolean
  onOpenChange: (open: boolean) => void
  showLayout?: boolean
  forceLayout?: BookLayout
}) {
  const tLabels = useTranslation("Common.fields.label")
  const t = useTranslation("BooksPage")

  const { gridCoverDisplay, colorMode } = useUserPreferences()
  const [updateSetting] = useSetUserSettingMutation()

  const dispatch = useAppDispatch()
  const bookLayout = useAppSelector(selectBookLayout)
  const gridView = useAppSelector(selectGridView)
  const listView = useAppSelector(selectListView)
  const listDisplayFields = useAppSelector(selectListDisplayFields)
  const listShowThumbnail = useAppSelector(selectListShowThumbnail)
  const gridSpacing = useAppSelector(selectGridSpacing)
  const gridCardSize = useAppSelector((state) => state.uiSettings.gridCardSize)
  const showReadaloudBadge = useAppSelector(selectShowReadaloudBadge)
  const showProcessingBadge = useAppSelector(selectShowProcessingBadge)
  const showMissingBadge = useAppSelector(selectShowMissingBadge)

  useHotkeys([
    {
      hotkey: displayHotKey,
      callback: () => {
        onOpenChange(!open)
      },
    },
  ])

  const effectiveLayout = forceLayout ?? bookLayout
  const isGrid = effectiveLayout === "grid"

  const shown = isGrid ? displayOverrides ?? currentFields : listDisplayFields

  const resetLayout = () => {
    dispatch(
      uiSettingsSlice.actions.setBookLayout(UI_SETTINGS_DEFAULTS.bookLayout),
    )
  }

  const resetView = () => {
    dispatch(uiSettingsSlice.actions.setGridView(UI_SETTINGS_DEFAULTS.gridView))
    dispatch(uiSettingsSlice.actions.setListView(UI_SETTINGS_DEFAULTS.listView))
  }

  const resetAppearance = () => {
    void updateSetting({
      name: "colorMode",
      value: defaultUserPreferences.colorMode,
    })
  }

  const resetBadges = () => {
    dispatch(
      uiSettingsSlice.actions.setShowReadaloudBadge(
        UI_SETTINGS_DEFAULTS.showReadaloudBadge,
      ),
    )
    dispatch(
      uiSettingsSlice.actions.setShowProcessingBadge(
        UI_SETTINGS_DEFAULTS.showProcessingBadge,
      ),
    )
    dispatch(
      uiSettingsSlice.actions.setShowMissingBadge(
        UI_SETTINGS_DEFAULTS.showMissingBadge,
      ),
    )
  }

  const resetCard = () => {
    void updateSetting({
      name: "gridCoverDisplay",
      value: defaultUserPreferences.gridCoverDisplay,
    })
    dispatch(
      uiSettingsSlice.actions.setGridCardSize(
        UI_SETTINGS_DEFAULTS.gridCardSize,
      ),
    )
    dispatch(
      uiSettingsSlice.actions.setGridSpacing(UI_SETTINGS_DEFAULTS.gridSpacing),
    )
  }

  const resetRow = () => {
    dispatch(
      uiSettingsSlice.actions.setListShowThumbnail(
        UI_SETTINGS_DEFAULTS.listShowThumbnail,
      ),
    )
  }

  const resetShownFields = () => {
    if (isGrid) {
      onDisplayOverridesChange(UI_SETTINGS_DEFAULTS.gridDisplayFields)
      return
    }
    dispatch(
      uiSettingsSlice.actions.setListDisplayFields(
        UI_SETTINGS_DEFAULTS.listDisplayFields,
      ),
    )
  }

  const layoutIsDefault = bookLayout === UI_SETTINGS_DEFAULTS.bookLayout

  const viewIsDefault =
    gridView === UI_SETTINGS_DEFAULTS.gridView &&
    listView === UI_SETTINGS_DEFAULTS.listView

  const appearanceIsDefault = colorMode === defaultUserPreferences.colorMode

  const badgesAreDefault =
    showReadaloudBadge === UI_SETTINGS_DEFAULTS.showReadaloudBadge &&
    showProcessingBadge === UI_SETTINGS_DEFAULTS.showProcessingBadge &&
    showMissingBadge === UI_SETTINGS_DEFAULTS.showMissingBadge

  const cardIsDefault =
    gridCoverDisplay === defaultUserPreferences.gridCoverDisplay &&
    gridCardSize === UI_SETTINGS_DEFAULTS.gridCardSize &&
    gridSpacing === UI_SETTINGS_DEFAULTS.gridSpacing

  const rowIsDefault =
    listShowThumbnail === UI_SETTINGS_DEFAULTS.listShowThumbnail

  const shownFieldsAreDefault = isGrid
    ? displayOverrides === UI_SETTINGS_DEFAULTS.gridDisplayFields
    : listDisplayFields.length ===
        UI_SETTINGS_DEFAULTS.listDisplayFields.length &&
      listDisplayFields.every(
        (field, i) => UI_SETTINGS_DEFAULTS.listDisplayFields[i] === field,
      )

  const toggleField = (field: DisplayField) => {
    const base = isGrid ? displayOverrides ?? currentFields : listDisplayFields
    const next = base.includes(field)
      ? base.filter((f) => f !== field)
      : insertDisplayField(base, field)
    if (isGrid) {
      onDisplayOverridesChange(next)
    } else {
      dispatch(uiSettingsSlice.actions.setListDisplayFields(next))
    }
  }

  return (
    <FilterableMenu open={open} onOpenChange={onOpenChange}>
      <FilterableMenuTrigger
        render={
          <TooltipButton
            variant="ghost"
            size="icon-sm"
            aria-label={t.plain("displayOptions.tooltip")}
            className="shrink-0"
            tooltip={t("displayOptions.tooltip")}
            shortcut={[displayHotKey]}
          >
            <icon.Columns strokeWidth={1.5} />
          </TooltipButton>
        }
      />
      <FilterableMenuContent
        searchPlaceholder={t.plain("displayOptions.searchHint")}
      >
        {/* ---- layout + per-layout view ---- */}
        {showLayout && (
          <>
            {!forceLayout && (
              <FilterableMenuGroup>
                <FilterableMenuLabel
                  action={
                    <ResetButton
                      onReset={resetLayout}
                      disabled={layoutIsDefault}
                    />
                  }
                >
                  {t.plain("displayOptions.layout")}
                </FilterableMenuLabel>

                <FilterableMenuItem
                  closeOnClick={false}
                  textValue={t("displayOptions.grid")}
                  icon={<icon.LayoutGrid className="size-4" />}
                  onSelect={() => {
                    dispatch(uiSettingsSlice.actions.setBookLayout("grid"))
                  }}
                >
                  {t("displayOptions.grid")}
                  {isGrid && <icon.Check className="ml-auto" />}
                </FilterableMenuItem>

                <FilterableMenuItem
                  closeOnClick={false}
                  textValue={t("displayOptions.list")}
                  icon={<icon.LayoutList className="size-4" />}
                  onSelect={() => {
                    dispatch(uiSettingsSlice.actions.setBookLayout("list"))
                  }}
                >
                  {t("displayOptions.list")}
                  {!isGrid && <icon.Check className="ml-auto" />}
                </FilterableMenuItem>
              </FilterableMenuGroup>
            )}

            <FilterableMenuGroup>
              <FilterableMenuLabel
                action={
                  <ResetButton onReset={resetView} disabled={viewIsDefault} />
                }
              >
                {t.plain("displayOptions.view")}
              </FilterableMenuLabel>

              {isGrid ? (
                <>
                  <FilterableMenuItem
                    closeOnClick={false}
                    textValue={t("displayOptions.cards")}
                    icon={<icon.LayoutGrid className="size-4" />}
                    onSelect={() => {
                      dispatch(uiSettingsSlice.actions.setGridView("card"))
                    }}
                  >
                    {t("displayOptions.cards")}
                    {gridView === "card" && <icon.Check className="ml-auto" />}
                  </FilterableMenuItem>

                  <FilterableMenuItem
                    closeOnClick={false}
                    textValue={t("displayOptions.coversOnly")}
                    icon={<icon.Book className="size-4" />}
                    onSelect={() => {
                      dispatch(uiSettingsSlice.actions.setGridView("thumbnail"))
                    }}
                  >
                    {t("displayOptions.coversOnly")}
                    {gridView === "thumbnail" && (
                      <icon.Check className="ml-auto" />
                    )}
                  </FilterableMenuItem>
                </>
              ) : (
                <>
                  <FilterableMenuItem
                    closeOnClick={false}
                    textValue={t("displayOptions.rows")}
                    icon={<icon.LayoutList className="size-4" />}
                    onSelect={() => {
                      dispatch(uiSettingsSlice.actions.setListView("list"))
                    }}
                  >
                    {t("displayOptions.rows")}
                    {listView === "list" && <icon.Check className="ml-auto" />}
                  </FilterableMenuItem>

                  <FilterableMenuItem
                    closeOnClick={false}
                    textValue={t("displayOptions.table")}
                    icon={<icon.Columns3 className="size-4" />}
                    onSelect={() => {
                      dispatch(uiSettingsSlice.actions.setListView("table"))
                    }}
                  >
                    {t("displayOptions.table")}
                    {listView === "table" && <icon.Check className="ml-auto" />}
                  </FilterableMenuItem>
                </>
              )}
            </FilterableMenuGroup>

            <FilterableMenuSeparator />
          </>
        )}

        {/* ---- appearance ---- */}
        <FilterableMenuGroup>
          <FilterableMenuLabel
            action={
              <ResetButton
                onReset={resetAppearance}
                disabled={appearanceIsDefault}
              />
            }
          >
            {t.plain("displayOptions.appearance")}
          </FilterableMenuLabel>

          <FilterableMenuSub>
            <FilterableMenuSubTrigger textValue={t("displayOptions.intensity")}>
              {t("displayOptions.intensity")}
            </FilterableMenuSubTrigger>
            <FilterableMenuSubContent>
              <ColorModeSubmenu current={colorMode} />
            </FilterableMenuSubContent>
          </FilterableMenuSub>
        </FilterableMenuGroup>

        <FilterableMenuSeparator />

        {/* ---- badges (shared between grid and list) ---- */}
        <FilterableMenuGroup>
          <FilterableMenuLabel
            action={
              <ResetButton onReset={resetBadges} disabled={badgesAreDefault} />
            }
          >
            {t.plain("displayOptions.badges")}
          </FilterableMenuLabel>

          <FilterableMenuItem
            closeOnClick={false}
            textValue={t("displayOptions.readaloudIcon")}
            icon={<icon.Readaloud className="size-4" />}
            onSelect={() => {
              dispatch(
                uiSettingsSlice.actions.setShowReadaloudBadge(
                  !showReadaloudBadge,
                ),
              )
            }}
          >
            {t("displayOptions.readaloudIcon")}
            {showReadaloudBadge && <icon.Check className="ml-auto" />}
          </FilterableMenuItem>

          <FilterableMenuItem
            closeOnClick={false}
            textValue={t("displayOptions.processingIcon")}
            icon={<icon.Loader className="size-4" />}
            onSelect={() => {
              dispatch(
                uiSettingsSlice.actions.setShowProcessingBadge(
                  !showProcessingBadge,
                ),
              )
            }}
          >
            {t("displayOptions.processingIcon")}
            {showProcessingBadge && <icon.Check className="ml-auto" />}
          </FilterableMenuItem>

          <FilterableMenuItem
            closeOnClick={false}
            textValue={t("displayOptions.missingFiles")}
            icon={<icon.AlertCircle className="size-4" />}
            onSelect={() => {
              dispatch(
                uiSettingsSlice.actions.setShowMissingBadge(!showMissingBadge),
              )
            }}
          >
            {t("displayOptions.missingFiles")}
            {showMissingBadge && <icon.Check className="ml-auto" />}
          </FilterableMenuItem>
        </FilterableMenuGroup>

        <FilterableMenuSeparator />

        {/* ---- card (grid only) ---- */}
        {isGrid && (
          <>
            <FilterableMenuGroup>
              <FilterableMenuLabel
                action={
                  <ResetButton onReset={resetCard} disabled={cardIsDefault} />
                }
              >
                {t.plain("displayOptions.card")}
              </FilterableMenuLabel>

              <FilterableMenuSub>
                <FilterableMenuSubTrigger
                  icon={<icon.Readaloud className="size-4" />}
                  textValue={t("displayOptions.coverType.title")}
                >
                  {t("displayOptions.coverType.title")}
                </FilterableMenuSubTrigger>
                <FilterableMenuSubContent>
                  <CoverTypeSubmenu
                    value={gridCoverDisplay}
                    onChange={(v) => {
                      void updateSetting({
                        name: "gridCoverDisplay",
                        value: v as typeof gridCoverDisplay,
                      })
                    }}
                  />
                </FilterableMenuSubContent>
              </FilterableMenuSub>

              <FilterableMenuSub>
                <FilterableMenuSubTrigger
                  icon={<icon.Maximize className="size-4" />}
                  textValue={t("displayOptions.cardSize.title")}
                >
                  {t("displayOptions.cardSize.title")}
                </FilterableMenuSubTrigger>
                <FilterableMenuSubContent>
                  <CardSizeSubmenu
                    value={gridCardSize}
                    onChange={(v) => {
                      dispatch(
                        uiSettingsSlice.actions.setGridCardSize(
                          v as typeof gridCardSize,
                        ),
                      )
                    }}
                  />
                </FilterableMenuSubContent>
              </FilterableMenuSub>

              <FilterableMenuSub>
                <FilterableMenuSubTrigger
                  icon={<icon.ArrowsMaximize className="size-4" />}
                  textValue={t("displayOptions.cardSpacing.title")}
                >
                  {t("displayOptions.cardSpacing.title")}
                </FilterableMenuSubTrigger>
                <FilterableMenuSubContent>
                  <SpacingSubmenu
                    value={gridSpacing}
                    onChange={(v) => {
                      dispatch(uiSettingsSlice.actions.setGridSpacing(v))
                    }}
                  />
                </FilterableMenuSubContent>
              </FilterableMenuSub>
            </FilterableMenuGroup>

            <FilterableMenuSeparator />
          </>
        )}

        {/* ---- row (list only) ---- */}
        {!isGrid && (
          <>
            <FilterableMenuGroup>
              <FilterableMenuLabel
                action={
                  <ResetButton onReset={resetRow} disabled={rowIsDefault} />
                }
              >
                {t.plain("displayOptions.row")}
              </FilterableMenuLabel>

              <FilterableMenuItem
                closeOnClick={false}
                textValue={t("displayOptions.thumbnails")}
                icon={<icon.Book className="size-4" />}
                onSelect={() => {
                  dispatch(
                    uiSettingsSlice.actions.setListShowThumbnail(
                      !listShowThumbnail,
                    ),
                  )
                }}
              >
                {t("displayOptions.thumbnails")}
                {listShowThumbnail && <icon.Check className="ml-auto" />}
              </FilterableMenuItem>
            </FilterableMenuGroup>

            <FilterableMenuSeparator />
          </>
        )}

        {/* ---- show on card ---- */}
        <FilterableMenuGroup>
          <FilterableMenuLabel
            action={
              <ResetButton
                onReset={resetShownFields}
                disabled={shownFieldsAreDefault}
              />
            }
          >
            {t.plain("displayOptions.hint")}
          </FilterableMenuLabel>

          {isGrid && (
            <FilterableMenuItem
              closeOnClick={false}
              textValue={t.plain("displayOptions.auto")}
              onSelect={() => {
                onDisplayOverridesChange(null)
              }}
            >
              {t("displayOptions.auto")}
              {displayOverrides === null && <icon.Check className="ml-auto" />}
            </FilterableMenuItem>
          )}

          {DISPLAY_FIELDS.filter(
            (field) => getFieldDef(field).group !== "alignment",
          ).map((field) => (
            <FilterableMenuItem
              key={field}
              closeOnClick={false}
              textValue={tLabels(field)}
              onSelect={() => {
                toggleField(field)
              }}
            >
              <FieldIcon field={field} className="mr-2" />
              {tLabels(field)}
              {shown.includes(field) && <icon.Check className="ml-auto" />}
            </FilterableMenuItem>
          ))}

          <FilterableMenuSub>
            <FilterableMenuSubTrigger
              icon={<icon.AlignLeft className="size-4" />}
              textValue={tLabels.plain("alignment")}
            >
              {tLabels("alignment")}
            </FilterableMenuSubTrigger>
            <FilterableMenuSubContent searchable>
              {DISPLAY_FIELDS.filter(
                (field) => getFieldDef(field).group === "alignment",
              ).map((field) => (
                <FilterableMenuItem
                  key={field}
                  closeOnClick={false}
                  textValue={tLabels(field)}
                  onSelect={() => {
                    toggleField(field)
                  }}
                >
                  <FieldIcon field={field} className="mr-2" />
                  {tLabels(field)}
                  {shown.includes(field) && <icon.Check className="ml-auto" />}
                </FilterableMenuItem>
              ))}
            </FilterableMenuSubContent>
          </FilterableMenuSub>
        </FilterableMenuGroup>
      </FilterableMenuContent>
    </FilterableMenu>
  )
}

// ---- sub-menus -------------------------------------------------------------

function ColorModeSubmenu({ current }: { current: ColorMode }) {
  const [updateSetting] = useSetUserSettingMutation()

  return (
    <>
      {ColorModes.map((mode) => (
        <FilterableMenuItem
          key={mode}
          closeOnClick={false}
          textValue={mode}
          onSelect={() => {
            void updateSetting({ name: "colorMode", value: mode })
          }}
        >
          {mode === "full" ? "Full" : "Minimal"}
          {current === mode && <icon.Check className="ml-auto" />}
        </FilterableMenuItem>
      ))}
    </>
  )
}

function SpacingSubmenu({
  value,
  onChange,
}: {
  value: GridSpacing
  onChange: (v: GridSpacing) => void
}) {
  const t = useTranslation("BooksPage.displayOptions.cardSpacing")

  const options: { id: GridSpacing; label: string }[] = [
    { id: "compact", label: t("compact") },
    { id: "cozy", label: t("cozy") },
    { id: "spacious", label: t("spacious") },
  ]

  return (
    <>
      {options.map((opt) => (
        <FilterableMenuItem
          key={opt.id}
          closeOnClick={false}
          textValue={opt.label}
          onSelect={() => {
            onChange(opt.id)
          }}
        >
          {opt.label}
          {value === opt.id && <icon.Check className="ml-auto" />}
        </FilterableMenuItem>
      ))}
    </>
  )
}

function CoverTypeSubmenu({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const t = useTranslation("BooksPage.displayOptions.coverType")
  const options = [
    {
      id: "auto",
      label: t("doubleCover"),
      icon: <icon.Readaloud className="size-4" />,
    },
    {
      id: "ebook",
      label: t("ebookCover"),
      icon: <icon.Book className="size-4" />,
    },
    {
      id: "audiobook",
      label: t("audiobookCover"),
      icon: <icon.Audiobook className="size-4" />,
    },
  ]

  return (
    <>
      {options.map((opt) => (
        <FilterableMenuItem
          key={opt.id}
          closeOnClick={false}
          textValue={opt.label}
          icon={opt.icon}
          onSelect={() => {
            onChange(opt.id)
          }}
        >
          {opt.label}
          {value === opt.id && <icon.Check className="ml-auto" />}
        </FilterableMenuItem>
      ))}
    </>
  )
}

function CardSizeSubmenu({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const t = useTranslation("BooksPage.displayOptions.cardSize")

  const options = [
    { id: "smallest", label: t("small") },
    { id: "small", label: t("medium") },
    { id: "medium", label: t("large") },
    { id: "large", label: t("extraLarge") },
  ]

  const current = value === "largest" ? "large" : value

  return (
    <>
      {options.map((opt) => (
        <FilterableMenuItem
          key={opt.id}
          closeOnClick={false}
          textValue={opt.label}
          onSelect={() => {
            onChange(opt.id)
          }}
        >
          {opt.label}
          {current === opt.id && <icon.Check className="ml-auto" />}
        </FilterableMenuItem>
      ))}
    </>
  )
}
