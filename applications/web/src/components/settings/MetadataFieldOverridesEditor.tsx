import { Anchor, Box, Group, NativeSelect, Stack, Text } from "@mantine/core"
import { useState } from "react"

import {
  METADATA_FIELDS,
  type MetadataField,
  type MetadataFieldMode,
  type MetadataFieldOverrides,
  defaultMetadataFieldOverrides,
} from "@/database/settingsTypes"

const FIELD_LABELS: Record<MetadataField, string> = {
  cover: "Cover",
  title: "Title",
  subtitle: "Subtitle",
  description: "Description",
  language: "Language",
  publicationDate: "Publication date",
  authors: "Authors",
  narrators: "Narrators",
  creators: "Other creators",
  series: "Series",
  tags: "Tags",
  identifiers: "Identifiers",
}

const MODE_OPTIONS: { value: MetadataFieldMode; label: string }[] = [
  { value: "skip", label: "Skip" },
  { value: "merge", label: "Merge" },
  { value: "always", label: "Override" },
]

function getUniformMode(
  overrides: MetadataFieldOverrides,
): MetadataFieldMode | "custom" {
  const first = overrides[METADATA_FIELDS[0]]
  const allSame = METADATA_FIELDS.every((f) => overrides[f] === first)

  return allSame ? first : "custom"
}

export function MetadataFieldOverridesEditor({
  value: storedValue,
  onChange,
  title = "Metadata read behavior",
  description,
}: {
  value: MetadataFieldOverrides
  onChange: (overrides: MetadataFieldOverrides) => void
  title?: string
  description?: string
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const value = { ...defaultMetadataFieldOverrides("merge"), ...storedValue }
  const uniformMode = getUniformMode(value)

  return (
    <Box>
      <Text fw={500} size="sm" mb={4}>
        {title}
      </Text>
      {description && (
        <Text size="xs" c="dimmed" mb="sm">
          {description}
        </Text>
      )}

      <NativeSelect
        size="sm"
        value={uniformMode}
        onChange={(event) => {
          const mode = event.currentTarget.value
          if (mode === "custom") return

          onChange(defaultMetadataFieldOverrides(mode as MetadataFieldMode))
        }}
        style={{ maxWidth: 240 }}
      >
        {MODE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        {uniformMode === "custom" && (
          <option value="custom" disabled>
            Custom
          </option>
        )}
      </NativeSelect>

      {showAdvanced ? (
        <>
          <Stack gap="xs" mt="sm">
            {METADATA_FIELDS.map((field) => (
              <Group key={field} justify="space-between" wrap="nowrap">
                <Text size="sm">{FIELD_LABELS[field]}</Text>
                <NativeSelect
                  size="xs"
                  value={value[field]}
                  onChange={(event) => {
                    onChange({
                      ...value,
                      [field]: event.currentTarget.value as MetadataFieldMode,
                    })
                  }}
                  style={{ width: 160 }}
                >
                  {MODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </NativeSelect>
              </Group>
            ))}
          </Stack>

          <Anchor
            component="button"
            type="button"
            size="xs"
            mt="xs"
            onClick={() => {
              setShowAdvanced(false)
            }}
          >
            Use a single setting for all fields
          </Anchor>
        </>
      ) : (
        <Anchor
          component="button"
          type="button"
          size="xs"
          mt="xs"
          onClick={() => {
            setShowAdvanced(true)
          }}
        >
          Show per-field settings
        </Anchor>
      )}
    </Box>
  )
}
