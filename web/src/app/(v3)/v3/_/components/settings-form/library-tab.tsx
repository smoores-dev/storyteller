"use client"

import { IconPlus, IconSearch, IconTrash } from "@tabler/icons-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useWatch } from "react-hook-form"

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
import {
  cronExpressionToMinutes,
  minutesToCronExpression,
} from "@/assets/library/scanner/triggers/cron"
import {
  type ImportRuleSource,
  type ImportRuleWithCollections,
} from "@/database/importRules"
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@v3/_/components/ui/dialog"
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

// TODO: internationalize
const IMPORT_MODE_OPTIONS = [
  { value: USE_DEFAULT_VALUE, label: "Use default" },
  { value: "reference", label: "Reference in place" },
  { value: "copy", label: "Copy to library" },
  { value: "move", label: "Move to library" },
  { value: "hardlink", label: "Hard link to library" },
]

const AUTO_SOURCE_LABELS: Record<Exclude<ImportRuleSource, "user">, string> = {
  "import-relocate": "Relocated",
  "import-backup": "Backup copy",
  "prevent-reimport": "Re-import prevention",
}

function WatchRuleCard({
  rule,
  rules,
  collections,
  selected,
  onToggle,
  onDelete,
}: {
  rule: ImportRuleWithCollections
  rules: ImportRuleWithCollections[]
  collections: { uuid: UUID; name: string }[]
  selected: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const [updateRule] = useUpdateImportRuleMutation()
  const [editingPath, setEditingPath] = useState(false)
  const [editPath, setEditPath] = useState(rule.path)
  const [editError, setEditError] = useState<string | null>(null)

  function trySave() {
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
            className="text-foreground hover:text-foreground block max-w-full truncate text-left text-xs underline-offset-2 hover:underline"
            title={rule.path}
            onClick={() => {
              setEditingPath(true)
            }}
          >
            {rule.path}
          </button>
        )}

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

          <Combobox
            items={collections.map((c) => ({ value: c.uuid, label: c.name }))}
            multiple
            value={rule.collections.map((c) => c.uuid)}
            onValueChange={(uuids) => {
              void updateRule({
                uuid: rule.uuid,
                collectionUuids: uuids,
              })
            }}
          >
            <ComboboxChips className="min-w-[200px] flex-1">
              <ComboboxValue>
                {rule.collections
                  .map(
                    (c) =>
                      collections.find((cc) => cc.uuid === c.uuid)?.name ??
                      c.uuid,
                  )
                  .map((name) => (
                    <ComboboxChip key={name}>{name}</ComboboxChip>
                  ))}
              </ComboboxValue>
              <ComboboxChipsInput placeholder="Add collection" />
            </ComboboxChips>
          </Combobox>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete rule"
        onClick={onDelete}
      >
        <IconTrash size={14} className="text-destructive" />
      </Button>
    </div>
  )
}

function IgnoreRuleRow({
  rule,
  selected,
  onToggle,
  onDelete,
}: {
  rule: ImportRuleWithCollections
  selected: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border px-3 py-2">
      <Checkbox checked={selected} onCheckedChange={onToggle} />

      <span
        className="text-foreground min-w-0 flex-1 truncate text-xs"
        title={rule.path}
      >
        {rule.path}
      </span>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete rule"
        onClick={onDelete}
      >
        <IconTrash size={14} className="text-destructive" />
      </Button>
    </div>
  )
}

function AutoIgnoreRuleRow({
  rule,
  selected,
  onToggle,
}: {
  rule: ImportRuleWithCollections
  selected: boolean
  onToggle: () => void
}) {
  const sourceLabel =
    rule.source !== "user" ? AUTO_SOURCE_LABELS[rule.source] : "Auto"

  return (
    <div
      className="flex items-start gap-3 rounded-md border px-3 py-2"
      title={`uuid: ${rule.uuid}${rule.bookUuid ? `\nbook: ${rule.bookUuid}` : ""}`}
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: "watch" | "ignore"
  rules: ImportRuleWithCollections[]
  collections: { uuid: UUID; name: string }[]
}) {
  const [createRule, { isLoading }] = useCreateImportRuleMutation()
  const [path, setPath] = useState("")
  const [importMode, setImportMode] = useState<string>(USE_DEFAULT_VALUE)
  const [collectionUuids, setCollectionUuids] = useState<UUID[]>([])
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setPath("")
    setImportMode(USE_DEFAULT_VALUE)
    setCollectionUuids([])
    setError(null)
  }

  async function handleSubmit() {
    const trimmed = path.trim()
    if (!trimmed) {
      setError("Pick a folder first.")
      return
    }

    if (kind === "watch") {
      const result = validateWatchRulePath({
        path: trimmed,
        existingRules: rules,
      })
      if (!result.ok) {
        const conflictingPath = result.conflictWith
          ? rules.find((r) => r.uuid === result.conflictWith)?.path
          : undefined
        setError(watchRuleValidationMessage(result, { conflictingPath }))
        return
      }
    }

    try {
      await createRule({
        kind,
        path: trimmed,
        ...(kind === "watch" &&
          importMode !== USE_DEFAULT_VALUE && { importMode }),
        ...(kind === "watch" &&
          collectionUuids.length > 0 && { collectionUuids }),
      }).unwrap()
      reset()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rule.")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {kind === "watch" ? "Add watch rule" : "Add ignore rule"}
          </DialogTitle>
          <DialogDescription>
            {kind === "watch"
              ? "Storyteller will scan this folder for new books."
              : "Storyteller will skip this path during scans."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-2">
          <div className="space-y-1.5">
            <Label>Folder</Label>
            <Input
              defaultValue={path || "/"}
              onChange={(e) => {
                const folder = e.target.value
                setPath(folder)
                if (error) setError(null)
              }}
            />
            {path && (
              <p className="text-muted-foreground text-xs">
                Selected: <span className="text-foreground">{path}</span>
              </p>
            )}
          </div>

          {kind === "watch" && (
            <>
              <div className="space-y-1.5">
                <Label>Import mode</Label>
                <Select
                  value={importMode}
                  onValueChange={(v) => {
                    setImportMode(v ?? USE_DEFAULT_VALUE)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {IMPORT_MODE_OPTIONS.find((o) => o.value === importMode)
                        ?.label ?? "Use default"}
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
              </div>

              {collections.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Add new books to collections</Label>
                  <Combobox
                    items={collections.map((c) => ({
                      value: c.uuid,
                      label: c.name,
                    }))}
                    multiple
                    value={collectionUuids}
                    onValueChange={(uuids) => {
                      setCollectionUuids(uuids)
                    }}
                  >
                    <ComboboxChips>
                      <ComboboxValue>
                        {collections
                          .filter((c) => collectionUuids.includes(c.uuid))
                          .map((item) => (
                            <ComboboxChip key={item.uuid}>
                              {item.name}
                            </ComboboxChip>
                          ))}
                      </ComboboxValue>
                      <ComboboxChipsInput placeholder="Add collection" />
                    </ComboboxChips>
                    <ComboboxContent>
                      <ComboboxEmpty>No items found.</ComboboxEmpty>
                      <ComboboxList>
                        {collections.map((c) => (
                          <ComboboxItem key={c.uuid} value={c.uuid}>
                            {c.name}
                          </ComboboxItem>
                        ))}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </div>
              )}
            </>
          )}

          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>

        <DialogFooter>
          <DialogClose
            render={
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            }
          />
          <Button
            variant="default"
            size="sm"
            onClick={handleSubmit}
            disabled={isLoading || !path.trim()}
          >
            Add rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportRulesSection() {
  const t = useTranslations("SettingsPage.tabs.library.sections.autoImport")

  const { data: rules = [] } = useGetImportRulesQuery()
  const { data: collections = [] } = useListCollectionsQuery()
  const [deleteRules, { isLoading: isDeleting }] =
    useDeleteImportRulesMutation()

  const [activeTab, setActiveTab] = useState<"watch" | "ignore" | "auto">(
    "watch",
  )
  const [searchByTab, setSearchByTab] = useState<{
    watch: string
    ignore: string
    auto: string
  }>({ watch: "", ignore: "", auto: "" })
  const [autoPage, setAutoPage] = useState(1)
  const [selectedUuids, setSelectedUuids] = useState<Set<UUID>>(new Set())
  const [addDialogKind, setAddDialogKind] = useState<"watch" | "ignore" | null>(
    null,
  )

  const { watchRules, userIgnoreRules, autoIgnoreRules } = useMemo(() => {
    const watch: ImportRuleWithCollections[] = []
    const userIgnore: ImportRuleWithCollections[] = []
    const autoIgnore: ImportRuleWithCollections[] = []
    for (const r of rules) {
      if (r.kind === "watch") watch.push(r)
      else if (r.source === "user") userIgnore.push(r)
      else autoIgnore.push(r)
    }
    return {
      watchRules: watch,
      userIgnoreRules: userIgnore,
      autoIgnoreRules: autoIgnore,
    }
  }, [rules])

  function filterByPath(list: ImportRuleWithCollections[], q: string) {
    const needle = q.trim().toLowerCase()
    if (!needle) return list
    return list.filter((r) => r.path.toLowerCase().includes(needle))
  }

  function filterAuto(list: ImportRuleWithCollections[], q: string) {
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

  const watchSelectable = filteredWatch.map((r) => r.uuid)
  const ignoreSelectable = filteredIgnore.map((r) => r.uuid)
  const autoSelectable = filteredAuto.map((r) => r.uuid)

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

  function deleteOne(uuid: UUID) {
    void deleteRules({ uuids: [uuid] })
    setSelectedUuids((prev) => {
      if (!prev.has(uuid)) return prev
      const next = new Set(prev)
      next.delete(uuid)
      return next
    })
  }

  function handleDeleteSelected() {
    if (selectedUuids.size === 0) return
    void deleteRules({ uuids: [...selectedUuids] })
    setSelectedUuids(new Set())
  }

  function selectAllUuids(uuids: UUID[]) {
    setSelectedUuids(new Set(uuids))
  }

  function allUuidsSelected(uuids: UUID[]) {
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
          <CardDescription>
            Configure which folders Storyteller watches for new books, and which
            paths to skip during scans.
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

          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v as "watch" | "ignore" | "auto")
              setSelectedUuids(new Set())
            }}
          >
            <TabsList>
              <TabsTrigger value="watch">
                Watch
                <Badge variant="secondary">{watchRules.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="ignore">
                Ignore
                <Badge variant="secondary">{userIgnoreRules.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="auto">
                Auto-ignore
                <Badge variant="secondary">{autoIgnoreRules.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="watch" className="space-y-3">
              <TabHeader
                addLabel="Add watch rule"
                onAdd={() => {
                  setAddDialogKind("watch")
                }}
                searchPlaceholder="Search watch rules…"
                searchValue={searchByTab.watch}
                onSearchChange={(v) => {
                  setTabSearch("watch", v)
                }}
                selectedCount={selectedUuids.size}
                selectableCount={watchSelectable.length}
                allSelected={allUuidsSelected(watchSelectable)}
                isDeleting={isDeleting}
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
                      ? "No watch rules yet. Add a folder to scan."
                      : "No watch rules match your search."
                  }
                />
              ) : (
                <div className="space-y-2">
                  {filteredWatch.map((rule) => (
                    <WatchRuleCard
                      key={rule.uuid}
                      rule={rule}
                      rules={rules}
                      collections={collections}
                      selected={selectedUuids.has(rule.uuid)}
                      onToggle={() => {
                        toggleSelected(rule.uuid)
                      }}
                      onDelete={() => {
                        deleteOne(rule.uuid)
                      }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="ignore" className="space-y-3">
              <TabHeader
                addLabel="Add ignore rule"
                onAdd={() => {
                  setAddDialogKind("ignore")
                }}
                searchPlaceholder="Search ignore rules…"
                searchValue={searchByTab.ignore}
                onSearchChange={(v) => {
                  setTabSearch("ignore", v)
                }}
                selectedCount={selectedUuids.size}
                selectableCount={ignoreSelectable.length}
                allSelected={allUuidsSelected(ignoreSelectable)}
                isDeleting={isDeleting}
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
                      ? "No ignore rules. Add a path to skip during scans."
                      : "No ignore rules match your search."
                  }
                />
              ) : (
                <div className="space-y-1.5">
                  {filteredIgnore.map((rule) => (
                    <IgnoreRuleRow
                      key={rule.uuid}
                      rule={rule}
                      selected={selectedUuids.has(rule.uuid)}
                      onToggle={() => {
                        toggleSelected(rule.uuid)
                      }}
                      onDelete={() => {
                        deleteOne(rule.uuid)
                      }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="auto" className="space-y-3">
              <p className="text-muted-foreground text-xs">
                Auto-ignore rules are added by Storyteller when books are
                relocated, backed up, or removed with re-import prevention. If a
                book isn&apos;t importing, search here for its path or title.
              </p>

              <TabHeader
                searchPlaceholder="Search by path or book title…"
                searchValue={searchByTab.auto}
                onSearchChange={(v) => {
                  setTabSearch("auto", v)
                }}
                selectedCount={selectedUuids.size}
                selectableCount={autoSelectable.length}
                allSelected={allUuidsSelected(autoSelectable)}
                isDeleting={isDeleting}
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
                      ? "No auto-ignore rules."
                      : "No auto-ignore rules match your search."
                  }
                />
              ) : (
                <>
                  <p className="text-muted-foreground text-xs">
                    {showAutoPagination
                      ? `Showing ${autoStart + 1}–${autoStart + visibleAuto.length} of ${filteredAuto.length}.`
                      : `Showing ${filteredAuto.length} of ${autoIgnoreRules.length}.`}
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
                      />
                    ))}
                  </div>
                  {showAutoPagination && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <Button
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
  isDeleting,
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
  isDeleting: boolean
  onSelectAll: () => void
  onDeleteSelected: () => void
  onClearSelection: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <IconSearch
          size={14}
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 -translate-y-1/2"
        />
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
        <Button variant="outline" size="sm" onClick={onAdd}>
          <IconPlus size={14} className="mr-1" />
          {addLabel}
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        disabled={selectableCount === 0 || allSelected}
        onClick={onSelectAll}
      >
        Select all
      </Button>

      <Button
        variant="ghost"
        size="sm"
        disabled={selectedCount === 0}
        onClick={onClearSelection}
      >
        Clear
      </Button>

      {selectedCount > 0 && (
        <Button
          variant="destructive"
          size="sm"
          disabled={isDeleting}
          onClick={onDeleteSelected}
        >
          <IconTrash size={14} className="mr-1" />
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
