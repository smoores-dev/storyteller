import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

import { documentedServerEnvVars, internalServerEnvVars } from "./envSchema"

export const env = createEnv({
  experimental__runtimeEnv: process.env,

  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  server: {
    ...documentedServerEnvVars,
    ...internalServerEnvVars,
  },

  onValidationError: (errors) => {
    // use console.error to avoid circular dependency with logging.ts
    console.error(z.prettifyError({ issues: errors }))
    throw new Error(
      "Invalid environment variables! If you think this is a mistake, set STORYTELLER_SKIP_VALIDATION=true to bypass validation.",
    )
  },

  createFinalSchema: (schema) => {
    return z.object(schema).refine(
      (data) => {
        // don't check for secret key in development or test or while building
        if (
          data.NODE_ENV !== "production" ||
          // if any phase it's not running in production, allow it
          data.NEXT_PHASE
        ) {
          return true
        }
        return !!(
          data.STORYTELLER_SECRET_KEY || data.STORYTELLER_SECRET_KEY_FILE
        )
      },
      {
        message:
          "Either STORYTELLER_SECRET_KEY or STORYTELLER_SECRET_KEY_FILE must be set. See https://storyteller-platform.gitlab.io/storyteller/docs/installation/self-hosting/#secrets",
      },
    )
  },

  // escape hatch, will cause defaults to not be set
  skipValidation: Boolean(process.env["STORYTELLER_SKIP_VALIDATION"]),
})
