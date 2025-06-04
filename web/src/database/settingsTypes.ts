import { Providers } from "@/auth/providers"

export type TranscriptionEngine =
  | "whisper.cpp"
  | "google-cloud"
  | "microsoft-azure"
  | "amazon-transcribe"
  | "openai-cloud"
  | "deepgram"

export type WhisperBuild = "cpu" | "cublas-11.8" | "cublas-12.6" | "hipblas"

export type WhisperModel =
  | "tiny"
  | "tiny-q5_1"
  | "base"
  | "base-q5_1"
  | "small"
  | "small-q5_1"
  | "medium"
  | "medium-q5_0"
  | "large-v1"
  | "large-v2"
  | "large-v2-q5_0"
  | "large-v3"
  | "large-v3-q5_0"
  | "large-v3-turbo"
  | "large-v3-turbo-q5_0"

interface BuiltInAuthProvider {
  kind: "built-in"
  id: keyof typeof Providers
  clientId: string
  clientSecret: string
  issuer?: string
}

interface CustomAuthProvider {
  kind: "custom"
  name: string
  clientId: string
  clientSecret: string
  type: "oidc" | "oauth"
  issuer: string
}

export type AuthProvider = BuiltInAuthProvider | CustomAuthProvider

export type Settings = {
  smtpHost: string
  smtpPort: number
  smtpUsername: string
  smtpPassword: string
  smtpFrom: string
  libraryName: string
  webUrl: string
  smtpSsl: boolean | null
  smtpRejectUnauthorized: boolean | null
  codec: string | null
  bitrate: string | null
  transcriptionEngine: TranscriptionEngine | null
  whisperBuild: WhisperBuild | null
  whisperModel: WhisperModel | null
  googleCloudApiKey: string | null
  azureSubscriptionKey: string | null
  azureServiceRegion: string | null
  amazonTranscribeRegion: string | null
  amazonTranscribeAccessKeyId: string | null
  amazonTranscribeSecretAccessKey: string | null
  openAiApiKey: string | null
  openAiOrganization: string | null
  openAiBaseUrl: string | null
  openAiModelName: string | null
  maxTrackLength: number | null
  deepgramApiKey: string | null
  deepgramModel: string | null
  parallelTranscodes: number
  parallelTranscribes: number
  parallelWhisperBuild: number
  authProviders: AuthProvider[]
}

export const SETTINGS_ROW_NAMES = {
  smtp_host: "smtpHost",
  smtp_port: "smtpPort",
  smtp_username: "smtpUsername",
  smtp_password: "smtpPassword",
  smtp_from: "smtpFrom",
  smtp_ssl: "smtpSsl",
  smtp_reject_unauthorized: "smtpRejectUnauthorized",
  library_name: "libraryName",
  web_url: "webUrl",
  max_track_length: "maxTrackLength",
  codec: "codec",
  bitrate: "bitrate",
  transcription_engine: "transcriptionEngine",
  whisper_build: "whisperBuild",
  whisper_model: "whisperModel",
  google_cloud_api_key: "googleCloudApiKey",
  azure_subscription_key: "azureSubscriptionKey",
  azure_service_region: "azureServiceRegion",
  amazon_transcribe_region: "amazonTranscribeRegion",
  amazon_transcribe_access_key_id: "amazonTranscribeAccessKeyId",
  amazon_transcribe_secret_access_key: "amazonTranscribeSecretAccessKey",
  open_ai_api_key: "openAiApiKey",
  open_ai_organization: "openAiOrganization",
  open_ai_base_url: "openAiBaseUrl",
  open_ai_model_name: "openAiModelName",
  deepgram_api_key: "deepgramApiKey",
  deepgram_model: "deepgramModel",
  parallel_transcodes: "parallelTranscodes",
  parallel_transcribes: "parallelTranscribes",
  parallel_whisper_build: "parallelWhisperBuild",
  auth_providers: "authProviders",
} as const satisfies Record<string, keyof Settings>
