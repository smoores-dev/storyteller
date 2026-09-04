import { z } from "zod"

import {
  ALIGNERS,
  LANGUAGES,
  RECOGNITION_ENGINES,
  WAV2VEC2_DEVICES,
  WAV2VEC_ENGINES,
  WHISPER_MODELS,
} from "@storyteller-platform/ghost-story/constants"

import { Providers } from "@/auth/providers"
import {
  normalizeRulePath,
  validateWatchRulePath,
  watchRuleValidationMessage,
} from "@/database/importRules.validation"
import { PreferenceDefaultsSchema } from "@/database/userPreferencesTypes"
import { type UUID } from "@/uuid"

export const TranscriptionEngineSchema = z.enum(RECOGNITION_ENGINES)

export const AlignerSchema = z.enum(ALIGNERS)
export type Aligner = z.infer<typeof AlignerSchema>

export const Wav2VecEngineSchema = z.enum(WAV2VEC_ENGINES)
export type Wav2VecEngine = z.infer<typeof Wav2VecEngineSchema>

export const Wav2Vec2DeviceSchema = z.enum(WAV2VEC2_DEVICES)
export type Wav2Vec2Device = z.infer<typeof Wav2Vec2DeviceSchema>

export const WhisperModelSchema = z.enum(WHISPER_MODELS)
export type WhisperModel = z.infer<typeof WhisperModelSchema>

export const WhisperCpuFallbackSchema = z.enum(["blas", "cpu"]).nullable()

export const WhisperModelOverridesSchema = z.record(
  z.enum(LANGUAGES),
  WhisperModelSchema,
)

export const METADATA_FIELDS = [
  "cover",
  "title",
  "subtitle",
  "description",
  "language",
  "publicationDate",
  "authors",
  "narrators",
  "creators",
  "series",
  "tags",
  "identifiers",
] as const

export type MetadataField = (typeof METADATA_FIELDS)[number]

export const MetadataFieldModeSchema = z.enum(["skip", "merge", "always"])
export type MetadataFieldMode = z.infer<typeof MetadataFieldModeSchema>

export const MetadataFieldOverridesSchema = z.object(
  Object.fromEntries(
    METADATA_FIELDS.map((field) => [
      field,
      MetadataFieldModeSchema.default("merge"),
    ]),
  ) as { [K in MetadataField]: z.ZodDefault<typeof MetadataFieldModeSchema> },
)
export type MetadataFieldOverrides = z.infer<
  typeof MetadataFieldOverridesSchema
>

export function defaultMetadataFieldOverrides(
  mode: MetadataFieldMode = "merge",
): MetadataFieldOverrides {
  return Object.fromEntries(
    METADATA_FIELDS.map((field) => [field, mode]),
  ) as MetadataFieldOverrides
}

export const READALOUD_LOCATION_TYPES = [
  "SUFFIX",
  "SIBLING_FOLDER",
  "INTERNAL",
  "CUSTOM_FOLDER",
] as const

export type ReadaloudLocationType = (typeof READALOUD_LOCATION_TYPES)[number]

export const ReadaloudLocationTypeSchema = z.enum(READALOUD_LOCATION_TYPES)

export const EPUB2_IMPORT_STRATEGIES = [
  "backup-and-convert",
  "convert-alongside",
  "replace",
  "skip",
] as const
export type Epub2ImportStrategy = (typeof EPUB2_IMPORT_STRATEGIES)[number]

export const Epub2ImportStrategySchema = z.enum(EPUB2_IMPORT_STRATEGIES)

export const EPUB_VERSION_PLACEHOLDER = "{version}"

export const DEFAULT_EPUB_SUFFIX_TEMPLATE = `_epub${EPUB_VERSION_PLACEHOLDER}`

/** suffix used before the template existed, for values that don't have one */
const LEGACY_EPUB3_SUFFIX = "_epub3"

export function renderEpubSuffix(template: string, version: 2 | 3): string {
  if (template.includes(EPUB_VERSION_PLACEHOLDER)) {
    return template.replaceAll(EPUB_VERSION_PLACEHOLDER, String(version))
  }
  return version === 2 ? template : LEGACY_EPUB3_SUFFIX
}

// which epub edition a book exposes in the OPDS feed. read-aloud epubs carry
// media overlays and are large, so low-powered clients (kindle, kobo) often
// want the plain ebook instead. an audiobook is always served when available.
export const OpdsFormatSchema = z.enum([
  // read-aloud if present, else the plain ebook. the default.
  "readaloud",
  // plain ebook if present, else read-aloud.
  "ebook",
  // both the read-aloud and the plain ebook.
  "both",
])
export type OpdsFormat = z.infer<typeof OpdsFormatSchema>

const optionalUrlSchema = z.union([z.literal(""), z.url()]).optional()

export const ImportModeSchema = z.enum([
  "reference",
  "copy",
  "move",
  "hardlink",
])
export type ImportMode = z.infer<typeof ImportModeSchema>

/** @deprecated use import rules instead */
export type ImportPathEntry = {
  path: string
  importMode?: ImportMode | null
}

// Auth provider schemas
export const BuiltInAuthProviderSchema = z.object({
  kind: z.literal("built-in"),
  // Validated against Providers object at runtime in auth/auth.ts:createConfig()
  id: z.enum(Object.keys(Providers) as (keyof typeof Providers)[]),
  clientId: z.string(),
  clientSecret: z.string(),
  issuer: optionalUrlSchema,
})

export const CustomAuthProviderSchema = z.object({
  kind: z.literal("custom"),
  name: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
  type: z.enum(["oidc", "oauth"]),
  issuer: z.url(),
  allowRegistration: z.boolean().optional(),
  groupPermissions: z.record(z.string(), z.array(z.string())).nullish(),
})

export type CustomAuthProvider = z.infer<typeof CustomAuthProviderSchema>

export const AuthProviderSchema = z.discriminatedUnion("kind", [
  BuiltInAuthProviderSchema,
  CustomAuthProviderSchema,
])
export type AuthProvider = z.infer<typeof AuthProviderSchema>

export const ImportRuleSchema = z.object({
  kind: z.enum(["watch", "ignore"]),
  path: z.string(),
  importMode: ImportModeSchema.nullish(),
  epub2ImportStrategy: Epub2ImportStrategySchema.nullish(),
})

export type ImportRule = z.infer<typeof ImportRuleSchema>

export const ImportRuleInputSchema = z.object({
  uuid: z.string().optional(),
  kind: z.enum(["watch", "ignore"]),
  path: z.string().min(1, "Pick a folder"),
  importMode: ImportModeSchema.nullish(),
  epub2ImportStrategy: Epub2ImportStrategySchema.nullish(),
  collectionUuids: z.array(z.string()).optional(),
  source: z.string().optional(),
})

export type ImportRuleInput = z.infer<typeof ImportRuleInputSchema>

export type ImportRuleIssue = { index: number; message: string }

export function importRuleIssues(
  rules: Pick<ImportRuleInput, "uuid" | "kind" | "path" | "source">[],
  forbiddenRoots: string[] = [],
): ImportRuleIssue[] {
  const keyed = rules.map((rule, index) => ({
    uuid: (rule.uuid ?? `at-${index}`) as UUID,
    kind: rule.kind,
    path: rule.path,
  }))

  const issues: ImportRuleIssue[] = []
  const seen = new Map<string, number>()

  keyed.forEach((rule, index) => {
    if (!rule.path) return

    const normalized = normalizeRulePath(rule.path)
    const firstIndex = seen.get(normalized)

    if (firstIndex === undefined) {
      seen.set(normalized, index)
    }

    if (rules[index]?.source === "config") return

    if (firstIndex !== undefined) {
      issues.push({
        index,
        message: `A rule already exists for ${keyed[firstIndex]?.path ?? normalized}.`,
      })
      return
    }

    if (rule.kind !== "watch") return

    const result = validateWatchRulePath({
      path: rule.path,
      existingRules: keyed.filter((_, other) => other !== index),
      forbiddenRoots,
    })

    if (result.ok) return

    const conflictingPath = keyed.find(
      (other) => other.uuid === result.conflictWith,
    )?.path

    issues.push({
      index,
      message: watchRuleValidationMessage(
        result,
        conflictingPath ? { conflictingPath } : undefined,
      ),
    })
  })

  return issues
}

export const ImportRulesSchema = z
  .array(ImportRuleInputSchema)
  .superRefine((rules, ctx) => {
    for (const issue of importRuleIssues(rules)) {
      ctx.addIssue({
        code: "custom",
        path: [issue.index, "path"],
        message: issue.message,
      })
    }
  })

export const ENCRYPTED_SETTING_KEYS = [
  "smtpPassword",
  "whisperServerApiKey",
  "googleCloudApiKey",
  "azureSubscriptionKey",
  "amazonTranscribeAccessKeyId",
  "amazonTranscribeSecretAccessKey",
  "openAiApiKey",
  "deepgramApiKey",
  // "ctcServerApiKey",
] as const

export const ALIGNMENT_GRANULARITY_OPTIONS = ["word", "sentence"] as const
export type AlignmentGranularity =
  (typeof ALIGNMENT_GRANULARITY_OPTIONS)[number]

export type EncryptedSettingKey = (typeof ENCRYPTED_SETTING_KEYS)[number]

export function isEncryptedSettingKey(
  name: string,
): name is EncryptedSettingKey {
  return (ENCRYPTED_SETTING_KEYS as readonly string[]).includes(name)
}

// Main settings schema
export const SettingsSchema = z.object({
  // SMTP settings
  smtpHost: z.string(),
  smtpPort: z.number(),
  smtpUsername: z.string(),
  smtpPassword: z.string(),
  smtpFrom: z.string(),
  smtpSsl: z.boolean().nullable(),
  smtpRejectUnauthorized: z.boolean().nullable(),
  // Library settings
  libraryName: z.string(),
  webUrl: z.string(),
  serverIconSha256: z.string().nullable().optional(),
  importMode: ImportModeSchema,
  // Audio settings
  codec: z.string().nullable(),
  bitrate: z.string().nullable(),
  maxTrackLength: z.coerce.number().nullable(),
  aligner: AlignerSchema.nullable(),
  alignmentGranularity: z
    .enum(ALIGNMENT_GRANULARITY_OPTIONS)
    .nullable()
    .default("sentence"),
  ctcEngine: Wav2VecEngineSchema.nullable(),
  ctcDevice: Wav2Vec2DeviceSchema.nullable(),
  // ctcServerUrl: z.string().nullable(),
  // ctcServerApiKey: z.string().nullable(),
  // Transcription settings
  transcriptionEngine: TranscriptionEngineSchema.nullable(),
  whisperModel: WhisperModelSchema.nullable(),
  whisperThreads: z.number(),
  // whisperModelOverrides: WhisperModelOverridesSchema,
  autoDetectLanguage: z.boolean(),
  whisperCpuFallback: WhisperCpuFallbackSchema,
  whisperServerUrl: z.string().nullable(),
  whisperServerApiKey: z.string().nullable(),
  googleCloudApiKey: z.string().nullable(),
  azureSubscriptionKey: z.string().nullable(),
  azureServiceRegion: z.string().nullable(),
  amazonTranscribeRegion: z.string().nullable(),
  amazonTranscribeAccessKeyId: z.string().nullable(),
  amazonTranscribeSecretAccessKey: z.string().nullable(),
  amazonTranscribeBucketName: z.string().nullable(),
  openAiApiKey: z.string().nullable(),
  openAiOrganization: z.string().nullable(),
  openAiBaseUrl: z.string().nullable(),
  openAiModelName: z.string().nullable(),
  deepgramApiKey: z.string().nullable(),
  deepgramModel: z.string().nullable(),
  // Parallelization settings
  parallelTranscodes: z.number(),
  parallelTranscribes: z.number(),
  // Auth settings
  authProviders: z.array(AuthProviderSchema),
  disablePasswordLogin: z.boolean(),
  // Readaloud settings
  readaloudLocationType: ReadaloudLocationTypeSchema,
  readaloudLocation: z.string(),
  // Upload settings
  maxUploadChunkSize: z.number().nullable(),
  // OPDS settings
  opdsEnabled: z.boolean().nullable(),
  opdsPageSize: z.number().nullable(),
  opdsFormat: OpdsFormatSchema.nullable(),
  // Scanning settings
  scanCronExpression: z.string().nullable(),
  backupCronExpression: z.string().nullable().optional(),
  backupRetentionCount: z.number().nullable().optional(),
  dataDirAnchor: z.string().nullable().optional(),
  metadataFieldOverrides: MetadataFieldOverridesSchema,
  // EPUB 2 import settings
  epub2ImportStrategy: Epub2ImportStrategySchema,
  epub2BackupSuffix: z.string(),
  // Import rules (user-managed, editable)
  importRules: ImportRulesSchema.optional(),
  // Auto-ignore rules (system-generated, read-only display)
  autoIgnoreRules: z
    .array(
      z.object({
        uuid: z.string(),
        path: z.string(),
        source: z.string(),
        bookTitle: z.string().nullable().optional(),
      }),
    )
    .optional(),
  // UUIDs of auto-ignore rules to delete on save
  deleteRuleUuids: z.array(z.string()).optional(),
  // Cache cleanup
  cleanCacheAfterReadaloud: z.boolean(),
  preferenceDefaults: PreferenceDefaultsSchema.optional(),
})
export type Settings = z.infer<typeof SettingsSchema>

// settings-only schema for config file validation;
// importRules / importPath are extracted before this runs
export const ConfigFileSchema = SettingsSchema.partial()
