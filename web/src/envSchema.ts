import { z } from "zod"

export const audioCodecRegex = /^(mp3|aac|opus)(?:-(16|24|32|64|96))?$/

// in descriptions, you can override the default value shown in docs using pipe syntax:
// .describe("description text | custom default value")
// everything after the pipe will be used as the default in the generated docs table

export const documentedServerEnvVars = {
  AUTH_URL: z
    .url()
    .optional()
    .describe(
      "[Required for OAuth](https://storyteller-platform.gitlab.io/storyteller/docs/settings#setting-the-auth_url-environment-variable)",
    ),
  ENABLE_WEB_READER: z.coerce
    .boolean()
    .optional()
    .describe(
      "[Enable the experimental web reader by setting to `true`.](https://storyteller-platform.gitlab.io/storyteller/docs/reading/web-reader) | `false`",
    ),
  READIUM_PORT: z.coerce
    .number()
    .default(8002)
    .describe("Port for the Readium server."),
  STORYTELLER_DATA_DIR: z
    .string()
    .default(() => process.cwd())
    .describe(
      "Directory where Storyteller will store its data. | Current Directory (`/data` in container)",
    ),
  STORYTELLER_DB_DIR: z
    .string()
    .optional()
    .describe(
      "Directory where Storyteller will store its database files. | `STORYTELLER_DATA_DIR`",
    ),
  STORYTELLER_DB_FILENAME: z
    .string()
    .default("storyteller.db")
    .describe("Filename for the Storyteller database."),
  STORYTELLER_INITIAL_AUDIO_CODEC: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return null

      const match = val.match(audioCodecRegex)
      if (!match?.[1]) return null
      return {
        codec: match[1] as "mp3" | "aac" | "opus",
        bitrate: match[2] && `${match[2]}k`,
      }
    })
    .describe(
      "Initial audio codec to use. Options are `mp3`, `aac`, `opus`, `opus-16`, `opus-24`, `opus-32`, `opus-64`, `opus-96`.",
    ),
  STORYTELLER_LOG_LEVEL: z
    .enum(["error", "warn", "info", "debug", "trace"])
    .default("info")
    .describe(
      "Log level for Storyteller. Options are `error`, `warn`, `info`, `debug`, `trace`.",
    ),
  STORYTELLER_WHISPER_REPO: z
    .url()
    .default("https://github.com/ggerganov/whisper.cpp")
    .describe("Repo to download whisper.cpp from."),
  STORYTELLER_WHISPER_VERSION: z
    .string()
    .default("v1.8.2")
    .describe("Version of whisper.cpp to download."),
  STORYTELLER_DEMO_MODE: z.coerce
    .boolean()
    .optional()
    .describe(
      "Enable demo mode by setting to `true`. (Used for [demo-storyteller.elfhosted.com](https://demo-storyteller.elfhosted.com)) | `false`",
    ),
  STORYTELLER_MAX_UPLOAD_CHUNK_SIZE: z.coerce
    .number()
    .optional()
    .describe("Upload chunk size limit in megabytes. | `10` (10 MB)"),
  STORYTELLER_SECRET_KEY: z
    .string()
    .optional()
    .describe(
      "The secret key for the instance. Either this or STORYTELLER_SECRET_KEY_FILE must be set.",
    ),
  STORYTELLER_SECRET_KEY_FILE: z
    .string()
    .optional()
    .describe(
      "Path to a file containing the secret key for the instance. Either this or STORYTELLER_SECRET_KEY must be set.",
    ),
} as const

export const internalServerEnvVars = {
  NEXT_RUNTIME: z
    .enum(["nodejs", "edge"])
    .optional()
    .describe("The runtime environment for the Storyteller instance."),
  NEXT_PHASE: z.string().optional().describe("The phase of the Next.js build."),
  DEV_CONTAINER: z.coerce
    .boolean()
    .optional()
    .describe("Whether the container is running in a development environment."),
  STORYTELLER_ROOT_PATH: z
    .string()
    .default(() => process.cwd())
    .describe("The root path of the Storyteller instance."),
  STORYTELLER_WORKER: z
    .string()
    .default("worker.cjs")
    .describe("The worker to use for the Storyteller instance."),
  STORYTELLER_FILE_WRITE_WORKER: z
    .string()
    .default("fileWriteWorker.cjs")
    .describe("The file write worker to use for the Storyteller instance."),
  SQLITE_NATIVE_BINDING: z
    .string()
    .optional()
    .describe("The path to the SQLite native binding."),
  CI_COMMIT_TAG: z
    .string()
    .optional()
    .describe("The Git commit tag of the Storyteller instance."),
  ENABLE_REACT_SCAN: z.coerce
    .boolean()
    .optional()
    .describe("Whether to enable React Scan for development."),
} as const
