"use client"

import { useState } from "react"
import { useFormState, useWatch } from "react-hook-form"

import { Badge } from "@v3/_/components/ui/badge"
import { Button } from "@v3/_/components/ui/button"
import { Checkbox } from "@v3/_/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
} from "@v3/_/components/ui/collapsible"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
import { InfoTip } from "@v3/_/components/ui/info-tip"
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
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { cn } from "@v3/_/lib/utils"

import { SearchInput } from "@/app/(v3)/v3/_/components/books/SearchInput"
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
  type Settings,
  renderEpubSuffix,
} from "@/database/settingsTypes"
import { usePermissions } from "@/hooks/usePermissions"
import * as icon from "@/icons"
import { useListCollectionsQuery } from "@/store/api"
import { type UUID } from "@/uuid"

import { SettingsFormField, useSettingsForm } from "./SettingsFormProvider"
import {
  AdvancedFields,
  OptionWithHint,
  SettingsCard,
  SettingsLink,
  SettingsSection,
} from "./shared"

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
  const t = useTranslation("SettingsPage.tabs.files.sections.importRules")

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

  const [showAdvanced, setShowAdvanced] = useState(false)

  return (
    <div className="flex gap-3 rounded-md border p-3 py-1">
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

          {isConfig && (
            <Badge variant="outline">{t("ignoreSources.config")}</Badge>
          )}
        </div>

        {error && <p className="text-destructive text-xs">{error}</p>}

        <div className="flex flex-col items-start gap-2">
          <div className="flex w-full items-center gap-2">
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

          <Collapsible open={showAdvanced}>
            <CollapsibleContent className="flex items-center gap-2">
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
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        {!isConfig && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("deleteRule")}
            onClick={onDelete}
          >
            <icon.Trash className="text-muted-foreground size-4" />
          </Button>
        )}

        <TooltipButton
          tooltip={t("importMode")}
          tooltipSide="bottom"
          variant="ghost"
          tooltipAlign="start"
          aria-label={t("importMode")}
          className="ml-auto"
          onClick={() => {
            setShowAdvanced((old) => !old)
          }}
        >
          <icon.ChevronDown className="size-4" />
        </TooltipButton>
      </div>

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
  const t = useTranslation("SettingsPage.tabs.files.sections.importRules")

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
        <ComboboxEmpty>{t("noCollections")}</ComboboxEmpty>
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
  const t = useTranslation("SettingsPage.tabs.files.sections.importRules")
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
          <Badge variant="outline">{t("ignoreSources.config")}</Badge>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("deleteRule")}
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
  const t = useTranslation("SettingsPage.tabs.files.sections.importRules")
  const sourceLabel = sourceLabels[rule.source] ?? rule.source

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
            <span className="opacity-50">{t("noLinkedBook")}</span>
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

  const t = useTranslation("SettingsPage.tabs.files.sections.importRules")
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
      setError(t.plain("pickFolderFirst"))
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
      setError(t.plain("duplicatePath"))
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
  const c = useCommon()

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
                  <Label>{t("importCollections")}</Label>
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
                {c("actions.cancel")}
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
            {t("addRule")}
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
  "backup-and-convert": "strategyBackupAndConvert",
  "convert-alongside": "strategyConvertAlongside",
  replace: "strategyReplace",
  skip: "strategySkip",
} as const satisfies Record<Epub2ImportStrategy, string>

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
  const t = useTranslation("SettingsPage.tabs.files.sections.importRules")
  const te = useTranslation("Labels.epub2Strategy")
  const { form } = useSettingsForm()
  const suffixTemplate =
    useWatch({ control: form.control, name: "epub2BackupSuffix" }) ||
    DEFAULT_EPUB_SUFFIX_TEMPLATE

  return (
    <SettingsFormField
      name="epub2ImportStrategy"
      label={t("defaultEpub2Strategy")}
      tip={t("defaultEpub2StrategyTip")}
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
                {te(EPUB2_STRATEGY_KEYS[strategy])}
              </TabsTrigger>
            ))}
          </TabsList>

          {EPUB2_STRATEGIES.map((strategy) => (
            <TabsContent key={strategy} value={strategy} className="space-y-3">
              <Epub2StrategyPreview
                strategy={strategy}
                suffixTemplate={suffixTemplate}
              />

              {(strategy === "backup-and-convert" ||
                strategy === "convert-alongside") && (
                <AdvancedFields>
                  <Epub2BackupSuffixField />
                </AdvancedFields>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    />
  )
}

function Epub2BackupSuffixField() {
  const t = useTranslation("SettingsPage.tabs.files.sections.importRules")

  return (
    <SettingsFormField
      name="epub2BackupSuffix"
      label={t("epub2BackupSuffix")}
      tip={t("epub2BackupSuffixTip", { placeholder: EPUB_VERSION_PLACEHOLDER })}
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

export function ImportRulesSection() {
  const t = useTranslation("SettingsPage.tabs.files.sections.importRules")
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
    { value: USE_DEFAULT_VALUE, label: tl("modeDefault"), hint: null },
    {
      value: "reference",
      label: tl("modeReference"),
      hint: tl("modeReferenceHint"),
    },
    { value: "copy", label: tl("modeCopy"), hint: tl("modeCopyHint") },
    { value: "move", label: tl("modeMove"), hint: tl("modeMoveHint") },
    {
      value: "hardlink",
      label: tl("modeHardlink"),
      hint: tl("modeHardlinkHint"),
    },
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
    <SettingsSection id="importRules">
      <SettingsCard title={t("title")} description={t("description")}>
        <SettingsFormField
          name="importMode"
          label={t("defaultImportMode")}
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
              <SelectContent className="w-fit">
                {IMPORT_MODE_OPTIONS.filter(
                  (o) => o.value !== USE_DEFAULT_VALUE,
                ).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <OptionWithHint label={opt.label} hint={opt.hint} />
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
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              {t("watchRulesDescription")}
            </p>
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
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              {t("ignoreRulesDescription")}
            </p>
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
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              {t("autoIgnoreRulesDescription")}
              <InfoTip>{t("autoIgnoreRulesTip")}</InfoTip>
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
                      {t("previousPage")}
                    </Button>
                    <span className="text-muted-foreground text-xs">
                      {t("pageOf", {
                        page: clampedAutoPage,
                        total: autoPageCount,
                      })}
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
                      {t("nextPage")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </SettingsCard>

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
  const t = useTranslation("SettingsPage.tabs.files.sections.importRules")

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        value={searchValue}
        onChange={(value) => {
          onSearchChange(value)
        }}
        placeholder={searchPlaceholder}
        className="min-w-[200px]"
      />

      {addLabel && onAdd && (
        <TooltipButton
          variant="outline"
          onClick={onAdd}
          tooltip={addLabel}
          aria-label={addLabel}
          className="rounded-full"
        >
          <icon.Add className="size-4" />
        </TooltipButton>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={selectableCount === 0 || allSelected}
        onClick={onSelectAll}
      >
        {t("selectAll")}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={selectedCount === 0}
        onClick={onClearSelection}
      >
        {t("clearSelection")}
      </Button>

      {selectedCount > 0 && (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onDeleteSelected}
        >
          <icon.Trash className="mr-1 size-4" />
          {t("deleteSelected", { count: selectedCount })}
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

export function ScanControlsSection() {
  const { form } = useSettingsForm()
  const t = useTranslation("SettingsPage.tabs.files.sections.scanning")
  const permissions = usePermissions()
  const [showCronInput, setShowCronInput] = useState(false)

  const cronExpression = useWatch({
    control: form.control,
    name: "scanCronExpression",
  })
  const isScheduled = !!cronExpression

  const intervalMinutes = cronExpression
    ? cronExpressionToMinutes(cronExpression)
    : null

  return (
    <SettingsSection id="scanning">
      <SettingsCard title={t("title")} description={t("description")}>
        {permissions?.bookProcess && (
          <SettingsLink section="libraryScan">{t("scanNowLink")}</SettingsLink>
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
                  tip={t("cronExpressionTip")}
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
      </SettingsCard>
    </SettingsSection>
  )
}
