import { type Providers } from "@/auth/providers"

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
  importPath: string | null
  readaloudLocationType:
    | "SUFFIX"
    | "SIBLING_FOLDER"
    | "INTERNAL"
    | "CUSTOM_FOLDER"
  readaloudLocation: string
}
