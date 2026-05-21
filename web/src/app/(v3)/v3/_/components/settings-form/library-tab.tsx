"use client"

import { IconPlus, IconTrash } from "@tabler/icons-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useWatch } from "react-hook-form"

import {
  cronExpressionToMinutes,
  minutesToCronExpression,
} from "@/assets/library/scanner/triggers/cron"
import { type ImportRuleWithCollections } from "@/database/importRules"
import {
  validateWatchRulePath,
  watchRuleValidationMessage,
} from "@/database/importRules.validation"
import {
  METADATA_FIELDS,
  type MetadataField,
  type MetadataFieldMode,
  type MetadataFieldOverrides,
  defaultMetadataFieldOverrides,
} from "@/database/settingsTypes"
import { usePermissions } from "@/hooks/usePermissions"
import {
  useCancelScanMutation,
  useCreateImportRuleMutation,
  useDeleteImportRulesMutation,
  useGetImportRulesQuery,
  useGetScanStateQuery,
  useListCollectionsQuery,
  useTriggerScanMutation,
  useUpdateImportRuleMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

import { Badge } from "@v3/_/components/ui/badge"
import { Button } from "@v3/_/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import { Checkbox } from "@v3/_/components/ui/checkbox"
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
      <ImportRulesSection />
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

const USE_DEFAULT_VALUE = "__default__"

const IMPORT_MODE_OPTIONS = [
  { value: USE_DEFAULT_VALUE, label: "Use default" },
  { value: "reference", label: "Reference in place" },
  { value: "copy", label: "Copy to library" },
  { value: "move", label: "Move to library" },
  { value: "hardlink", label: "Hard link to library" },
]

function ImportRuleCard({
  rule,
  rules,
  collections,
  selected,
  onToggle,
}: {
  rule: ImportRuleWithCollections
  rules: ImportRuleWithCollections[]
  collections: { uuid: UUID; name: string }[]
  selected: boolean
  onToggle: () => void
}) {
  const [updateRule] = useUpdateImportRuleMutation()
  const [editingPath, setEditingPath] = useState(false)
  const [editPath, setEditPath] = useState(rule.path)
  const [editError, setEditError] = useState<string | null>(null)

  const isWatch = rule.kind === "watch"

  function trySave() {
    if (isWatch) {
      const result = validateWatchRulePath({
        path: editPath,
        existingRules: rules,
        excludeUuid: rule.uuid,
      })
      if (!result.ok) {
        const conflictingPath = result.conflictWith
          ? rules.find((r) => r.uuid === result.conflictWith)?.path
          : undefined
        setEditError(watchRuleValidationMessage(result, { conflictingPath }))
        return
      }
    }
    setEditError(null)
    void updateRule({ uuid: rule.uuid, path: editPath })
    setEditingPath(false)
  }

  return (
    <div className="flex gap-3 rounded-md border p-3">
      <Checkbox
        className="mt-1"
        checked={selected}
        onCheckedChange={onToggle}
      />

      <div className="min-w-0 flex-1 space-y-2">
        <Badge variant={isWatch ? "default" : "secondary"}>
          {isWatch ? "watch" : "ignore"}
        </Badge>

        {editingPath ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Input
                value={editPath}
                onChange={(e) => {
                  setEditPath(e.target.value)
                  if (editError) setEditError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    trySave()
                  }

                  if (e.key === "Escape") {
                    setEditPath(rule.path)
                    setEditError(null)
                    setEditingPath(false)
                  }
                }}
                className="min-w-0 flex-1"
                aria-invalid={!!editError}
              />

              <Button variant="outline" size="sm" onClick={trySave}>
                Save
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditPath(rule.path)
                  setEditError(null)
                  setEditingPath(false)
                }}
              >
                Cancel
              </Button>
            </div>
            {editError && (
              <p className="text-destructive text-xs">{editError}</p>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground block truncate text-sm underline-offset-2 hover:underline"
            onClick={() => {
              setEditingPath(true)
            }}
          >
            {rule.path}
          </button>
        )}

        {isWatch && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={rule.importMode ?? USE_DEFAULT_VALUE}
              onValueChange={(v) => {
                const mode = v === USE_DEFAULT_VALUE ? null : v
                void updateRule({ uuid: rule.uuid, importMode: mode })
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue>
                  {IMPORT_MODE_OPTIONS.find(
                    (o) => o.value === (rule.importMode ?? USE_DEFAULT_VALUE),
                  )?.label ?? "Use default"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {IMPORT_MODE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <select
              multiple
              className="border-input bg-background h-[60px] min-w-[160px] flex-1 rounded-md border px-2 py-1 text-xs"
              value={rule.collections.map((c) => c.uuid)}
              onChange={(e) => {
                const uuids = Array.from(
                  e.target.selectedOptions,
                  (o) => o.value as UUID,
                )
                void updateRule({ uuid: rule.uuid, collectionUuids: uuids })
              }}
            >
              {collections.map((c) => (
                <option key={c.uuid} value={c.uuid}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  )
}

function ImportRulesSection() {
  const t = useTranslations("SettingsPage.tabs.library.sections.autoImport")

  const { data: rules = [] } = useGetImportRulesQuery()
  const { data: collections = [] } = useListCollectionsQuery()
  const [createRule] = useCreateImportRuleMutation()
  const [deleteRules, { isLoading: isDeleting }] =
    useDeleteImportRulesMutation()

  const [newPath, setNewPath] = useState("")
  const [newKind, setNewKind] = useState<"watch" | "ignore">("watch")
  const [newPathError, setNewPathError] = useState<string | null>(null)
  const [selectedUuids, setSelectedUuids] = useState<Set<UUID>>(new Set())

  const watchRules = rules.filter((r) => r.kind === "watch")
  const ignoreRules = rules.filter((r) => r.kind === "ignore")

  function toggleSelected(uuid: UUID) {
    setSelectedUuids((prev) => {
      const next = new Set(prev)

      if (next.has(uuid)) {
        next.delete(uuid)
      } else {
        next.add(uuid)
      }

      return next
    })
  }

  function handleDeleteSelected() {
    if (selectedUuids.size === 0) return

    void deleteRules({ uuids: [...selectedUuids] })
    setSelectedUuids(new Set())
  }

  function addRule() {
    const trimmed = newPath.trim()
    if (!trimmed) return

    if (newKind === "watch") {
      const result = validateWatchRulePath({
        path: trimmed,
        existingRules: rules,
      })
      if (!result.ok) {
        const conflictingPath = result.conflictWith
          ? rules.find((r) => r.uuid === result.conflictWith)?.path
          : undefined
        setNewPathError(
          watchRuleValidationMessage(result, { conflictingPath }),
        )
        return
      }
    }

    setNewPathError(null)
    void createRule({ kind: newKind, path: trimmed })
    setNewPath("")
  }

  return (
    <SettingsSection tab="library" section="autoImport">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            Configure which folders Storyteller watches for new books, and which
            paths to ignore during scans.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingsFormField
            name="importMode"
            label={t("defaultImportMode")}
            description={t("defaultImportModeDescription")}
            render={(field, _, fieldLocked) => (
              <Select
                disabled={fieldLocked}
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger className="max-w-fit">
                  <SelectValue>
                    {IMPORT_MODE_OPTIONS.find((o) => o.value === field.value)
                      ?.label ?? t("defaultImportMode")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {IMPORT_MODE_OPTIONS.filter(
                    (o) => o.value !== USE_DEFAULT_VALUE,
                  ).map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />

          <div className="flex items-center gap-2">
            <select
              className="border-input bg-background h-9 shrink-0 rounded-md border px-2 text-xs"
              value={newKind}
              onChange={(e) => {
                setNewKind(e.target.value as "watch" | "ignore")
              }}
            >
              <option value="watch">Watch</option>
              <option value="ignore">Ignore</option>
            </select>

            <Input
              placeholder="/path/to/folder"
              value={newPath}
              onChange={(e) => {
                setNewPath(e.target.value)
                if (newPathError) setNewPathError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addRule()
                }
              }}
              className="min-w-0 flex-1"
              aria-invalid={!!newPathError}
            />

            <Button
              variant="outline"
              size="default"
              onClick={addRule}
              disabled={!newPath.trim()}
            >
              <IconPlus size={14} className="mr-1" />
              Add rule
            </Button>
          </div>
          {newPathError && (
            <p className="text-destructive text-xs">{newPathError}</p>
          )}

          {selectedUuids.size > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={isDeleting}
                onClick={handleDeleteSelected}
              >
                <IconTrash size={14} className="mr-1" />
                Delete {selectedUuids.size} selected
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedUuids(new Set())
                }}
              >
                Clear selection
              </Button>
            </div>
          )}

          {watchRules.length > 0 && (
            <div className="space-y-2">
              <Label>Watch rules</Label>
              {watchRules.map((rule) => (
                <ImportRuleCard
                  key={rule.uuid}
                  rule={rule}
                  rules={rules}
                  collections={collections}
                  selected={selectedUuids.has(rule.uuid)}
                  onToggle={() => {
                    toggleSelected(rule.uuid)
                  }}
                />
              ))}
            </div>
          )}

          {ignoreRules.length > 0 && (
            <div className="space-y-2">
              <Label>Ignore rules</Label>
              {ignoreRules.map((rule) => (
                <ImportRuleCard
                  key={rule.uuid}
                  rule={rule}
                  rules={rules}
                  collections={collections}
                  selected={selectedUuids.has(rule.uuid)}
                  onToggle={() => {
                    toggleSelected(rule.uuid)
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </SettingsSection>
  )
}

const FIELD_LABEL_KEYS = {
  cover: "fieldCover",
  title: "fieldTitle",
  subtitle: "fieldSubtitle",
  description: "fieldDescription",
  language: "fieldLanguage",
  publicationDate: "fieldPublicationDate",
  authors: "fieldAuthors",
  narrators: "fieldNarrators",
  creators: "fieldCreators",
  series: "fieldSeries",
  tags: "fieldTags",
} as const satisfies Record<MetadataField, string>

const MODE_OPTIONS = [
  { value: "skip", labelKey: "modeSkip" },
  { value: "merge", labelKey: "modeMerge" },
  { value: "always", labelKey: "modeAlways" },
] as const satisfies { value: MetadataFieldMode; labelKey: string }[]

function getUniformMode(
  overrides: MetadataFieldOverrides,
): MetadataFieldMode | "custom" {
  const modes = METADATA_FIELDS.map((f) => overrides[f])
  const allSame = modes.every((m) => m === modes[0])

  return allSame ? modes[0] ?? "custom" : "custom"
}

function PerFieldOverridesEditor({
  value,
  onChange,
  t,
}: {
  value: MetadataFieldOverrides
  onChange: (overrides: MetadataFieldOverrides) => void
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <div className="divide-border divide-y rounded-md border">
      {METADATA_FIELDS.map((field) => (
        <div
          key={field}
          className="flex items-center justify-between px-3 py-2"
        >
          <span className="text-foreground text-xs">
            {t(FIELD_LABEL_KEYS[field])}
          </span>

          <Select
            value={value[field]}
            onValueChange={(mode) => {
              onChange({ ...value, [field]: mode })
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue>
                {t(
                  MODE_OPTIONS.find((opt) => opt.value === value[field])
                    ?.labelKey ?? "modeMerge",
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MODE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  )
}

export function MetadataFieldOverridesEditor({
  value,
  onChange,
  t,
}: {
  value: MetadataFieldOverrides
  onChange: (overrides: MetadataFieldOverrides) => void
  t: ReturnType<typeof useTranslations>
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const uniformMode = getUniformMode(value)

  return (
    <div className="space-y-2">
      <Select
        value={uniformMode}
        onValueChange={(mode) => {
          if (mode === "custom") return
          onChange(defaultMetadataFieldOverrides(mode as MetadataFieldMode))
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue>
            {uniformMode === "custom"
              ? t("modeCustom")
              : t(
                  MODE_OPTIONS.find((opt) => opt.value === uniformMode)
                    ?.labelKey ?? "modeMerge",
                )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {MODE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showAdvanced ? (
        <>
          <PerFieldOverridesEditor value={value} onChange={onChange} t={t} />

          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs underline"
            onClick={() => {
              setShowAdvanced(false)
            }}
          >
            {t("showSimpleOverrides")}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground text-xs underline"
          onClick={() => {
            setShowAdvanced(true)
          }}
        >
          {t("showAdvancedOverrides")}
        </button>
      )}
    </div>
  )
}

function ScanTriggerButton({
  scanState,
  isTriggeringScan,
  triggerScan,
}: {
  scanState: { running: boolean; source: string | null } | undefined
  isTriggeringScan: boolean
  triggerScan: (args: { force?: boolean }) => void
}) {
  const t = useTranslations("SettingsPage.tabs.library.sections.scanControls")
  const [cancelScan, { isLoading: isCancelling }] = useCancelScanMutation()
  const isDisabled = scanState?.running || isTriggeringScan

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isDisabled}
          onClick={() => {
            triggerScan({ force: true })
          }}
        >
          {t("scanLibrary")}
        </Button>

        {scanState?.running && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isCancelling}
            onClick={() => {
              void cancelScan()
            }}
          >
            {t("cancelScan")}
          </Button>
        )}
      </div>

      <p className="text-muted-foreground text-xs">{t("scanNote")}</p>

      {scanState?.running && (
        <p className="text-muted-foreground text-sm">
          {t("scanRunning", { source: scanState.source ?? "unknown" })}
        </p>
      )}
    </div>
  )
}

function ScanControlsSection() {
  const { form } = useSettingsForm()
  const t = useTranslations("SettingsPage.tabs.library.sections.scanControls")
  const permissions = usePermissions()
  const [showCronInput, setShowCronInput] = useState(false)

  const { data: scanState } = useGetScanStateQuery(undefined, {
    pollingInterval: 5_000,
    skip: !permissions?.bookProcess,
  })
  const [triggerScan, { isLoading: isTriggeringScan }] =
    useTriggerScanMutation()

  const cronExpression = useWatch({
    control: form.control,
    name: "scanCronExpression",
  })
  const isScheduled = !!cronExpression

  const intervalMinutes = cronExpression
    ? cronExpressionToMinutes(cronExpression)
    : null

  const overrides = useWatch({
    control: form.control,
    name: "metadataFieldOverrides",
  })
  const currentOverrides =
    (overrides as MetadataFieldOverrides | undefined) ??
    defaultMetadataFieldOverrides()

  return (
    <SettingsSection tab="library" section="scanControls">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {permissions?.bookProcess && (
            <ScanTriggerButton
              scanState={scanState}
              isTriggeringScan={isTriggeringScan}
              triggerScan={(args) => {
                void triggerScan({
                  ...(args.force !== undefined && { force: args.force }),
                })
              }}
            />
          )}

          <div className="flex items-center gap-2">
            <Switch
              id="enableScheduledScans"
              checked={isScheduled}
              onCheckedChange={(checked) => {
                if (checked) {
                  form.setValue(
                    "scanCronExpression",
                    minutesToCronExpression(1440),
                  )
                } else {
                  form.setValue("scanCronExpression", null)
                }
              }}
            />
            <Label htmlFor="enableScheduledScans">
              {t("enableScheduledScans")}
            </Label>
          </div>

          {isScheduled && (
            <div className="space-y-3">
              {!showCronInput ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="scanIntervalMinutes">
                      {t("scanInterval")}
                    </Label>
                    <Input
                      id="scanIntervalMinutes"
                      type="number"
                      min={1}
                      value={intervalMinutes ?? ""}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val === "") return

                        const minutes = Number(val)
                        if (minutes > 0) {
                          form.setValue(
                            "scanCronExpression",
                            minutesToCronExpression(minutes),
                          )
                        }
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground text-xs underline"
                    onClick={() => {
                      setShowCronInput(true)
                    }}
                  >
                    {t("showAdvancedCron")}
                  </button>
                </>
              ) : (
                <>
                  <SettingsFormField
                    name="scanCronExpression"
                    label={t("cronExpression")}
                    description={t("cronExpressionDescription")}
                    render={(field, fieldState, isLocked) => (
                      <Input
                        id="scanCronExpression"
                        disabled={isLocked}
                        placeholder="0 */4 * * *"
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const val = e.target.value
                          field.onChange(val || null)
                        }}
                        aria-invalid={fieldState.invalid}
                      />
                    )}
                  />

                  <div className="flex items-center gap-3">
                    <a
                      href="https://crontab.guru/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground text-xs underline"
                    >
                      {t("cronHelper")}
                    </a>

                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground text-xs underline"
                      onClick={() => {
                        setShowCronInput(false)
                      }}
                    >
                      {t("showSimpleInterval")}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("metadataFieldOverrides")}</Label>
            <p className="text-muted-foreground text-xs">
              {t("metadataFieldOverridesDescription")}
            </p>

            <MetadataFieldOverridesEditor
              value={currentOverrides}
              onChange={(updated) => {
                form.setValue("metadataFieldOverrides", updated)
              }}
              t={t}
            />
          </div>
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
