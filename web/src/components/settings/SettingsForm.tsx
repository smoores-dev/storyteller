"use client"

import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Checkbox,
  Code,
  Fieldset,
  Group,
  List,
  Modal,
  MultiSelect,
  NativeSelect,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import {
  IconFlame,
  IconLock,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react"
import { useMemo, useRef, useState } from "react"

import type { Settings } from "@/apiModels"
import {
  cronExpressionToMinutes,
  minutesToCronExpression,
} from "@/assets/library/scanner/triggers/cron"
import { type Providers } from "@/auth/providers"
import { ServerFilePicker } from "@/components/books/modals/ServerFilePicker"
import {
  ADMIN_PERMISSIONS,
  BASIC_PERMISSIONS,
  PERMISSIONS_VALUES,
} from "@/components/users/CreateInviteForm"
import {
  type ImportRuleSource,
  type ImportRuleWithCollections,
} from "@/database/importRules"
import { usePermissions } from "@/hooks/usePermissions"
import {
  useCancelScanMutation,
  useCreateImportRuleMutation,
  useDeleteImportRulesMutation,
  useGetImportRulesQuery,
  useGetMaxUploadChunkSizeQuery,
  useGetScanStateQuery,
  useListCollectionsQuery,
  useTriggerScanMutation,
  useUpdateImportRuleMutation,
  useUpdateSettingsMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

import { AuthProviderInput } from "./AuthProviderInput"
import { MetadataFieldOverridesEditor } from "./MetadataFieldOverridesEditor"

interface Props {
  settings: Settings
  authUrl?: string | undefined
  whisperVariant?: string | undefined
  configLockedKeys?: (keyof Settings)[]
}

function safeUrl(base: string, path: string) {
  try {
    return new URL(path, base).toString()
  } catch {
    return `${base}/${path}`
  }
}

const IMPORT_MODE_OPTIONS = [
  { value: "", label: "Use default" },
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
  collections,
  selected,
  onToggle,
  onDelete,
}: {
  rule: ImportRuleWithCollections
  collections: { uuid: UUID; name: string }[]
  selected: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const [updateRule] = useUpdateImportRuleMutation()
  const [editingPath, setEditingPath] = useState(false)

  return (
    <Box className="rounded border border-gray-200 p-3 dark:border-neutral-700">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Checkbox
          className="mt-2"
          checked={selected}
          onChange={onToggle}
          size="sm"
        />

        <Stack gap="xs" className="min-w-0 flex-1">
          {editingPath ? (
            <ServerFilePicker
              startPath={rule.path}
              onChange={(folder) => {
                void updateRule({ uuid: rule.uuid, path: folder })
                setEditingPath(false)
              }}
            />
          ) : (
            <Button
              variant="subtle"
              className="min-w-0 self-start"
              classNames={{ inner: "justify-start" }}
              onClick={() => {
                setEditingPath(true)
              }}
            >
              <Text className="truncate text-sm" title={rule.path}>
                {rule.path}
              </Text>
            </Button>
          )}

          <Group gap="sm" wrap="wrap">
            <NativeSelect
              size="sm"
              className="w-[180px]"
              value={rule.importMode ?? ""}
              onChange={(e) => {
                const mode = e.currentTarget.value || null
                void updateRule({ uuid: rule.uuid, importMode: mode })
              }}
            >
              {IMPORT_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </NativeSelect>

            <MultiSelect
              size="xs"
              className="min-w-[200px] flex-1"
              placeholder="No collection"
              data={collections.map((c) => ({
                value: c.uuid,
                label: c.name,
              }))}
              value={rule.collections.map((c) => c.uuid)}
              onChange={(uuids) => {
                void updateRule({
                  uuid: rule.uuid,
                  collectionUuids: uuids as UUID[],
                })
              }}
            />
          </Group>
        </Stack>

        <ActionIcon
          variant="subtle"
          color="red"
          aria-label="Delete rule"
          onClick={onDelete}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Group>
    </Box>
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
    <Group
      gap="sm"
      wrap="nowrap"
      className="rounded border border-gray-200 px-3 py-2 dark:border-neutral-700"
    >
      <Checkbox checked={selected} onChange={onToggle} size="sm" />
      <Text className="min-w-0 flex-1 truncate text-sm" title={rule.path}>
        {rule.path}
      </Text>
      <ActionIcon
        variant="subtle"
        color="red"
        aria-label="Delete rule"
        onClick={onDelete}
      >
        <IconTrash size={14} />
      </ActionIcon>
    </Group>
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
    <Group
      gap="sm"
      wrap="nowrap"
      align="flex-start"
      className="rounded border border-gray-200 px-3 py-2 dark:border-neutral-700"
      title={`uuid: ${rule.uuid}${rule.bookUuid ? `\nbook: ${rule.bookUuid}` : ""}`}
    >
      <Checkbox
        className="mt-1"
        checked={selected}
        onChange={onToggle}
        size="sm"
      />
      <Stack gap={2} className="min-w-0 flex-1">
        <Text className="truncate text-sm" title={rule.path}>
          {rule.path}
        </Text>
        <Group gap="xs" wrap="nowrap">
          <Badge size="xs" variant="light">
            {sourceLabel}
          </Badge>
          {rule.bookTitle ? (
            <Text
              className="truncate text-xs opacity-70"
              title={rule.bookTitle}
            >
              {rule.bookTitle}
            </Text>
          ) : (
            <Text className="text-xs opacity-40">no linked book</Text>
          )}
        </Group>
      </Stack>
    </Group>
  )
}

function AddRuleModal({
  opened,
  onClose,
  kind,
  rules,
  collections,
}: {
  opened: boolean
  onClose: () => void
  kind: "watch" | "ignore"
  rules: ImportRuleWithCollections[]
  collections: { uuid: UUID; name: string }[]
}) {
  const [createRule, { isLoading }] = useCreateImportRuleMutation()
  const [path, setPath] = useState("")
  const [importMode, setImportMode] = useState<string>("")
  const [collectionUuids, setCollectionUuids] = useState<UUID[]>([])
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setPath("")
    setImportMode("")
    setCollectionUuids([])
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit() {
    const trimmed = path.trim()
    if (!trimmed) {
      setError("Pick a folder first.")
      return
    }

    if (kind === "watch") {
      const existingWatch = rules.find(
        (r) => r.kind === "watch" && r.path === trimmed,
      )
      if (existingWatch) {
        setError("A watch rule already exists for this path.")
        return
      }
    }

    try {
      await createRule({
        kind,
        path: trimmed,
        ...(kind === "watch" && importMode && { importMode }),
        ...(kind === "watch" &&
          collectionUuids.length > 0 && { collectionUuids }),
      }).unwrap()
      handleClose()
    } catch (err) {
      const message =
        err && typeof err === "object" && "data" in err
          ? (err as { data?: { error?: string } }).data?.error
          : undefined
      setError(message ?? "Failed to create rule.")
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={kind === "watch" ? "Add watch rule" : "Add ignore rule"}
      centered
      size="xl"
    >
      <Stack>
        <Text size="sm" className="opacity-70">
          {kind === "watch"
            ? "Storyteller will scan this folder for new books."
            : "Storyteller will skip this path during scans."}
        </Text>

        <Box>
          <Text size="sm" fw={500} mb={4}>
            Folder
          </Text>
          <ServerFilePicker
            startPath={path || "/"}
            onChange={(folder) => {
              setPath(folder)
              if (error) setError(null)
            }}
          />
          {path && (
            <Text size="xs" className="opacity-70" mt="xs">
              Selected: <Code>{path}</Code>
            </Text>
          )}
        </Box>

        {kind === "watch" && (
          <>
            <NativeSelect
              label="Import mode"
              value={importMode}
              onChange={(e) => {
                setImportMode(e.currentTarget.value)
              }}
            >
              {IMPORT_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </NativeSelect>

            {collections.length > 0 && (
              <MultiSelect
                label="Add new books to collections"
                placeholder="No collection"
                data={collections.map((c) => ({
                  value: c.uuid,
                  label: c.name,
                }))}
                value={collectionUuids}
                onChange={(uuids) => {
                  setCollectionUuids(uuids as UUID[])
                }}
              />
            )}
          </>
        )}

        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}

        <Group justify="flex-end">
          <Button variant="subtle" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            loading={isLoading}
            disabled={!path.trim()}
            onClick={() => {
              void handleSubmit()
            }}
          >
            Add rule
          </Button>
        </Group>
      </Stack>
    </Modal>
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
    <Group gap="xs" wrap="wrap">
      <TextInput
        size="sm"
        className="min-w-[220px] flex-1"
        placeholder={searchPlaceholder}
        leftSection={<IconSearch size={14} />}
        value={searchValue}
        onChange={(e) => {
          onSearchChange(e.currentTarget.value)
        }}
      />

      {addLabel && onAdd && (
        <Button
          variant="subtle"
          size="compact-md"
          leftSection={<IconPlus size={14} />}
          onClick={onAdd}
        >
          {addLabel}
        </Button>
      )}

      <Button
        variant="subtle"
        size="compact-md"
        disabled={selectableCount === 0 || allSelected}
        onClick={onSelectAll}
      >
        Select all
      </Button>

      <Button
        variant="subtle"
        size="compact-md"
        disabled={selectedCount === 0}
        onClick={onClearSelection}
      >
        Clear
      </Button>

      {selectedCount > 0 && (
        <Button
          variant="light"
          color="red"
          size="compact-md"
          leftSection={<IconTrash size={14} />}
          loading={isDeleting}
          onClick={onDeleteSelected}
        >
          Delete {selectedCount}
        </Button>
      )}
    </Group>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <Box className="rounded border border-dashed border-gray-200 px-4 py-8 text-center dark:border-neutral-700">
      <Text size="sm" className="opacity-70">
        {message}
      </Text>
    </Box>
  )
}

function ImportRulesSection({
  importMode,
  onImportModeChange,
  isLocked,
}: {
  importMode: string
  onImportModeChange: (mode: string) => void
  isLocked: boolean
}) {
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
  const [addModalKind, setAddModalKind] = useState<"watch" | "ignore" | null>(
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
    <Fieldset legend="Import rules" disabled={isLocked}>
      <Stack>
        <Text className="text-sm text-black opacity-70 dark:text-white">
          Configure which folders Storyteller watches for new books, and which
          paths to skip during scans.
        </Text>

        <NativeSelect
          label="Default import mode"
          description="How to handle files found in import directories. Individual rules can override this."
          value={importMode}
          onChange={(e) => {
            onImportModeChange(e.currentTarget.value)
          }}
        >
          <option value="reference">Reference in place</option>
          <option value="copy">Copy to library</option>
          <option value="move">Move to library</option>
          <option value="hardlink">Hard link to library</option>
        </NativeSelect>

        <Tabs
          value={activeTab}
          onChange={(value) => {
            if (!value) return
            setActiveTab(value as "watch" | "ignore" | "auto")
            setSelectedUuids(new Set())
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="watch">
              Watch <Badge size="xs">{watchRules.length}</Badge>
            </Tabs.Tab>
            <Tabs.Tab value="ignore">
              Ignore <Badge size="xs">{userIgnoreRules.length}</Badge>
            </Tabs.Tab>
            <Tabs.Tab value="auto">
              Auto-ignore <Badge size="xs">{autoIgnoreRules.length}</Badge>
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="watch" pt="md">
            <Stack gap="sm">
              <TabHeader
                addLabel="Add watch rule"
                onAdd={() => {
                  setAddModalKind("watch")
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
                <Stack gap="xs">
                  {filteredWatch.map((rule) => (
                    <WatchRuleCard
                      key={rule.uuid}
                      rule={rule}
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
                </Stack>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="ignore" pt="md">
            <Stack gap="sm">
              <TabHeader
                addLabel="Add ignore rule"
                onAdd={() => {
                  setAddModalKind("ignore")
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
                <Stack gap="xs">
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
                </Stack>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="auto" pt="md">
            <Stack gap="sm">
              <Text size="xs" className="opacity-70">
                Auto-ignore rules are added by Storyteller when books are
                relocated, backed up, or removed with re-import prevention. If a
                book isn&apos;t importing, search here for its path or title.
              </Text>

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
                  <Text size="xs" className="opacity-70">
                    {showAutoPagination
                      ? `Showing ${autoStart + 1}–${autoStart + visibleAuto.length} of ${filteredAuto.length}.`
                      : `Showing ${filteredAuto.length} of ${autoIgnoreRules.length}.`}
                  </Text>
                  <Stack gap="xs">
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
                  </Stack>
                  {showAutoPagination && (
                    <Group justify="space-between" gap="xs">
                      <Button
                        variant="default"
                        size="compact-sm"
                        disabled={clampedAutoPage <= 1}
                        onClick={() => {
                          setAutoPage(clampedAutoPage - 1)
                        }}
                      >
                        Previous
                      </Button>
                      <Text size="xs" className="opacity-70">
                        Page {clampedAutoPage} of {autoPageCount}
                      </Text>
                      <Button
                        variant="default"
                        size="compact-sm"
                        disabled={clampedAutoPage >= autoPageCount}
                        onClick={() => {
                          setAutoPage(clampedAutoPage + 1)
                        }}
                      >
                        Next
                      </Button>
                    </Group>
                  )}
                </>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>

      {addModalKind && (
        <AddRuleModal
          opened={true}
          onClose={() => {
            setAddModalKind(null)
          }}
          kind={addModalKind}
          rules={rules}
          collections={collections}
        />
      )}
    </Fieldset>
  )
}

export function SettingsForm({
  settings,
  authUrl,
  whisperVariant,
  configLockedKeys = [],
}: Props) {
  const lockedKeys = new Set(configLockedKeys)
  const isLocked = (key: keyof Settings) => lockedKeys.has(key)
  const isAnyLocked = (...keys: (keyof Settings)[]) => keys.some(isLocked)
  const [saved, setSaved] = useState(false)
  const clearSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const permissions = usePermissions()

  const { data: maxUploadChunkSize } = useGetMaxUploadChunkSizeQuery()
  const { data: scanState } = useGetScanStateQuery(undefined, {
    pollingInterval: 5_000,
    skip: !permissions?.bookProcess,
  })

  const [updateSettings] = useUpdateSettingsMutation()
  const [triggerScan, { isLoading: isTriggeringScan }] =
    useTriggerScanMutation()
  const [cancelScan, { isLoading: isCancellingScan }] = useCancelScanMutation()

  const initialValues: Settings = {
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpUsername: settings.smtpUsername,
    smtpPassword: settings.smtpPassword,
    smtpFrom: settings.smtpFrom,
    smtpSsl: settings.smtpSsl,
    smtpRejectUnauthorized: settings.smtpRejectUnauthorized,
    libraryName: settings.libraryName,
    webUrl: settings.webUrl,
    maxTrackLength: settings.maxTrackLength ?? 2,
    codec: settings.codec ?? "",
    bitrate: settings.bitrate ?? "",
    transcriptionEngine: settings.transcriptionEngine ?? "whisper.cpp",
    whisperModel: settings.whisperModel ?? "tiny",
    whisperThreads: settings.whisperThreads,
    // whisperModelOverrides: settings.whisperModelOverrides,
    autoDetectLanguage: settings.autoDetectLanguage,
    whisperCpuFallback: settings.whisperCpuFallback,
    whisperServerUrl: settings.whisperServerUrl ?? "",
    whisperServerApiKey: settings.whisperServerApiKey ?? "",
    googleCloudApiKey: settings.googleCloudApiKey ?? "",
    azureSubscriptionKey: settings.azureSubscriptionKey ?? "",
    azureServiceRegion: settings.azureServiceRegion ?? "",
    amazonTranscribeRegion: settings.amazonTranscribeRegion ?? "",
    amazonTranscribeAccessKeyId: settings.amazonTranscribeAccessKeyId ?? "",
    amazonTranscribeSecretAccessKey:
      settings.amazonTranscribeSecretAccessKey ?? "",
    amazonTranscribeBucketName: settings.amazonTranscribeBucketName ?? "",
    openAiApiKey: settings.openAiApiKey ?? "",
    openAiOrganization: settings.openAiOrganization ?? "",
    openAiBaseUrl: settings.openAiBaseUrl ?? "",
    openAiModelName: settings.openAiModelName ?? "",
    deepgramApiKey: settings.deepgramApiKey ?? "",
    deepgramModel: settings.deepgramModel ?? "nova-3",
    parallelTranscribes: settings.parallelTranscribes,
    parallelTranscodes: settings.parallelTranscodes,
    authProviders: settings.authProviders,
    disablePasswordLogin: settings.disablePasswordLogin,
    importMode: settings.importMode,
    readaloudLocationType: settings.readaloudLocationType,
    readaloudLocation: settings.readaloudLocation,
    maxUploadChunkSize:
      maxUploadChunkSize?.maxUploadChunkSize ?? settings.maxUploadChunkSize,
    opdsEnabled: settings.opdsEnabled,
    opdsPageSize: settings.opdsPageSize,
    scanCronExpression: settings.scanCronExpression ?? null,
    metadataFieldOverrides: settings.metadataFieldOverrides,
    epub2ImportStrategy: settings.epub2ImportStrategy,
    epub2BackupSuffix: settings.epub2BackupSuffix,
  }

  const form = useForm({
    mode: "controlled",
    initialValues,
  })

  const state = form.values
  const canDisablePassword = state.authProviders.some(
    (p) =>
      p.kind === "custom" &&
      p.allowRegistration &&
      Object.values(p.groupPermissions ?? {}).some((perms) =>
        perms.includes("settingsUpdate"),
      ),
  )
  // sometimes the webUrl is not a valid URL, so we fallback to /opds
  const opdsUrl = safeUrl(state.webUrl, "/opds")
  const authUrlPath = authUrl ?? safeUrl(state.webUrl, "/api/v2/auth")

  return (
    <form
      onSubmit={form.onSubmit(async (updatedSettings) => {
        await updateSettings(updatedSettings)
        setSaved(true)

        if (clearSavedTimeoutRef.current) {
          clearTimeout(clearSavedTimeoutRef.current)
        }
        clearSavedTimeoutRef.current = setTimeout(() => {
          setSaved(false)
        }, 2000)
      })}
    >
      {configLockedKeys.length > 0 && (
        <Alert
          className="mt-4"
          variant="light"
          color="st-orange"
          title="Locked settings"
          icon={<IconLock size={18} />}
        >
          Some settings are{" "}
          <Anchor
            className="text-sm"
            href="https://storyteller-platform.gitlab.io/storyteller/docs/installation/self-hosting#declarative-configuration"
            target="_blank"
          >
            managed via configuration file
          </Anchor>{" "}
          and cannot be changed here.
        </Alert>
      )}
      <Fieldset legend="Library settings">
        <TextInput
          label="Library name"
          {...form.getInputProps("libraryName")}
          disabled={isLocked("libraryName")}
        />
        <TextInput
          label="Web URL"
          {...form.getInputProps("webUrl")}
          type="url"
          disabled={isLocked("webUrl")}
        />
      </Fieldset>
      <ImportRulesSection
        importMode={state.importMode}
        onImportModeChange={(mode) => {
          form.setFieldValue(
            "importMode",
            mode as "reference" | "copy" | "move" | "hardlink",
          )
        }}
        isLocked={isLocked("importMode")}
      />
      <Fieldset
        legend="Library scanning"
        disabled={isAnyLocked("scanCronExpression", "metadataFieldOverrides")}
      >
        <Stack>
          <Text className="text-sm opacity-70 dark:text-white">
            Scan your library for new files and changes. Scans check all tracked
            books and import paths for additions, removals, and modified files.
          </Text>

          {permissions?.bookProcess && (
            <Group>
              <Button
                variant="outline"
                loading={isTriggeringScan}
                onClick={() => {
                  void triggerScan({ force: true })
                }}
                disabled={Boolean(scanState?.running)}
              >
                Scan library
              </Button>
              <Text className="text-xs opacity-60">
                Re-reads all import paths and book metadata, even if files
                haven&apos;t changed since the last scan.
              </Text>
            </Group>
          )}

          {permissions?.bookProcess && scanState?.running && (
            <Group align="center" gap="sm">
              <Text className="text-sm opacity-70 dark:text-white">
                Scan in progress ({scanState.source ?? "unknown"})
              </Text>

              <Button
                variant="subtle"
                color="red"
                size="compact-sm"
                loading={isCancellingScan}
                onClick={() => {
                  void cancelScan()
                }}
              >
                Cancel
              </Button>
            </Group>
          )}

          <Switch
            label="Run scans on a schedule"
            checked={!!state.scanCronExpression}
            onChange={(event) => {
              if (!event.currentTarget.checked) {
                form.setFieldValue("scanCronExpression", null)
                return
              }

              form.setFieldValue(
                "scanCronExpression",
                minutesToCronExpression(1440),
              )
            }}
          />

          {!!state.scanCronExpression && (
            <>
              <NumberInput
                label="Scan interval (minutes)"
                min={1}
                value={cronExpressionToMinutes(state.scanCronExpression) ?? ""}
                onChange={(val) => {
                  if (val === "") return

                  const minutes = Number(val)
                  if (minutes > 0) {
                    form.setFieldValue(
                      "scanCronExpression",
                      minutesToCronExpression(minutes),
                    )
                  }
                }}
              />

              <TextInput
                label="Or use a cron expression"
                description={
                  <>
                    Standard cron syntax (minute hour day month weekday).{" "}
                    <Anchor
                      href="https://crontab.guru/"
                      target="_blank"
                      rel="noopener noreferrer"
                      size="sm"
                    >
                      Cron expression reference
                    </Anchor>
                  </>
                }
                placeholder="0 */4 * * *"
                value={state.scanCronExpression}
                onChange={(event) => {
                  const val = event.currentTarget.value
                  form.setFieldValue("scanCronExpression", val || null)
                }}
              />
            </>
          )}

          <MetadataFieldOverridesEditor
            value={state.metadataFieldOverrides}
            onChange={(overrides) => {
              form.setFieldValue("metadataFieldOverrides", overrides)
            }}
            description="Controls how Storyteller handles metadata changes in existing book files made outside of Storyteller during scans. If you manage your books with other tools (e.g. Calibre, Audiobookshelf) and want those changes reflected in Storyteller, consider using always override. The default (fill empty) is suitable for most users. For example, when importing the book it didn't have a description, so that field was empty. When scanning the book again, we now see it has a description, so when 'fill empty' is used, the description found in the .epub will be used."
          />
        </Stack>
      </Fieldset>

      <Fieldset
        legend="EPUB 2 handling"
        disabled={isAnyLocked("epub2ImportStrategy", "epub2BackupSuffix")}
      >
        <Text className="mb-3 text-sm text-black opacity-70 dark:text-white">
          Many older EPUB files use the EPUB 2 format, which Storyteller does
          not natively support. When an EPUB 2 file is encountered during
          auto-import, Storyteller can automatically convert it to EPUB 3.
        </Text>
        <NativeSelect
          label="EPUB 2 import strategy"
          {...form.getInputProps("epub2ImportStrategy")}
        >
          <option value="backup-and-convert">
            Create a backup copy, then convert to EPUB 3
          </option>
          <option value="replace">
            Convert to EPUB 3 in place (no backup)
          </option>
          <option value="skip">Skip EPUB 2 files (do not import)</option>
        </NativeSelect>
        {form.values.epub2ImportStrategy !== "skip" && (
          <TextInput
            label="Backup suffix"
            description="When creating a backup, this suffix is appended to the original filename before converting."
            {...form.getInputProps("epub2BackupSuffix")}
            disabled={form.values.epub2ImportStrategy !== "backup-and-convert"}
          />
        )}
      </Fieldset>
      <Fieldset
        legend="Readaloud location"
        disabled={isAnyLocked("readaloudLocationType", "readaloudLocation")}
      >
        <Box className="mb-3 text-sm opacity-70">
          <Text className="text-sm text-black dark:text-white">
            Storyteller can be configured to save new readaloud files in a
            number of places, when the input files were not uploaded through the
            web client:
          </Text>
          <List listStyleType="disc" className="text-sm">
            <List.Item>
              In the same folder as the input EPUB file, with a user-provided
              suffix (defaults to “ (readaloud)”).
            </List.Item>
            <List.Item>
              In a user-provided folder name next to the EPUB file (defaults to
              “readaloud/”).
            </List.Item>
            <List.Item>
              In a user-provided folder somewhere outside the auto-import
              folder.
            </List.Item>
            <List.Item>
              In the Storyteller internal folder, alongside the transcoded audio
              and transcription files.
            </List.Item>
          </List>
        </Box>
        <NativeSelect
          label="Readaloud location"
          {...form.getInputProps("readaloudLocationType")}
          onChange={(e) => {
            const value = e.currentTarget
              .value as Settings["readaloudLocationType"]
            form.setFieldValue("readaloudLocationType", value)
            switch (value) {
              case "SUFFIX": {
                form.setFieldValue("readaloudLocation", " (readaloud)")
                break
              }
              case "SIBLING_FOLDER": {
                form.setFieldValue("readaloudLocation", "readaloud")
                break
              }
              case "CUSTOM_FOLDER": {
                form.setFieldValue("readaloudLocation", "/readalouds")
                break
              }
              case "INTERNAL": {
                form.setFieldValue("readaloudLocation", "")
                break
              }
            }
          }}
        >
          <option value="SUFFIX">Alongside input with a suffix</option>
          <option value="SIBLING_FOLDER">Alongside input in a folder</option>
          <option value="CUSTOM_FOLDER">In a custom folder</option>
          <option value="INTERNAL">In the Storyteller internal folder</option>
        </NativeSelect>
        {form.values.readaloudLocationType !== "INTERNAL" && (
          <TextInput
            label={
              form.values.readaloudLocationType === "SUFFIX"
                ? "Suffix"
                : form.values.readaloudLocationType === "SIBLING_FOLDER"
                  ? "Sibling folder name"
                  : "Custom folder path"
            }
            {...form.getInputProps("readaloudLocation")}
          />
        )}
      </Fieldset>
      <Fieldset legend="Audio settings">
        <NativeSelect
          label="Maximum processed track length"
          description={
            <span className="text-black opacity-70 dark:text-white">
              Audio tracks longer than this will be split to be this length or
              shorter before transcribing.
              <br />
              This can help with reducing Storyteller&rsquo;s memory usage
              during transcription.
            </span>
          }
          {...form.getInputProps("maxTrackLength")}
          disabled={isLocked("maxTrackLength")}
        >
          <option value={0.25}>15 minutes</option>
          <option value={0.5}>30 minutes</option>
          <option value={0.75}>45 minutes</option>
          <option value={1}>1 hour</option>
          <option value={2}>2 hours (default)</option>
          <option value={3}>3 hours</option>
          <option value={4}>4 hours</option>
        </NativeSelect>
        <NativeSelect
          label="Preferred audio codec"
          {...form.getInputProps("codec")}
          onChange={(e) => {
            form.setFieldValue("codec", e.target.value)
            form.setFieldValue("bitrate", "")
          }}
          disabled={isLocked("codec")}
        >
          <option value="">Default</option>
          <option value="libopus">OPUS</option>
          <option value="libmp3lame">MP3</option>
          <option value="aac">AAC</option>
        </NativeSelect>
        {state.codec === "libopus" && (
          <NativeSelect
            label="Preferred audio bitrate"
            {...form.getInputProps("bitrate")}
            disabled={isLocked("bitrate")}
          >
            <option value="">Default (32 Kb/s)</option>
            <option value="16K">16 Kb/s</option>
            <option value="24K">24 Kb/s</option>
            <option value="32K">32 Kb/s</option>
            <option value="64K">64 Kb/s</option>
            <option value="96K">96 Kb/s</option>
          </NativeSelect>
        )}
        {state.codec === "libmp3lame" && (
          <NativeSelect
            label="Preferred audio bitrate"
            {...form.getInputProps("bitrate")}
            disabled={isLocked("bitrate")}
          >
            <option value="">Default (constant 48 kb/s)</option>
            <option value="0">0 (high quality/low compression)</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">
              4 (perceptually transparent/moderate compression)
            </option>
            <option value="5">5</option>
            <option value="6">6 (acceptable quality/high compression)</option>
            <option value="7">7</option>
            <option value="8">8</option>
            <option value="9">9</option>
          </NativeSelect>
        )}
      </Fieldset>
      <Fieldset legend="Transcription settings">
        <Box className="mb-3 text-sm opacity-70">
          <p>
            As part of the synchronization process, Storyteller attempts to
            transcribe the audiobook narration to text.
          </p>
          <p>
            This is by far the most resource-intensive phase of the process. By
            default, Storyteller will attempt to run the transcription job
            locally, using your server&apos;s hardware.
          </p>
          <p>
            You can also run the transcription job via a remote `whisper.cpp`
            server. This most often used when you want to run the transcription
            job on a different machine than the one running Storyteller. See the
            documentation for more details.
          </p>
          <p>
            If you would prefer to run the task via a paid third-party service,
            you set that with the &quot;transcription engine&quot; setting
            below.
          </p>
          <p>The available paid transcription services are:</p>
          <List listStyleType="disc" className="text-sm">
            <List.Item>
              <a href="https://cloud.google.com/text-to-speech">Google Cloud</a>
            </List.Item>
            <List.Item>
              <a href="https://cloud.google.com/speech-to-text" rel="nofollow">
                Google Cloud
              </a>
            </List.Item>
            <List.Item>
              <a
                href="https://azure.microsoft.com/en-us/products/ai-services/speech-to-text/"
                rel="nofollow"
              >
                Azure Cognitive Services
              </a>
            </List.Item>
            <List.Item>
              <a href="https://aws.amazon.com/transcribe/" rel="nofollow">
                Amazon Transcribe
              </a>
            </List.Item>
            <List.Item>
              <a href="https://platform.openai.com/" rel="nofollow">
                OpenAI Cloud Platform
              </a>
            </List.Item>
            <List.Item>
              <a
                href="https://developers.deepgram.com/docs/pre-recorded-audio"
                rel="nofollow"
              >
                Deepgram Speech to Text
              </a>
            </List.Item>
          </List>
        </Box>
        <NativeSelect
          label="Transcription engine"
          {...form.getInputProps("transcriptionEngine")}
          disabled={isLocked("transcriptionEngine")}
        >
          <option value="whisper.cpp">whisper.cpp (local)</option>
          <option value="whisper-server">whisper.cpp (remote)</option>
          <option value="google-cloud">Google Cloud</option>
          <option value="microsoft-azure">Azure Cognitive Services</option>
          <option value="amazon-transcribe">Amazon Transcribe</option>
          <option value="openai-cloud">OpenAI Cloud Platform</option>
          <option value="deepgram">Deepgram Speech to Text</option>
        </NativeSelect>
        {state.transcriptionEngine === "whisper.cpp" && (
          <Stack>
            <Text className="text-sm opacity-70">
              Using whisper.cpp variant: <Code>{whisperVariant ?? "cpu"}</Code>.
              To use a different variant (e.g. with GPU acceleration), install a
              different Storyteller image.
            </Text>
            <Text className="text-sm opacity-70">
              You can specify which Whisper model Storyteller should use for
              transcription. The default (tiny) is sufficient for most English
              books. For books with many uncommon words, or in languages other
              than English, you may need to try larger models, such as small or
              medium.
            </Text>
            <NativeSelect
              label="Whisper model"
              {...form.getInputProps("whisperModel")}
              disabled={isLocked("whisperModel")}
            >
              <option value="tiny">tiny</option>
              <option value="tiny.en">tiny.en</option>
              <option value="tiny-q5_1">tiny-q5_1</option>
              <option value="base">base</option>
              <option value="base.en">base.en</option>
              <option value="base-q5_1">base-q5_1</option>
              <option value="small">small</option>
              <option value="small.en">small.en</option>
              <option value="small-q5_1">small-q5_1</option>
              <option value="medium">medium</option>
              <option value="medium.en">medium.en</option>
              <option value="medium-q5_0">medium-q5_0</option>
              <option value="large-v1">large-v1</option>
              <option value="large-v2">large-v2</option>
              <option value="large-v2-q5_0">large-v2-q5_0</option>
              <option value="large-v3">large-v3</option>
              <option value="large-v3-q5_0">large-v3-q5_0</option>
              <option value="large-v3-turbo">large-v3-turbo</option>
              <option value="large-v3-turbo-q5_0">large-v3-turbo-q5_0</option>
            </NativeSelect>
            <NumberInput
              label={
                <div className="flex items-center gap-0">
                  <IconFlame
                    className="mr-2 inline-block fill-orange-600 text-orange-600"
                    size={16}
                  />
                  Turbo mode
                </div>
              }
              description={
                <>
                  <Text size="sm">
                    Change the parallelization level of the Whisper model. Can
                    result in a massive speed increase when doing
                    GPU-accelerated transcription.
                  </Text>
                  <Text size="sm">
                    It is not recommended to set both this value and the
                    &quot;Number of audio tracks to process in parallel&quot;
                    value to a value greater than 1. Choose one or the other.
                  </Text>
                </>
              }
              min={1}
              max={16}
              {...form.getInputProps("whisperThreads")}
            />

            <Text size="sm" className="opacity-70">
              <span className="font-bold text-orange-600">Warning!</span>{" "}
              Setting above 1 may reduce transcription accuracy but increases
              speed by splitting audio into chunks processed in parallel. Do not
              report bugs if you set this to a value greater than 1 and are not
              able to get a consistent Readaloud, only if you cannot get a
              consistent Readaloud even with a value of 1.
            </Text>
            <NativeSelect
              label="CPU fallback"
              description="If you have a GPU variant installed but want to fall back to CPU transcription, select a CPU variant here. This will download and use the selected CPU variant instead of the GPU variant."
              value={state.whisperCpuFallback ?? ""}
              onChange={(e) => {
                const val = e.currentTarget.value
                form.setFieldValue(
                  "whisperCpuFallback",
                  val === "" ? null : (val as "blas" | "cpu"),
                )
              }}
              disabled={isLocked("whisperCpuFallback")}
            >
              <option value="">Use default (GPU if available)</option>
              <option value="blas">OpenBLAS (optimized CPU)</option>
              <option value="cpu">Plain CPU</option>
            </NativeSelect>
            {/* <Switch
              label="Auto-detect language"
              description="When enabled, Storyteller will attempt to detect the language of the audio instead of using the book's language metadata. This will slow down transcription."
              {...form.getInputProps("autoDetectLanguage", {
                type: "checkbox",
              })}
            />
            <Fieldset
              legend="Per-language model overrides"
              className="mt-4"
              disabled={!state.autoDetectLanguage}
            >
              <Box className="mb-3 text-sm opacity-70">
                <p>
                  You can specify different Whisper models for specific
                  languages. For example, use <Code>tiny.en</Code> for English
                  and <Code>large-v3-turbo</Code> for other languages.
                </p>
                {!state.autoDetectLanguage && (
                  <p className="mt-2 font-medium">
                    Enable auto-detect language above to use per-language model
                    overrides.
                  </p>
                )}
              </Box>
              <Stack gap={8}>
                {Object.entries(state.whisperModelOverrides).map(
                  ([lang, model]) => (
                    <Group key={lang} gap={8}>
                      <NativeSelect
                        label="Language"
                        value={lang}
                        className="flex-1"
                        onChange={(e) => {
                          const newKey = e.currentTarget.value as Language
                          const newOverrides = Object.fromEntries(
                            Object.entries(state.whisperModelOverrides).map(
                              ([k, v]) => (k === lang ? [newKey, v] : [k, v]),
                            ),
                          ) as Record<Language, WhisperModel>
                          form.setFieldValue(
                            "whisperModelOverrides",
                            newOverrides,
                          )
                        }}
                      >
                        <option value="">Select language</option>
                        {LANGUAGES.map((l) => (
                          <option key={l.value} value={l.value}>
                            {l.label}
                          </option>
                        ))}
                      </NativeSelect>
                      <NativeSelect
                        label="Model"
                        value={model}
                        className="flex-1"
                        onChange={(e) => {
                          form.setFieldValue("whisperModelOverrides", {
                            ...state.whisperModelOverrides,
                            [lang]: e.currentTarget.value as WhisperModel,
                          })
                        }}
                      >
                        <option value="tiny">tiny</option>
                        <option value="tiny.en">tiny.en</option>
                        <option value="tiny-q5_1">tiny-q5_1</option>
                        <option value="base">base</option>
                        <option value="base.en">base.en</option>
                        <option value="base-q5_1">base-q5_1</option>
                        <option value="small">small</option>
                        <option value="small.en">small.en</option>
                        <option value="small-q5_1">small-q5_1</option>
                        <option value="medium">medium</option>
                        <option value="medium.en">medium.en</option>
                        <option value="medium-q5_0">medium-q5_0</option>
                        <option value="large-v1">large-v1</option>
                        <option value="large-v2">large-v2</option>
                        <option value="large-v2-q5_0">large-v2-q5_0</option>
                        <option value="large-v3">large-v3</option>
                        <option value="large-v3-q5_0">large-v3-q5_0</option>
                        <option value="large-v3-turbo">large-v3-turbo</option>
                        <option value="large-v3-turbo-q5_0">
                          large-v3-turbo-q5_0
                        </option>
                      </NativeSelect>
                      <ActionIcon
                        variant="subtle"
                        className="mt-6"
                        onClick={() => {
                          const newOverrides = Object.fromEntries(
                            Object.entries(state.whisperModelOverrides).filter(
                              ([k]) => k !== lang,
                            ),
                          ) as Record<Language, WhisperModel>
                          form.setFieldValue(
                            "whisperModelOverrides",
                            newOverrides,
                          )
                        }}
                      >
                        <IconTrash color="red" />
                      </ActionIcon>
                    </Group>
                  ),
                )}
                <Button
                  leftSection={<IconPlus />}
                  variant="outline"
                  className="self-start"
                  onClick={() => {
                    form.setFieldValue("whisperModelOverrides", {
                      ...state.whisperModelOverrides,
                      en: "tiny" as WhisperModel,
                    })
                  }}
                >
                  Add override
                </Button>
              </Stack>
            </Fieldset> */}
          </Stack>
        )}
        {state.transcriptionEngine === "google-cloud" && (
          <TextInput
            label="API key"
            withAsterisk
            {...form.getInputProps("googleCloudApiKey")}
            disabled={isLocked("googleCloudApiKey")}
          />
        )}
        {state.transcriptionEngine === "microsoft-azure" && (
          <>
            <TextInput
              label="Subscription key"
              withAsterisk
              {...form.getInputProps("azureSubscriptionKey")}
              disabled={isLocked("azureSubscriptionKey")}
            />
            <TextInput
              label="Service region key"
              withAsterisk
              {...form.getInputProps("azureServiceRegion")}
              disabled={isLocked("azureServiceRegion")}
            />
          </>
        )}
        {state.transcriptionEngine === "amazon-transcribe" && (
          <>
            <TextInput
              label="Region"
              withAsterisk
              {...form.getInputProps("amazonTranscribeRegion")}
              disabled={isLocked("amazonTranscribeRegion")}
            />
            <TextInput
              label="Bucket name"
              withAsterisk
              description={
                <>
                  <Text size="sm">
                    Amazon Transcribe’s batch transcription job API requires
                    that files are uploaded to an S3 bucket before starting the
                    transcribe job. This is the bucket that Storyteller will
                    upload files to.
                  </Text>
                </>
              }
              {...form.getInputProps("amazonTranscribeBucketName")}
            />
            <TextInput
              label="Access key id"
              withAsterisk
              {...form.getInputProps("amazonTranscribeAccessKeyId")}
              disabled={isLocked("amazonTranscribeAccessKeyId")}
            />
            <TextInput
              label="Secret access key"
              withAsterisk
              {...form.getInputProps("amazonTranscribeSecretAccessKey")}
              disabled={isLocked("amazonTranscribeSecretAccessKey")}
            />
          </>
        )}
        {state.transcriptionEngine === "openai-cloud" && (
          <>
            <TextInput
              label="API Key"
              withAsterisk
              {...form.getInputProps("openAiApiKey")}
              disabled={isLocked("openAiApiKey")}
            />
            <TextInput
              label="Organization (optional)"
              {...form.getInputProps("openAiOrganization")}
              disabled={isLocked("openAiOrganization")}
            />
            <TextInput
              label="Base URL (optional)"
              description={
                <>
                  You can use a custom base URL to point at a OpenAI
                  Cloud-compatible service URL, such as a self-hosted{" "}
                  <a
                    className="text-st-orange-800 underline"
                    href="https://github.com/speaches-ai/speaches"
                  >
                    speaches
                  </a>{" "}
                  instance, or a remote{" "}
                  <a
                    className="text-st-orange-800 underline"
                    href="https://github.com/ggml-org/whisper.cpp/tree/master/examples/server"
                  >
                    whisper.cpp HTTP server (we recommend using the `whisper.cpp
                    (remote)` setting for that instead)
                  </a>
                  .
                </>
              }
              {...form.getInputProps("openAiBaseUrl")}
              disabled={isLocked("openAiBaseUrl")}
            />
            <TextInput
              label="Model name (optional)"
              description={
                <>
                  e.g. <Code>Systran/faster-distil-whisper-large-v3</Code> for
                  faster-whisper-server&rsquo;s large-v3 model, or{" "}
                  <Code>whisper-1</Code> for large-v3 on OpenAI Cloud. Warning:
                  do not use non-whisper models here, such as{" "}
                  <Code>openai-4o</Code>, as the timeline will not be generated
                  correctlye
                </>
              }
              {...form.getInputProps("openAiModelName")}
              disabled={isLocked("openAiModelName")}
            />
          </>
        )}
        {state.transcriptionEngine === "whisper-server" && (
          <>
            <Text size="sm">
              Use a remote, self-hosted `whisper.cpp` server for transcription.
              Useful if you have a powerful machine to offload transcription to.
              See our{" "}
              <a href="https://storyteller-platform.gitlab.io/storyteller/docs/tutorials/offloading-transcription">
                offloading transcription guide
              </a>{" "}
              for more information.
            </Text>
            <TextInput
              label="Server URL"
              description={
                <>
                  e.g. <Code>http://192.168.1.19:8080</Code> for the local
                  whisper.cpp server.
                </>
              }
              withAsterisk
              {...form.getInputProps("whisperServerUrl")}
            />
            <TextInput
              description={
                <>Only necessary if your server requires an API key.</>
              }
              label="API Key"
              {...form.getInputProps("whisperServerApiKey")}
            />
          </>
        )}
        {state.transcriptionEngine === "deepgram" && (
          <>
            <TextInput
              label="API Key"
              withAsterisk
              {...form.getInputProps("deepgramApiKey")}
              disabled={isLocked("deepgramApiKey")}
            />
            <TextInput
              label="Model name"
              description={
                <>
                  Can be any model the server supports, like <Code>nova-3</Code>
                  , <Code>nova-2</Code>,<Code>nova</Code>, <Code>enhanced</Code>
                  , <Code>base</Code> or <Code>whisper</Code> (see model list{" "}
                  <a
                    href="https://developers.deepgram.com/docs/model"
                    rel="nofollow"
                  >
                    here
                  </a>
                  ). Defaults to <Code>nova-3</Code>
                </>
              }
              {...form.getInputProps("deepgramModel")}
              disabled={isLocked("deepgramModel")}
            />
          </>
        )}
      </Fieldset>
      <Fieldset legend="Parellelization settings">
        <Box className="mb-3 text-sm opacity-70">
          <p>
            Since Storyteller splits audiobooks into multiple tracks, it&apos;s
            possible to run transcoding and transcription on multiple tracks in
            parallel.
          </p>
        </Box>
        <NumberInput
          label="Number of audio tracks to transcode in parallel"
          description="Transcoding one track will use on CPU core"
          {...form.getInputProps("parallelTranscodes")}
          disabled={isLocked("parallelTranscodes")}
        />
        <NumberInput
          label="Number of audio tracks to transcribe in parallel"
          description="Transcribing one track will use up to 4 CPU cores (when using CPU-based transcription)"
          {...form.getInputProps("parallelTranscribes")}
          disabled={isLocked("parallelTranscribes")}
        />
      </Fieldset>
      <Fieldset
        legend="Authentication providers"
        disabled={isLocked("authProviders")}
      >
        <Stack gap={4} className="my-4">
          {state.authProviders.map((provider, i) => (
            <Fieldset
              key={i}
              legend="Provider"
              className="relative bg-white pt-10 dark:bg-neutral-800"
            >
              <Select
                {...form.getInputProps(`authProviders.${i}.kind`)}
                onChange={(value) => {
                  if (value === "built-in") {
                    form.replaceListItem("authProviders", i, {
                      kind: "built-in",
                      id: "keycloak",
                      issuer: "",
                      clientId: "",
                      clientSecret: "",
                    })
                  } else {
                    form.replaceListItem("authProviders", i, {
                      kind: "custom",
                      name: "",
                      issuer: "",
                      clientId: "",
                      clientSecret: "",
                      type: "oidc",
                    })
                  }
                }}
                required
                withAsterisk
                data={[
                  { value: "built-in", label: "Built-in" },
                  { value: "custom", label: "Custom" },
                ]}
              />
              {provider.kind === "built-in" ? (
                <AuthProviderInput
                  value={provider.id}
                  onChange={(value) => {
                    form.replaceListItem("authProviders", i, {
                      ...provider,
                      id: value as keyof typeof Providers,
                    })
                  }}
                />
              ) : (
                <TextInput
                  label="Name"
                  required
                  withAsterisk
                  {...form.getInputProps(`authProviders.${i}.name`)}
                />
              )}

              <Text>
                Set callback URL to {authUrlPath}
                /callback/
                {(provider.kind === "custom" ? provider.name : provider.id)
                  .toLowerCase()
                  .replaceAll(/ +/g, "-")
                  .replaceAll(/[^a-zA-Z0-9-]/g, "")}
              </Text>
              {provider.kind === "custom" && (
                <>
                  <Select
                    label="Provider type"
                    required
                    withAsterisk
                    {...form.getInputProps(`authProviders.${i}.type`)}
                    defaultValue="oidc"
                    data={[
                      { value: "oidc", label: "OIDC" },
                      { value: "oauth", label: "OAuth" },
                    ]}
                  />
                </>
              )}
              <TextInput
                label="Issuer"
                required={provider.kind === "custom"}
                withAsterisk={provider.kind === "custom"}
                description={
                  provider.kind === "built-in" ? (
                    <>
                      Only required for some providers. Look up your provider in{" "}
                      <Anchor
                        className="text-sm"
                        href="https://authjs.dev/reference/core/providers"
                      >
                        the Auth.js docs
                      </Anchor>{" "}
                      for more information.
                    </>
                  ) : undefined
                }
                placeholder="https://auth.example.com"
                {...form.getInputProps(`authProviders.${i}.issuer`)}
              />
              <TextInput
                label="Client ID"
                required
                withAsterisk
                {...form.getInputProps(`authProviders.${i}.clientId`)}
              />
              <PasswordInput
                label="Client secret"
                required
                withAsterisk
                {...form.getInputProps(`authProviders.${i}.clientSecret`)}
              />
              {provider.kind === "custom" && (
                <>
                  <Switch
                    label="Allow registration"
                    description="Automatically create accounts for new users from this provider"
                    {...form.getInputProps(
                      `authProviders.${i}.allowRegistration`,
                      {
                        type: "checkbox",
                      },
                    )}
                  />
                  {provider.allowRegistration && (
                    <Fieldset legend="Group Permissions" className="mt-2">
                      <Text className="mb-2 text-sm text-gray-600">
                        Map OIDC groups to permissions. If specified, users not
                        in any listed group will be denied access.
                      </Text>
                      <Stack gap="sm">
                        {Object.entries(provider.groupPermissions ?? {}).map(
                          ([groupName, permissions], idx) => {
                            const setPerms = (perms: string[]) => {
                              form.setFieldValue(
                                `authProviders.${i}.groupPermissions`,
                                {
                                  ...provider.groupPermissions,
                                  [groupName]: perms,
                                },
                              )
                            }
                            return (
                              <Box
                                key={idx}
                                className="relative rounded border p-3"
                              >
                                <TextInput
                                  label="Group name"
                                  value={groupName}
                                  onChange={(e) => {
                                    const newName = e.target.value
                                    const { [groupName]: perms, ...rest } =
                                      provider.groupPermissions ?? {}
                                    // Prevent overwriting existing group
                                    if (
                                      newName !== groupName &&
                                      newName in rest
                                    )
                                      return

                                    form.setFieldValue(
                                      `authProviders.${i}.groupPermissions`,
                                      { ...rest, [newName]: perms ?? [] },
                                    )
                                  }}
                                  className="mb-2"
                                />
                                <Box className="mb-1 flex justify-end gap-1">
                                  <Button
                                    variant="subtle"
                                    size="xs"
                                    onClick={() => {
                                      setPerms([...ADMIN_PERMISSIONS])
                                    }}
                                  >
                                    Admin
                                  </Button>
                                  <Button
                                    variant="subtle"
                                    size="xs"
                                    onClick={() => {
                                      setPerms([...BASIC_PERMISSIONS])
                                    }}
                                  >
                                    Basic
                                  </Button>
                                </Box>
                                <MultiSelect
                                  label="Permissions"
                                  data={PERMISSIONS_VALUES}
                                  value={permissions}
                                  onChange={setPerms}
                                />
                                <ActionIcon
                                  variant="subtle"
                                  className="absolute top-1 right-1"
                                  size="sm"
                                  onClick={() => {
                                    const { [groupName]: _, ...rest } =
                                      provider.groupPermissions ?? {}
                                    form.setFieldValue(
                                      `authProviders.${i}.groupPermissions`,
                                      Object.keys(rest).length > 0
                                        ? rest
                                        : undefined,
                                    )
                                  }}
                                >
                                  <IconTrash size={14} color="red" />
                                </ActionIcon>
                              </Box>
                            )
                          },
                        )}
                        <Button
                          leftSection={<IconPlus size={14} />}
                          variant="outline"
                          size="xs"
                          className="self-start"
                          onClick={() => {
                            const existing = provider.groupPermissions ?? {}
                            // Use empty string; user must provide a name
                            if ("" in existing) return
                            form.setFieldValue(
                              `authProviders.${i}.groupPermissions`,
                              { ...existing, "": [...BASIC_PERMISSIONS] },
                            )
                          }}
                        >
                          Add group
                        </Button>
                      </Stack>
                    </Fieldset>
                  )}
                </>
              )}
              <ActionIcon
                variant="subtle"
                className="absolute top-0 right-4"
                onClick={() => {
                  form.removeListItem("authProviders", i)
                }}
              >
                <IconTrash color="red" />
              </ActionIcon>
            </Fieldset>
          ))}
          <Button
            leftSection={<IconPlus />}
            variant="outline"
            mt="sm"
            className="self-start"
            onClick={() => {
              form.insertListItem("authProviders", {
                kind: "built-in",
                id: "keycloak",
                clientId: "",
                clientSecret: "",
                issuer: "",
              })
            }}
          >
            Add provider
          </Button>
          <Switch
            label="Disable password login"
            description={
              canDisablePassword
                ? "Only allow login via configured authentication providers. Most OPDS clients do not support OAuth."
                : "Requires an auth provider with a group that can change server settings"
            }
            mt="md"
            disabled={!canDisablePassword}
            {...form.getInputProps("disablePasswordLogin", {
              type: "checkbox",
            })}
          />
        </Stack>
      </Fieldset>
      <Fieldset
        legend="Upload settings"
        disabled={isLocked("maxUploadChunkSize")}
      >
        <Stack>
          {maxUploadChunkSize?.overriden && (
            <Text className="text-sm">
              Your max chunk size is overriden via the environment variable{" "}
              <code>STORYTELLER_MAX_UPLOAD_CHUNK_SIZE</code>. Change that
              environment variable to change the value, or unset it to configure
              the value here in the settings.
            </Text>
          )}
          <Switch
            label="Enable max chunk size"
            description="Don’t enable this unless you’re running into maximum request size issues with your reverse proxy or hosting provider."
            disabled={maxUploadChunkSize?.overriden ?? false}
            checked={state.maxUploadChunkSize !== null}
            onChange={(event) => {
              const value = event.currentTarget.checked
              if (value) {
                form.setFieldValue("maxUploadChunkSize", 100_000_000)
              } else {
                form.setFieldValue("maxUploadChunkSize", null)
              }
            }}
          />
          {state.maxUploadChunkSize !== null && (
            <NumberInput
              label="Max chunk size"
              description="Size in bytes. Default is 100MB, which is Cloudfare’s maximum request size."
              disabled={maxUploadChunkSize?.overriden ?? false}
              value={state.maxUploadChunkSize}
              {...form.getInputProps("maxUploadChunkSize")}
            />
          )}
        </Stack>
      </Fieldset>
      <Fieldset legend="OPDS settings">
        <Stack>
          <Switch
            label="Enable OPDS feed"
            description={`OPDS allows compatible e-reader apps to browse and download books from your library. It can be accessed at ${opdsUrl}.`}
            checked={state.opdsEnabled ?? true}
            onChange={(event) => {
              form.setFieldValue("opdsEnabled", event.currentTarget.checked)
            }}
            disabled={isLocked("opdsEnabled")}
          />
          <Switch
            label="Enable pagination"
            description="Some OPDS clients don't handle pagination well. Disable this to return all items in a single response."
            checked={state.opdsPageSize !== null}
            onChange={(event) => {
              const value = event.currentTarget.checked
              if (value) {
                form.setFieldValue("opdsPageSize", 50)
              } else {
                form.setFieldValue("opdsPageSize", null)
              }
            }}
            disabled={isLocked("opdsPageSize")}
          />
          {state.opdsPageSize !== null && (
            <NumberInput
              label="Page size"
              description="Number of items per page in OPDS feeds."
              min={1}
              max={500}
              {...form.getInputProps("opdsPageSize")}
              disabled={isLocked("opdsPageSize")}
            />
          )}
        </Stack>
      </Fieldset>
      <Fieldset
        legend="Email settings"
        disabled={isAnyLocked(
          "smtpHost",
          "smtpPort",
          "smtpFrom",
          "smtpUsername",
          "smtpPassword",
          "smtpSsl",
          "smtpRejectUnauthorized",
        )}
      >
        <TextInput label="SMTP host" {...form.getInputProps("smtpHost")} />
        <TextInput
          label="SMTP port"
          type="number"
          {...form.getInputProps("smtpPort")}
        />
        <TextInput label="SMTP from" {...form.getInputProps("smtpFrom")} />
        <TextInput
          label="SMTP username"
          {...form.getInputProps("smtpUsername")}
        />
        <PasswordInput
          label="SMTP password"
          {...form.getInputProps("smtpPassword")}
        />
        <Checkbox
          label="SMTP - Force TLS?"
          className="my-4"
          description={
            <>
              <p>
                <strong>Note:</strong> Disabling this option does not disable
                TLS. By default, Storyteller will use STARTTLS to negotiate a
                TLS connection. Many SMTP servers require TLS negotiation in
                order to establish the correct TLS version to use.
              </p>
              <p>
                If you have this option enabled and see an error in your logs
                about an incorrect TLS version, try disabling it.
              </p>
            </>
          }
          {...form.getInputProps("smtpSsl", { type: "checkbox" })}
        />
        <Checkbox
          label="SMTP - Reject self-signed TLS certs?"
          {...(form.getInputProps("smtpRejectUnauthorized"),
          { type: "checkbox" })}
        />
      </Fieldset>
      <Group
        justify="flex-end"
        className="sticky bottom-0 z-10 bg-white p-6 dark:bg-neutral-800"
      >
        <Button type="submit">{saved ? "Saved!" : "Update"}</Button>
      </Group>
    </form>
  )
}
