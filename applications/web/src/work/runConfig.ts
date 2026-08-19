import { z } from "zod"

import { type Settings } from "@/apiModels"
import { SettingsSchema } from "@/database/settingsTypes"

export const RUN_CONFIG_SETTING_KEYS = [
  // split tracks
  "maxTrackLength",
  "codec",
  "bitrate",
  "parallelTranscodes",
  // transcription
  "transcriptionEngine",
  "whisperModel",
  "whisperThreads",
  "whisperCpuFallback",
  "parallelTranscribes",
  "whisperServerUrl",
  "whisperServerApiKey",
  "googleCloudApiKey",
  "azureSubscriptionKey",
  "azureServiceRegion",
  "amazonTranscribeRegion",
  "amazonTranscribeAccessKeyId",
  "amazonTranscribeSecretAccessKey",
  "amazonTranscribeBucketName",
  "openAiApiKey",
  "openAiOrganization",
  "openAiBaseUrl",
  "openAiModelName",
  "deepgramApiKey",
  "deepgramModel",
] as const

export const RunConfigSchema = SettingsSchema.pick(
  Object.fromEntries(RUN_CONFIG_SETTING_KEYS.map((k) => [k, true])) as {
    [K in (typeof RUN_CONFIG_SETTING_KEYS)[number]]: true
  },
).extend({
  language: z.string().nullable(),
})

export type RunConfig = z.infer<typeof RunConfigSchema>

export type RunConfigSummary = Pick<
  RunConfig,
  | "transcriptionEngine"
  | "whisperModel"
  | "language"
  | "codec"
  | "bitrate"
  | "maxTrackLength"
>

export function summarizeRunConfig(
  config: RunConfig | null,
): RunConfigSummary | null {
  if (!config) return null
  return {
    transcriptionEngine: config.transcriptionEngine,
    whisperModel: config.whisperModel,
    language: config.language,
    codec: config.codec,
    bitrate: config.bitrate,
    maxTrackLength: config.maxTrackLength,
  }
}

export function buildRunConfig(
  settings: Settings,
  bookLanguage: string | null,
  overrides: Partial<RunConfig> = {},
): RunConfig {
  const base: Record<string, unknown> = { language: bookLanguage }
  for (const key of RUN_CONFIG_SETTING_KEYS) {
    base[key] = settings[key]
  }
  return RunConfigSchema.parse({ ...base, ...overrides })
}
