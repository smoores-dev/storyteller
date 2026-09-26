"use client"

import { useState } from "react"
import { useWatch } from "react-hook-form"

import { Field, FieldLabel } from "@v3/_/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { useTranslation } from "@v3/_/hooks/use-translation"

import {
  METADATA_FIELDS,
  type MetadataField,
  type MetadataFieldMode,
  type MetadataFieldOverrides,
  MetadataFieldOverridesSchema,
  defaultMetadataFieldOverrides,
} from "@/database/settingsTypes"
import { statusDisplayLabel } from "@/database/statusKinds"
import {
  useListStatusesQuery,
  useSetLibraryDefaultStatusMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

import { useSettingsForm } from "./SettingsFormProvider"
import { SettingsCard, SettingsSection } from "./shared"

export function ReadBehaviorSection() {
  const t = useTranslation("SettingsPage.tabs.metadata.sections.readBehavior")
  const { form } = useSettingsForm()
  const overrides = useWatch({
    control: form.control,
    name: "metadataFieldOverrides",
  })

  return (
    <SettingsSection id="readBehavior">
      <SettingsCard
        title={t("title")}
        description={t("description")}
        tip={t("tip")}
      >
        <MetadataFieldOverridesEditor
          value={overrides}
          onChange={(updated) => {
            form.setValue("metadataFieldOverrides", updated, {
              shouldDirty: true,
            })
          }}
        />
      </SettingsCard>
    </SettingsSection>
  )
}

const NONE_STATUS = "__none__"

export function DefaultStatusSection() {
  const t = useTranslation("SettingsPage.tabs.metadata.sections.defaultStatus")
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
    <SettingsSection id="defaultStatus">
      <SettingsCard title={t("title")}>
        <Field>
          <FieldLabel>{t("label")}</FieldLabel>

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
      </SettingsCard>
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

function MetadataFieldOverridesEditor({
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
