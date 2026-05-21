import { z } from "zod"

import {
  LANGUAGES,
  RECOGNITION_ENGINES,
  type RecognitionEngine,
  WHISPER_MODELS,
} from "@storyteller-platform/ghost-story/constants"

import { Providers } from "@/auth/providers"

export const TranscriptionEngineSchema = z.enum(RECOGNITION_ENGINES)
export type TranscriptionEngine = RecognitionEngine

export const WhisperModelSchema = z.enum(WHISPER_MODELS)
export type WhisperModel = z.infer<typeof WhisperModelSchema>

export const WhisperCpuFallbackSchema = z.enum(["blas", "cpu"]).nullable()
export type WhisperCpuFallback = z.infer<typeof WhisperCpuFallbackSchema>

export const WhisperModelOverridesSchema = z.record(
  z.enum(LANGUAGES),
  WhisperModelSchema,
)
export type WhisperModelOverrides = z.infer<typeof WhisperModelOverridesSchema>

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
] as const

export type MetadataField = (typeof METADATA_FIELDS)[number]

export const MetadataFieldModeSchema = z.enum(["skip", "merge", "always"])
export type MetadataFieldMode = z.infer<typeof MetadataFieldModeSchema>

export const MetadataFieldOverridesSchema = z.object(
  Object.fromEntries(
    METADATA_FIELDS.map((field) => [field, MetadataFieldModeSchema]),
  ) as { [K in MetadataField]: typeof MetadataFieldModeSchema },
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

export const ReadaloudLocationTypeSchema = z.enum([
  "SUFFIX",
  "SIBLING_FOLDER",
  "INTERNAL",
  "CUSTOM_FOLDER",
])
export type ReadaloudLocationType = z.infer<typeof ReadaloudLocationTypeSchema>

export const Epub2ImportStrategySchema = z.enum([
  "backup-and-convert",
  "replace",
  "skip",
])
export type Epub2ImportStrategy = z.infer<typeof Epub2ImportStrategySchema>

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
export type BuiltInAuthProvider = z.infer<typeof BuiltInAuthProviderSchema>

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
  importMode: ImportModeSchema,
  // Audio settings
  codec: z.string().nullable(),
  bitrate: z.string().nullable(),
  maxTrackLength: z.number().nullable(),
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
  // Scanning settings
  scanCronExpression: z.string().nullable(),
  metadataFieldOverrides: MetadataFieldOverridesSchema,
  // EPUB 2 import settings
  epub2ImportStrategy: Epub2ImportStrategySchema,
  epub2BackupSuffix: z.string(),
})
export type Settings = z.infer<typeof SettingsSchema>

// Partial schema for config file: _file references are resolved
// at runtime before validation (see resolveFileReferences)
export const ConfigFileSchema = SettingsSchema.partial()
export type ConfigFile = z.infer<typeof ConfigFileSchema>
