"use client"

import { useRef, useState } from "react"
import { useFormState, useWatch } from "react-hook-form"

import { MediaType } from "@storyteller-platform/media-types"

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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@v3/_/components/ui/field"
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@v3/_/components/ui/tabs"
import { cn } from "@v3/_/lib/utils"

import {
  ServerFileBrowser,
  ServerFileBrowserWeb,
  openTauriFileDialog,
} from "@/app/(v3)/v3/_/components/files/ServerFileBrowser"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/app/(v3)/v3/_/components/ui/combobox"
import { useIsTauri } from "@/app/(v3)/v3/_/hooks/use-is-tauri"
import {
  useCommon,
  useTranslation,
} from "@/app/(v3)/v3/_/hooks/use-translation"
import {
  cronExpressionToMinutes,
  minutesToCronExpression,
} from "@/assets/library/scanner/triggers/cron"
import { type ImportRuleSource } from "@/database/importRules"
import {
  normalizeRulePath,
  validateWatchRulePath,
  watchRuleValidationMessage,
} from "@/database/importRules.validation"
import {
  DEFAULT_EPUB_SUFFIX_TEMPLATE,
  EPUB_VERSION_PLACEHOLDER,
  type Epub2ImportStrategy,
  type ImportRuleInput,
  METADATA_FIELDS,
  type MetadataField,
  type MetadataFieldMode,
  type MetadataFieldOverrides,
  MetadataFieldOverridesSchema,
  type Settings,
  defaultMetadataFieldOverrides,
  renderEpubSuffix,
} from "@/database/settingsTypes"
import { statusDisplayLabel } from "@/database/statusKinds"
import { usePermissions } from "@/hooks/usePermissions"
import * as icon from "@/icons"
import {
  getImageUrl,
  useCancelScanMutation,
  useGetScanStateQuery,
  useListCollectionsQuery,
  useListStatusesQuery,
  useSetLibraryDefaultStatusMutation,
  useTriggerScanMutation,
  useUploadImageMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

import { SettingsFormField, useSettingsForm } from "./SettingsFormProvider"
import { SettingsSection } from "./shared"

const ICON_ACCEPT = [
  MediaType.PNG,
  MediaType.JPEG,
  MediaType.WEBP,
  MediaType.AVIF,
  MediaType.GIF,
]
  .map((type) => type.mime)
  .join(",")

export function LibraryTab() {
  return (
    <div className="space-y-6">
      <LibrarySection />
      <DefaultStatusSection />
      <ImportRulesSection />
      <ScanControlsSection />
    </div>
  )
}

function LibrarySection() {
  const t = useTranslation("SettingsPage.tabs.library.sections.library")
  const isTauri = useIsTauri()

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
                placeholder="The Library of Babel"
                {...field}
                aria-invalid={fieldState.invalid}
              />
            )}
          />

          {!isTauri && (
            <SettingsFormField
              name="webUrl"
              label={t("webUrl")}
              render={(field, fieldState, isLocked) => (
                <Input
                  id="webUrl"
                  disabled={isLocked}
                  placeholder="https://<your-domain>.com"
                  {...field}
                  aria-invalid={fieldState.invalid}
                />
              )}
            />
          )}

          <ServerIconField />
        </CardContent>
      </Card>
    </SettingsSection>
  )
}

function ServerIconField() {
  const t = useTranslation("SettingsPage.tabs.library.sections.library")
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploadImage, { isLoading, isError, reset }] = useUploadImageMutation()

  return (
    <SettingsFormField
      name="serverIconSha256"
      label={t("serverIcon")}
      render={(field, _, isLocked) => {
        const sha256 = field.value ?? null

        return (
          <>
            <div className="flex items-center gap-3">
              <div className="bg-muted flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border">
                {sha256 ? (
                  <img
                    src={getImageUrl(sha256, 128)}
                    alt=""
                    className="size-full object-cover"
                    width={56}
                    height={56}
                  />
                ) : (
                  <icon.Image className="text-muted-foreground size-5" />
                )}
              </div>

              <input
                ref={inputRef}
                id="serverIconSha256"
                type="file"
                accept={ICON_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (!file) return

                  reset()
                  void uploadImage(file)
                    .unwrap()
                    .then((image) => {
                      field.onChange(image.sha256)
                    })
                    .catch(() => {})
                }}
              />

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isLocked || isLoading}
                onClick={() => inputRef.current?.click()}
              >
                {sha256 ? t("serverIconReplace") : t("serverIconUpload")}
              </Button>

              {sha256 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isLocked || isLoading}
                  onClick={() => {
                    field.onChange(null)
                  }}
                >
                  {t("serverIconRemove")}
                </Button>
              )}
            </div>

            <FieldDescription>
              {isError ? t("serverIconError") : t("serverIconDescription")}
            </FieldDescription>
          </>
        )
      }}
    />
  )
}

const NONE_STATUS = "__none__"
function DefaultStatusSection() {
  const t = useTranslation("SettingsPage.tabs.library.sections.defaultStatus")
  const { data: statuses = [] } = useListStatusesQuery()
  const [setDefault] = useSetLibraryDefaultStatusMutation()

  const currentDefault = statuses.find((s) => s.isDefault)

  const statusItems = [
    ...statuses.map((s) => ({
      value: s.uuid,
      label: statusDisplayLabel(s),
    })),
    { value: NONE_STATUS, label: t("none") },
  ]

  return (
    <SettingsSection tab="library" section="defaultStatus">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel>{t("label")}</FieldLabel>
            <FieldDescription>{t("hint")}</FieldDescription>

            <Select
              value={currentDefault?.uuid ?? NONE_STATUS}
              items={statusItems}
              onValueChange={(v) => {
                if (v === NONE_STATUS) {
                  if (currentDefault) {
                    void setDefault({
                      uuid: currentDefault.uuid,
                      isDefault: false,
                    })
                  }
                } else {
                  void setDefault({ uuid: v as UUID, isDefault: true })
                }
              }}
            >
              <SelectTrigger className="w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>
    </SettingsSection>
  )
}

async function openTauriFolderDialog(
  startPath: string | undefined,
  onSave: (path: string) => void,
) {
  const result = await openTauriFileDialog({
    directory: true,
    defaultPath: startPath,
  })

  const selected = Array.isArray(result) ? result[0] : result
  if (selected) onSave(selected)
}

function ServerFileBrowserModal({
  open,
  onOpenChange,
  startPath,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  startPath?: string
  onSave: (path: string) => void
}) {
  const c = useCommon()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[70svh] max-h-[70vh] translate-y-0 flex-col sm:top-10 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{c("actions.selectFolder")}</DialogTitle>
        </DialogHeader>

        <ServerFileBrowserWeb
          directoriesOnly
          autoFocus
          startPath={startPath}
          selectLabel={c("actions.selectFolder")}
          onSelect={(path) => {
            onSave(path)
            onOpenChange(false)
          }}
          className="min-h-0 flex-1"
        />

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {c("actions.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const USE_DEFAULT_VALUE = "__default__"

// TODO: internationalize

type AutoIgnoreRule = NonNullable<Settings["autoIgnoreRules"]>[number]

let localRuleCount = 0

function newLocalRuleUuid() {
  localRuleCount += 1
  return `local-${localRuleCount}`
}

function ruleKey(rule: ImportRuleInput, index: number) {
  return rule.uuid ?? `index-${index}`
}

function WatchRuleCard({
  rule,
  collections,
  selected,
  error,
  onToggle,
  onDelete,
  onChange,
  importModeOptions,
  epub2StrategyOptions,
}: {
  rule: ImportRuleInput
  collections: { uuid: UUID; name: string }[]
  selected: boolean
  error?: string
  onToggle: () => void
  onDelete: () => void
  onChange: (patch: Partial<ImportRuleInput>) => void
  importModeOptions: { value: string; label: string }[]
  epub2StrategyOptions: { value: string; label: string }[]
}) {
  const [browseOpen, setBrowseOpen] = useState(false)
  const isTauri = useIsTauri()
  const t = useTranslation("SettingsPage.tabs.library.sections.autoImport")

  const isConfig = rule.source === "config"
  const collectionUuids = rule.collectionUuids ?? []

  function handlePathSave(newPath: string) {
    onChange({ path: newPath })
  }

  function handlePathClick() {
    if (isTauri) {
      void openTauriFolderDialog(rule.path, handlePathSave)
      return
    }

    setBrowseOpen(true)
  }

  return (
    <div className="flex gap-3 rounded-md border p-3">
      {!isConfig && (
        <Checkbox
          className="mt-1"
          checked={selected}
          onCheckedChange={onToggle}
        />
      )}

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          {isConfig ? (
            <span
              className="text-foreground block max-w-full truncate text-xs"
              title={rule.path}
            >
              {rule.path}
            </span>
          ) : (
            <button
              type="button"
              className="text-foreground hover:text-foreground block max-w-full truncate text-left text-xs underline-offset-2 hover:underline"
              title={rule.path}
              onClick={handlePathClick}
            >
              {rule.path}
            </button>
          )}

          {isConfig && <Badge variant="outline">Config</Badge>}
        </div>

        {error && <p className="text-destructive text-xs">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Select
            disabled={isConfig}
            value={rule.importMode ?? USE_DEFAULT_VALUE}
            onValueChange={(v) => {
              onChange({
                importMode:
                  v === USE_DEFAULT_VALUE
                    ? null
                    : (v as ImportRuleInput["importMode"]),
              })
            }}
            items={importModeOptions}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {importModeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            disabled={isConfig || rule.importMode === "copy"}
            value={
              rule.importMode === "copy"
                ? "replace"
                : (rule.epub2ImportStrategy ?? USE_DEFAULT_VALUE)
            }
            onValueChange={(v) => {
              onChange({
                epub2ImportStrategy:
                  v === USE_DEFAULT_VALUE
                    ? null
                    : (v as ImportRuleInput["epub2ImportStrategy"]),
              })
            }}
            items={epub2StrategyOptions}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {epub2StrategyOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!isConfig && (
            <CollectionsCombobox
              collections={collections}
              value={collectionUuids}
              placeholder={t("importCollectionsAdd")}
              onChange={(uuids) => {
                onChange({ collectionUuids: uuids })
              }}
            />
          )}
        </div>
      </div>

      {!isConfig && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Delete rule"
          onClick={onDelete}
        >
          <icon.Trash className="text-destructive size-4" />
        </Button>
      )}

      {browseOpen && !isTauri && (
        <ServerFileBrowserModal
          open={browseOpen}
          onOpenChange={setBrowseOpen}
          startPath={rule.path}
          onSave={handlePathSave}
        />
      )}
    </div>
  )
}

function CollectionsCombobox({
  collections,
  value,
  placeholder,
  onChange,
}: {
  collections: { uuid: UUID; name: string }[]
  value: string[]
  placeholder: string
  onChange: (uuids: string[]) => void
}) {
  return (
    <Combobox
      items={collections.map((c) => ({ value: c.uuid, label: c.name }))}
      multiple
      value={value}
      onValueChange={(uuids: string[]) => {
        onChange(uuids)
      }}
    >
      <ComboboxChips className="min-w-[200px] flex-1">
        <ComboboxValue>
          {collections
            .filter((c) => value.includes(c.uuid))
            .map((c) => (
              <ComboboxChip key={c.uuid}>{c.name}</ComboboxChip>
            ))}
        </ComboboxValue>
        <ComboboxChipsInput placeholder={placeholder} />
      </ComboboxChips>
      <ComboboxContent>
        <ComboboxEmpty>No collections found.</ComboboxEmpty>
        <ComboboxList>
          {collections.map((c) => (
            <ComboboxItem key={c.uuid} value={c.uuid}>
              {c.name}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

function IgnoreRuleRow({
  rule,
  selected,
  error,
  onToggle,
  onDelete,
}: {
  rule: ImportRuleInput
  selected: boolean
  error?: string
  onToggle: () => void
  onDelete: () => void
}) {
  const isConfig = rule.source === "config"

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 rounded-md border px-3 py-2">
        {!isConfig && (
          <Checkbox checked={selected} onCheckedChange={onToggle} />
        )}

        <span
          className="text-foreground min-w-0 flex-1 truncate text-xs"
          title={rule.path}
        >
          {rule.path}
        </span>

        {isConfig ? (
          <Badge variant="outline">Config</Badge>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Delete rule"
            onClick={onDelete}
          >
            <icon.Trash className="text-destructive size-4" />
          </Button>
        )}
      </div>

      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}

function AutoIgnoreRuleRow({
  rule,
  selected,
  onToggle,
  sourceLabels,
}: {
  rule: AutoIgnoreRule
  selected: boolean
  onToggle: () => void
  sourceLabels: Record<string, string | undefined>
}) {
  const sourceLabel = sourceLabels[rule.source] ?? "Auto"

  return (
    <div
      className="flex items-start gap-3 rounded-md border px-3 py-2"
      title={`uuid: ${rule.uuid}`}
    >
      <Checkbox
        className="mt-0.5"
        checked={selected}
        onCheckedChange={onToggle}
      />

      <div className="min-w-0 flex-1 space-y-0.5">
        <span className="text-foreground truncate text-xs" title={rule.path}>
          {rule.path}
        </span>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Badge variant="secondary" className="shrink-0">
            {sourceLabel}
          </Badge>
          {rule.bookTitle ? (
            <span className="truncate" title={rule.bookTitle}>
              {rule.bookTitle}
            </span>
          ) : (
            <span className="opacity-50">no linked book</span>
          )}
        </div>
      </div>
    </div>
  )
}

function AddRuleDialog({
  open,
  onOpenChange,
  kind,
  rules,
  collections,
  importModeOptions,
  epub2StrategyOptions,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: "watch" | "ignore"
  rules: ImportRuleInput[]
  collections: { uuid: UUID; name: string }[]
  importModeOptions: { value: string; label: string }[]
  epub2StrategyOptions: { value: string; label: string }[]
  onAdd: (rule: ImportRuleInput) => void
}) {
  const [path, setPath] = useState("")
  const [importMode, setImportMode] = useState<string>(USE_DEFAULT_VALUE)
  const [epub2Strategy, setEpub2Strategy] = useState<string>(USE_DEFAULT_VALUE)
  const [collectionUuids, setCollectionUuids] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const t = useTranslation("SettingsPage.tabs.library.sections.autoImport")
  function reset() {
    setPath("")
    setImportMode(USE_DEFAULT_VALUE)
    setEpub2Strategy(USE_DEFAULT_VALUE)
    setCollectionUuids([])
    setError(null)
  }

  function handleSubmit() {
    const trimmed = path.trim()
    if (!trimmed) {
      setError("Pick a folder first.")
      return
    }

    if (kind === "watch") {
      const result = validateWatchRulePath({
        path: trimmed,
        existingRules: rules.map((r, index) => ({
          uuid: ruleKey(r, index) as UUID,
          kind: r.kind,
          path: r.path,
        })),
      })
      if (!result.ok) {
        const conflictingPath = rules.find(
          (r, index) => ruleKey(r, index) === result.conflictWith,
        )?.path
        setError(
          watchRuleValidationMessage(
            result,
            conflictingPath ? { conflictingPath } : undefined,
          ),
        )
        return
      }
    } else if (
      rules.some(
        (r) => normalizeRulePath(r.path) === normalizeRulePath(trimmed),
      )
    ) {
      setError("A rule already exists for this path.")
      return
    }

    onAdd({
      uuid: newLocalRuleUuid(),
      kind,
      path: trimmed,
      importMode:
        kind === "watch" && importMode !== USE_DEFAULT_VALUE
          ? (importMode as ImportRuleInput["importMode"])
          : null,
      epub2ImportStrategy:
        kind === "watch" &&
        importMode !== "copy" &&
        epub2Strategy !== USE_DEFAULT_VALUE
          ? (epub2Strategy as ImportRuleInput["epub2ImportStrategy"])
          : null,
      collectionUuids: kind === "watch" ? collectionUuids : [],
      source: "user",
    })

    reset()
    onOpenChange(false)
  }

  const tl = useTranslation("Labels")

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex h-[80svh] max-h-[80vh] translate-y-0 flex-col sm:top-10 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {kind === "watch" ? t("addWatchRule") : t("addIgnoreRule")}
          </DialogTitle>
          <DialogDescription>
            {kind === "watch"
              ? t("addWatchRuleDescription")
              : t("addIgnoreRuleDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 pb-2">
          <ServerFileBrowser
            directoriesOnly
            autoFocus
            startPath={path || "/"}
            selectLabel={tl("folder")}
            onSelect={(folder) => {
              setPath(folder)
              if (error) setError(null)
            }}
            className="min-h-0 flex-1"
          />

          {path && (
            <p className="text-muted-foreground text-xs">
              {tl("selected.withInput", { input: path })}
            </p>
          )}

          {kind === "watch" && (
            <>
              <div className="space-y-1.5">
                <Label>{t("importMode")}</Label>
                <Select
                  value={importMode}
                  onValueChange={(v) => {
                    setImportMode(v ?? USE_DEFAULT_VALUE)
                  }}
                  items={importModeOptions}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {importModeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("epub2Strategy")}</Label>
                <Select
                  disabled={importMode === "copy"}
                  value={importMode === "copy" ? "replace" : epub2Strategy}
                  onValueChange={(v) => {
                    setEpub2Strategy(v ?? USE_DEFAULT_VALUE)
                  }}
                  items={epub2StrategyOptions}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {epub2StrategyOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {collections.length > 0 && (
                <div className="space-y-1.5">
                  <Label>{t("importCollectionsDescription")}</Label>
                  <CollectionsCombobox
                    collections={collections}
                    value={collectionUuids}
                    placeholder={t("importCollectionsAdd")}
                    onChange={setCollectionUuids}
                  />
                </div>
              )}
            </>
          )}

          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>

        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="ghost" size="sm">
                Cancel
              </Button>
            }
          />
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSubmit}
            disabled={!path.trim()}
          >
            Add rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const EPUB2_STRATEGIES = [
  "backup-and-convert",
  "convert-alongside",
  "replace",
  "skip",
] as const satisfies readonly Epub2ImportStrategy[]

const EPUB2_STRATEGY_KEYS = {
  "backup-and-convert": [
    "strategyBackupAndConvert",
    "strategyBackupAndConvertDescription",
  ],
  "convert-alongside": [
    "strategyConvertAlongside",
    "strategyConvertAlongsideDescription",
  ],
  replace: ["strategyReplace", "strategyReplaceDescription"],
  skip: ["strategySkip", "strategySkipDescription"],
} as const satisfies Record<Epub2ImportStrategy, readonly [string, string]>

const PREVIEW_BASENAME = "book"

type PreviewEntry = {
  name: string
  note: string
  highlight?: boolean
  faded?: boolean
}

function PreviewColumn({
  title,
  entries,
}: {
  title: string
  entries: PreviewEntry[]
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
        {title}
      </p>
      {entries.map((entry) => (
        <div
          key={entry.name}
          className={cn(
            "flex min-w-0 items-center gap-2",
            entry.faded && "opacity-60",
          )}
        >
          <icon.File
            className={cn(
              "size-4 shrink-0",
              entry.highlight ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span className="truncate font-mono text-xs">{entry.name}</span>
          <span className="text-muted-foreground truncate text-[11px]">
            {entry.note}
          </span>
        </div>
      ))}
    </div>
  )
}

function Epub2StrategyPreview({
  strategy,
  suffixTemplate,
}: {
  strategy: Epub2ImportStrategy
  suffixTemplate: string
}) {
  const te = useTranslation("Labels.epub2Strategy")

  const original = `${PREVIEW_BASENAME}.epub`
  const backup = `${PREVIEW_BASENAME}${renderEpubSuffix(suffixTemplate, 2)}.epub`
  const converted = `${PREVIEW_BASENAME}${renderEpubSuffix(suffixTemplate, 3)}.epub`

  const after: PreviewEntry[] =
    strategy === "backup-and-convert"
      ? [
          { name: original, note: te("previewConverted"), highlight: true },
          { name: backup, note: te("previewBackupKept") },
        ]
      : strategy === "convert-alongside"
        ? [
            { name: original, note: te("previewOriginalKept") },
            { name: converted, note: te("previewConverted"), highlight: true },
          ]
        : strategy === "replace"
          ? [{ name: original, note: te("previewConverted"), highlight: true }]
          : [{ name: original, note: te("previewNotImported"), faded: true }]

  return (
    <div className="grid gap-3 rounded-md border border-dashed p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
      <PreviewColumn
        title={te("previewBefore")}
        entries={[{ name: original, note: te("previewEpub2") }]}
      />
      <icon.ArrowRight className="text-muted-foreground hidden size-4 sm:block" />
      <PreviewColumn title={te("previewAfter")} entries={after} />
    </div>
  )
}

function Epub2StrategyField() {
  const t = useTranslation("SettingsPage.tabs.library.sections.autoImport")
  const te = useTranslation("Labels.epub2Strategy")
  const { form } = useSettingsForm()
  const suffixTemplate =
    useWatch({ control: form.control, name: "epub2BackupSuffix" }) ||
    DEFAULT_EPUB_SUFFIX_TEMPLATE

  return (
    <SettingsFormField
      name="epub2ImportStrategy"
      label={t("defaultEpub2Strategy")}
      description={t("defaultEpub2StrategyDescription")}
      render={(field, _, fieldLocked) => (
        <Tabs
          className="max-w-2xl"
          value={field.value}
          onValueChange={(value) => {
            if (typeof value === "string") field.onChange(value)
          }}
        >
          <TabsList className="w-full">
            {EPUB2_STRATEGIES.map((strategy) => (
              <TabsTrigger
                key={strategy}
                value={strategy}
                disabled={fieldLocked}
              >
                {te(EPUB2_STRATEGY_KEYS[strategy][0])}
              </TabsTrigger>
            ))}
          </TabsList>

          {EPUB2_STRATEGIES.map((strategy) => (
            <TabsContent key={strategy} value={strategy} className="space-y-3">
              <p className="text-muted-foreground">
                {te(EPUB2_STRATEGY_KEYS[strategy][1])}
              </p>

              <Epub2StrategyPreview
                strategy={strategy}
                suffixTemplate={suffixTemplate}
              />

              {(strategy === "backup-and-convert" ||
                strategy === "convert-alongside") && <Epub2BackupSuffixField />}
            </TabsContent>
          ))}
        </Tabs>
      )}
    />
  )
}

function Epub2BackupSuffixField() {
  const t = useTranslation("SettingsPage.tabs.library.sections.autoImport")

  return (
    <SettingsFormField
      name="epub2BackupSuffix"
      label={t("epub2BackupSuffix")}
      description={t("epub2BackupSuffixDescription", {
        placeholder: EPUB_VERSION_PLACEHOLDER,
        example: DEFAULT_EPUB_SUFFIX_TEMPLATE,
      })}
      render={(field, fieldState, fieldLocked) => (
        <Input
          disabled={fieldLocked}
          placeholder={DEFAULT_EPUB_SUFFIX_TEMPLATE}
          {...field}
          aria-invalid={fieldState.invalid}
          className="max-w-xs"
        />
      )}
    />
  )
}

function ImportRulesSection() {
  const t = useTranslation("SettingsPage.tabs.library.sections.autoImport")
  const tl = useTranslation("Labels.importMode")
  const te = useTranslation("Labels.epub2Strategy")

  const { form } = useSettingsForm()
  const { errors, isSubmitted } = useFormState({ control: form.control })
  const { data: collections = [] } = useListCollectionsQuery()

  const rules = useWatch({ control: form.control, name: "importRules" }) ?? []
  const autoRules =
    useWatch({ control: form.control, name: "autoIgnoreRules" }) ?? []
  const deletedUuids =
    useWatch({ control: form.control, name: "deleteRuleUuids" }) ?? []

  const [activeTab, setActiveTab] = useState<"watch" | "ignore" | "auto">(
    "watch",
  )
  const [searchByTab, setSearchByTab] = useState<{
    watch: string
    ignore: string
    auto: string
  }>({ watch: "", ignore: "", auto: "" })
  const [autoPage, setAutoPage] = useState(1)
  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set())
  const [addDialogKind, setAddDialogKind] = useState<"watch" | "ignore" | null>(
    null,
  )

  const ruleErrors = errors.importRules as
    | ({ path?: { message?: string } } | undefined)[]
    | undefined

  function setRules(next: ImportRuleInput[]) {
    form.setValue("importRules", next, {
      shouldDirty: true,
      shouldValidate: isSubmitted,
    })
  }

  function updateRule(index: number, patch: Partial<ImportRuleInput>) {
    setRules(
      rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    )
  }

  function deleteRules(keys: Set<string>) {
    setRules(rules.filter((rule, index) => !keys.has(ruleKey(rule, index))))
    setSelectedUuids(new Set())
  }

  function deleteAutoRules(uuids: string[]) {
    form.setValue(
      "deleteRuleUuids",
      [...new Set([...deletedUuids, ...uuids])],
      {
        shouldDirty: true,
      },
    )
    setSelectedUuids(new Set())
  }

  const IMPORT_MODE_OPTIONS = [
    { value: USE_DEFAULT_VALUE, label: tl("modeDefault") },
    { value: "reference", label: tl("modeReference") },
    { value: "copy", label: tl("modeCopy") },
    { value: "move", label: tl("modeMove") },
    { value: "hardlink", label: tl("modeHardlink") },
  ]

  const EPUB2_STRATEGY_OPTIONS = [
    { value: USE_DEFAULT_VALUE, label: te("strategyDefault") },
    { value: "backup-and-convert", label: te("strategyBackupAndConvert") },
    { value: "convert-alongside", label: te("strategyConvertAlongside") },
    { value: "replace", label: te("strategyReplace") },
    { value: "skip", label: te("strategySkip") },
  ]

  const AUTO_SOURCE_LABELS: Record<
    Exclude<ImportRuleSource, "user">,
    string
  > = {
    config: t("ignoreSources.config"),
    "import-relocate": t("ignoreSources.importRelocated"),
    "import-backup": t("ignoreSources.importBackup"),
    "prevent-reimport": t("ignoreSources.importPreventReimport"),
  }

  const indexedRules = rules.map((rule, index) => ({
    rule,
    index,
    key: ruleKey(rule, index),
    error: ruleErrors?.[index]?.path?.message,
  }))

  const watchRules = indexedRules.filter(({ rule }) => rule.kind === "watch")
  const userIgnoreRules = indexedRules.filter(
    ({ rule }) => rule.kind === "ignore",
  )
  const autoIgnoreRules = autoRules.filter(
    (rule) => !deletedUuids.includes(rule.uuid),
  )

  type IndexedRule = (typeof indexedRules)[number]

  function filterByPath(list: IndexedRule[], q: string) {
    const needle = q.trim().toLowerCase()
    if (!needle) return list
    return list.filter(({ rule }) => rule.path.toLowerCase().includes(needle))
  }

  function filterAuto(list: AutoIgnoreRule[], q: string) {
    const needle = q.trim().toLowerCase()
    if (!needle) return list
    return list.filter(
      (r) =>
        r.path.toLowerCase().includes(needle) ||
        (r.bookTitle?.toLowerCase().includes(needle) ?? false),
    )
  }

  const filteredWatch = filterByPath(watchRules, searchByTab.watch)
  const filteredIgnore = filterByPath(userIgnoreRules, searchByTab.ignore)
  const filteredAuto = filterAuto(autoIgnoreRules, searchByTab.auto)

  const watchSelectable = filteredWatch
    .filter(({ rule }) => rule.source !== "config")
    .map(({ key }) => key)

  const ignoreSelectable = filteredIgnore
    .filter(({ rule }) => rule.source !== "config")
    .map(({ key }) => key)

  const autoSelectable = filteredAuto.map((r) => r.uuid)

  function toggleSelected(uuid: string) {
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

    if (activeTab === "auto") {
      deleteAutoRules([...selectedUuids])
      return
    }

    deleteRules(selectedUuids)
  }

  function selectAllUuids(uuids: string[]) {
    setSelectedUuids(new Set(uuids))
  }

  function allUuidsSelected(uuids: string[]) {
    if (uuids.length === 0) return false
    return uuids.every((u) => selectedUuids.has(u))
  }

  function setTabSearch(tab: "watch" | "ignore" | "auto", value: string) {
    setSearchByTab((prev) => ({ ...prev, [tab]: value }))
    if (tab === "auto") setAutoPage(1)
  }

  const AUTO_PAGE_SIZE = 200
  const autoPageCount = Math.max(
    1,
    Math.ceil(filteredAuto.length / AUTO_PAGE_SIZE),
  )
  const clampedAutoPage = Math.min(autoPage, autoPageCount)
  const autoStart = (clampedAutoPage - 1) * AUTO_PAGE_SIZE
  const visibleAuto = filteredAuto.slice(autoStart, autoStart + AUTO_PAGE_SIZE)
  const showAutoPagination = filteredAuto.length > AUTO_PAGE_SIZE

  return (
    <SettingsSection tab="library" section="autoImport">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
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
                items={IMPORT_MODE_OPTIONS}
              >
                <SelectTrigger className="max-w-fit">
                  <SelectValue />
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

          <Epub2StrategyField />

          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v as "watch" | "ignore" | "auto")
              setSelectedUuids(new Set())
            }}
          >
            <TabsList>
              <TabsTrigger value="watch">
                {t("watch")}
                <Badge variant="secondary">{watchRules.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="ignore">
                {t("ignore")}
                <Badge variant="secondary">{userIgnoreRules.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="auto">
                {t("autoIgnore")}
                <Badge variant="secondary">{autoIgnoreRules.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="watch" className="space-y-3">
              <TabHeader
                addLabel={t("addWatchRule")}
                onAdd={() => {
                  setAddDialogKind("watch")
                }}
                searchPlaceholder={t("searchWatchRules")}
                searchValue={searchByTab.watch}
                onSearchChange={(v) => {
                  setTabSearch("watch", v)
                }}
                selectedCount={selectedUuids.size}
                selectableCount={watchSelectable.length}
                allSelected={allUuidsSelected(watchSelectable)}
                onSelectAll={() => {
                  selectAllUuids(watchSelectable)
                }}
                onDeleteSelected={handleDeleteSelected}
                onClearSelection={() => {
                  setSelectedUuids(new Set())
                }}
              />

              {filteredWatch.length === 0 ? (
                <EmptyState
                  message={
                    watchRules.length === 0
                      ? t("noWatchRules")
                      : t("noWatchRulesMatchSearch")
                  }
                />
              ) : (
                <div className="space-y-2">
                  {filteredWatch.map(({ rule, index, key, error }) => (
                    <WatchRuleCard
                      key={key}
                      rule={rule}
                      importModeOptions={IMPORT_MODE_OPTIONS}
                      epub2StrategyOptions={EPUB2_STRATEGY_OPTIONS}
                      collections={collections}
                      selected={selectedUuids.has(key)}
                      {...(error && { error })}
                      onToggle={() => {
                        toggleSelected(key)
                      }}
                      onDelete={() => {
                        deleteRules(new Set([key]))
                      }}
                      onChange={(patch) => {
                        updateRule(index, patch)
                      }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="ignore" className="space-y-3">
              <TabHeader
                addLabel={t("addIgnoreRule")}
                onAdd={() => {
                  setAddDialogKind("ignore")
                }}
                searchPlaceholder={t("searchIgnoreRules")}
                searchValue={searchByTab.ignore}
                onSearchChange={(v) => {
                  setTabSearch("ignore", v)
                }}
                selectedCount={selectedUuids.size}
                selectableCount={ignoreSelectable.length}
                allSelected={allUuidsSelected(ignoreSelectable)}
                onSelectAll={() => {
                  selectAllUuids(ignoreSelectable)
                }}
                onDeleteSelected={handleDeleteSelected}
                onClearSelection={() => {
                  setSelectedUuids(new Set())
                }}
              />

              {filteredIgnore.length === 0 ? (
                <EmptyState
                  message={
                    userIgnoreRules.length === 0
                      ? t("noIgnoreRules")
                      : t("noIgnoreRulesMatchSearch")
                  }
                />
              ) : (
                <div className="space-y-1.5">
                  {filteredIgnore.map(({ rule, key, error }) => (
                    <IgnoreRuleRow
                      key={key}
                      rule={rule}
                      selected={selectedUuids.has(key)}
                      {...(error && { error })}
                      onToggle={() => {
                        toggleSelected(key)
                      }}
                      onDelete={() => {
                        deleteRules(new Set([key]))
                      }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="auto" className="space-y-3">
              <p className="text-muted-foreground text-xs">
                {t("autoIgnoreRulesDescription")}
              </p>

              <TabHeader
                searchPlaceholder={t("searchAutoIgnoreRules")}
                searchValue={searchByTab.auto}
                onSearchChange={(v) => {
                  setTabSearch("auto", v)
                }}
                selectedCount={selectedUuids.size}
                selectableCount={autoSelectable.length}
                allSelected={allUuidsSelected(autoSelectable)}
                onSelectAll={() => {
                  selectAllUuids(autoSelectable)
                }}
                onDeleteSelected={handleDeleteSelected}
                onClearSelection={() => {
                  setSelectedUuids(new Set())
                }}
              />

              {filteredAuto.length === 0 ? (
                <EmptyState
                  message={
                    autoIgnoreRules.length === 0
                      ? t("noAutoIgnoreRules")
                      : t("noAutoIgnoreRulesMatchSearch")
                  }
                />
              ) : (
                <>
                  <p className="text-muted-foreground text-xs">
                    {showAutoPagination
                      ? t("showingRules", {
                          start: autoStart + 1,
                          end: autoStart + visibleAuto.length,
                          total: filteredAuto.length,
                        })
                      : t("showingRulesTotal", {
                          total: filteredAuto.length,
                          totalAuto: autoIgnoreRules.length,
                        })}
                  </p>
                  <div className="space-y-1.5">
                    {visibleAuto.map((rule) => (
                      <AutoIgnoreRuleRow
                        key={rule.uuid}
                        rule={rule}
                        selected={selectedUuids.has(rule.uuid)}
                        onToggle={() => {
                          toggleSelected(rule.uuid)
                        }}
                        sourceLabels={AUTO_SOURCE_LABELS}
                      />
                    ))}
                  </div>
                  {showAutoPagination && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={clampedAutoPage <= 1}
                        onClick={() => {
                          setAutoPage(clampedAutoPage - 1)
                        }}
                      >
                        Previous
                      </Button>
                      <span className="text-muted-foreground text-xs">
                        Page {clampedAutoPage} of {autoPageCount}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={clampedAutoPage >= autoPageCount}
                        onClick={() => {
                          setAutoPage(clampedAutoPage + 1)
                        }}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {addDialogKind && (
        <AddRuleDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setAddDialogKind(null)
          }}
          kind={addDialogKind}
          rules={rules}
          collections={collections}
          importModeOptions={IMPORT_MODE_OPTIONS}
          epub2StrategyOptions={EPUB2_STRATEGY_OPTIONS}
          onAdd={(rule) => {
            setRules([...rules, rule])
          }}
        />
      )}
    </SettingsSection>
  )
}

function TabHeader({
  addLabel,
  onAdd,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  selectedCount,
  selectableCount,
  allSelected,
  onSelectAll,
  onDeleteSelected,
  onClearSelection,
}: {
  addLabel?: string
  onAdd?: () => void
  searchPlaceholder: string
  searchValue: string
  onSearchChange: (value: string) => void
  selectedCount: number
  selectableCount: number
  allSelected: boolean
  onSelectAll: () => void
  onDeleteSelected: () => void
  onClearSelection: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <icon.Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 -translate-y-1/2" />
        <Input
          value={searchValue}
          onChange={(e) => {
            onSearchChange(e.target.value)
          }}
          placeholder={searchPlaceholder}
          className="pl-7"
        />
      </div>

      {addLabel && onAdd && (
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <icon.Add className="size-4" />
          {addLabel}
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={selectableCount === 0 || allSelected}
        onClick={onSelectAll}
      >
        Select all
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={selectedCount === 0}
        onClick={onClearSelection}
      >
        Clear
      </Button>

      {selectedCount > 0 && (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onDeleteSelected}
        >
          <icon.Trash className="mr-1 size-4" />
          Delete {selectedCount}
        </Button>
      )}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border-border text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-xs">
      {message}
    </div>
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
  identifiers: "fieldIdentifiers",
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

  return allSame ? (modes[0] ?? "custom") : "custom"
}

function PerFieldOverridesEditor({
  value,
  onChange,
}: {
  value: MetadataFieldOverrides
  onChange: (overrides: MetadataFieldOverrides) => void
}) {
  const t = useTranslation("Labels.metadata")
  const items = MODE_OPTIONS.map(({ value, labelKey }) => ({
    value,
    label: t(labelKey),
  }))

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
            items={items}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
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
  value: storedValue,
  onChange,
}: {
  value: MetadataFieldOverrides
  onChange: (overrides: MetadataFieldOverrides) => void
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const value = MetadataFieldOverridesSchema.parse(storedValue)
  const uniformMode = getUniformMode(value)
  const t = useTranslation("Labels.metadata")
  const items = MODE_OPTIONS.map(({ value, labelKey }) => ({
    value,
    label: t(labelKey),
  }))

  return (
    <div className="space-y-2">
      <Select
        value={uniformMode}
        onValueChange={(mode) => {
          if (mode === "custom") return
          onChange(defaultMetadataFieldOverrides(mode as MetadataFieldMode))
        }}
        items={items}
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
          <PerFieldOverridesEditor value={value} onChange={onChange} />

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
  const t = useTranslation("SettingsPage.tabs.library.sections.scanControls")
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
  const t = useTranslation("SettingsPage.tabs.library.sections.scanControls")
  const tl = useTranslation("Labels.metadata")
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
                    { shouldDirty: true },
                  )
                } else {
                  form.setValue("scanCronExpression", null, {
                    shouldDirty: true,
                  })
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
                            { shouldDirty: true },
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
            <Label>{tl("metadataFieldOverrides")}</Label>
            <p className="text-muted-foreground text-xs">
              {tl("metadataFieldOverridesDescription")}
            </p>

            <MetadataFieldOverridesEditor
              value={currentOverrides}
              onChange={(updated) => {
                form.setValue("metadataFieldOverrides", updated, {
                  shouldDirty: true,
                })
              }}
            />
          </div>
        </CardContent>
      </Card>
    </SettingsSection>
  )
}
