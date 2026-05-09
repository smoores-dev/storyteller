"use client"

import { IconChevronDown } from "@tabler/icons-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useWatch } from "react-hook-form"

import {
  cronExpressionToMinutes,
  minutesToCronExpression,
} from "@/assets/library/scanner/triggers/cron"
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
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
  { value: "fill-empty", labelKey: "modeFillEmpty" },
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
                    ?.labelKey ?? "modeFillEmpty",
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
                    ?.labelKey ?? "modeFillEmpty",
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

function ScanModal({
  open,
  onOpenChange,
  onConfirm,
  savedOverrides,
  t,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (overrides: MetadataFieldOverrides, force: boolean) => void
  savedOverrides: MetadataFieldOverrides
  t: ReturnType<typeof useTranslations>
}) {
  const [localOverrides, setLocalOverrides] =
    useState<MetadataFieldOverrides>(savedOverrides)
  const [force, setForce] = useState(false)

  const handleOpen = (next: boolean) => {
    if (next) {
      setLocalOverrides(savedOverrides)
      setForce(false)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("scanModalTitle")}</DialogTitle>
          <DialogDescription>{t("scanModalDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-2">
          <div className="flex items-center gap-2">
            <Switch
              id="scanModalForce"
              checked={force}
              onCheckedChange={setForce}
            />
            <Label htmlFor="scanModalForce">{t("forceRescan")}</Label>
          </div>

          <MetadataFieldOverridesEditor
            value={localOverrides}
            onChange={setLocalOverrides}
            t={t}
          />
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            {t("scanModalCancel")}
          </DialogClose>
          <Button
            size="sm"
            onClick={() => {
              onConfirm(localOverrides, force)
              onOpenChange(false)
            }}
          >
            {t("scanModalConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ScanTriggerButton({
  scanState,
  isTriggeringScan,
  triggerScan,
  savedOverrides,
}: {
  scanState: { running: boolean; source: string | null } | undefined
  isTriggeringScan: boolean
  triggerScan: (args: {
    force?: boolean
    metadataFieldOverrides?: MetadataFieldOverrides
  }) => void
  savedOverrides: MetadataFieldOverrides
}) {
  const t = useTranslations("SettingsPage.tabs.library.sections.scanControls")
  const [modalOpen, setModalOpen] = useState(false)
  const [cancelScan, { isLoading: isCancelling }] = useCancelScanMutation()
  const isDisabled = scanState?.running || isTriggeringScan

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-r-none border-r-0"
            disabled={isDisabled}
            onClick={() => {
              setModalOpen(true)
            }}
          >
            {t("scanLibrary")}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={isDisabled}
              className="border-border dark:bg-input/30 hover:bg-input/50 inline-flex h-6 items-center rounded-r-md border px-1 text-xs disabled:pointer-events-none disabled:opacity-50"
            >
              <IconChevronDown size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    triggerScan({})
                  }}
                >
                  {t("scanWithDefaults")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    triggerScan({ force: true })
                  }}
                >
                  {t("forceRescan")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        </div>

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

      {scanState?.running && (
        <p className="text-muted-foreground text-sm">
          {t("scanRunning", { source: scanState.source ?? "unknown" })}
        </p>
      )}

      <ScanModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        savedOverrides={savedOverrides}
        onConfirm={(overrides, force) => {
          triggerScan({
            ...(force && { force: true }),
            metadataFieldOverrides: overrides,
          })
        }}
        t={t}
      />
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
              savedOverrides={currentOverrides}
              triggerScan={(args) => {
                void triggerScan({
                  ...(args.force !== undefined && { force: args.force }),
                  ...(args.metadataFieldOverrides && {
                    metadataFieldOverrides: args.metadataFieldOverrides,
                  }),
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
