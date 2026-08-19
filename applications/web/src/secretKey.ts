import { readFile } from "node:fs/promises"

import { env } from "@/env"

const JWT_SECRET_KEY_FILE = env.STORYTELLER_SECRET_KEY_FILE
const DEFAULT_SECRET_KEY_FILE = "/run/secrets/secret_key"

/**
 * There was a period of time where Storyteller's example
 * compose.yaml file incorrectly set the STORYTELLER_SECRET_KEY
 * environment variable to the string `/run/secrets/secret_key`,
 * rather than the contents of that file.
 *
 * To mitigate this security risk even for users that don't
 * update their configuration, if that's the value of the env
 * variable, we read the value from the file instead.
 */
export async function readSecretKey() {
  if (JWT_SECRET_KEY_FILE) {
    return await readFile(JWT_SECRET_KEY_FILE, { encoding: "utf-8" })
  }
  if (env.STORYTELLER_SECRET_KEY === DEFAULT_SECRET_KEY_FILE) {
    return await readFile(DEFAULT_SECRET_KEY_FILE, { encoding: "utf-8" })
  }
  // this is mostly a type check
  if (!env.STORYTELLER_SECRET_KEY) {
    throw new Error("STORYTELLER_SECRET_KEY is not set")
  }

  return env.STORYTELLER_SECRET_KEY
}
