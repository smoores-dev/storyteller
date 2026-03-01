import { z } from "zod"

import { Languages } from "@storyteller-platform/ghost-story"

// Enum schemas
export const TranscriptionEngineSchema = z.enum([
  "whisper.cpp",
  "google-cloud",
  "microsoft-azure",
  "amazon-transcribe",
  "openai-cloud",
  "deepgram",
  "whisper-server",
])
export type TranscriptionEngine = z.infer<typeof TranscriptionEngineSchema>

export const WhisperModelSchema = z.enum([
  "tiny",
  "tiny-q5_1",
  "base",
  "base.en",
  "base-q5_1",
  "small",
  "small.en",
  "small-q5_1",
  "medium",
  "medium.en",
  "medium-q5_0",
  "large-v1",
  "large-v2",
  "large-v2-q5_0",
  "large-v3",
  "large-v3-q5_0",
  "large-v3-turbo",
  "large-v3-turbo-q5_0",
])
export type WhisperModel = z.infer<typeof WhisperModelSchema>

export const WhisperCpuFallbackSchema = z.enum(["blas", "cpu"]).nullable()
export type WhisperCpuFallback = z.infer<typeof WhisperCpuFallbackSchema>

export const WhisperModelOverridesSchema = z.record(
  z.enum(Languages),
  WhisperModelSchema,
)
export type WhisperModelOverrides = z.infer<typeof WhisperModelOverridesSchema>

export const ReadaloudLocationTypeSchema = z.enum([
  "SUFFIX",
  "SIBLING_FOLDER",
  "INTERNAL",
  "CUSTOM_FOLDER",
])
export type ReadaloudLocationType = z.infer<typeof ReadaloudLocationTypeSchema>

// Auth provider schemas
export const BuiltInAuthProviderSchema = z.object({
  kind: z.literal("built-in"),
  // Validated against Providers object at runtime in auth/auth.ts:createConfig()
  id: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
  issuer: z.string().optional(),
})
export type BuiltInAuthProvider = z.infer<typeof BuiltInAuthProviderSchema>

export const CustomAuthProviderSchema = z.object({
  kind: z.literal("custom"),
  name: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
  type: z.enum(["oidc", "oauth"]),
  issuer: z.string(),
  allowRegistration: z.boolean().optional(),
  groupPermissions: z.record(z.string(), z.array(z.string())).optional(),
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
  importPath: z.string().nullable(),
  // Audio settings
  codec: z.string().nullable(),
  bitrate: z.string().nullable(),
  maxTrackLength: z.number().nullable(),
  // Transcription settings
  transcriptionEngine: TranscriptionEngineSchema.nullable(),
  whisperModel: WhisperModelSchema.nullable(),
  whisperThreads: z.number(),
  whisperModelOverrides: WhisperModelOverridesSchema,
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
})
export type Settings = z.infer<typeof SettingsSchema>
