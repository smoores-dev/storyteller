import { Feed } from "../model/Feed.ts"
import { AuthDocument } from "../model/auth/AuthDocument.ts"
import { type OPDSError, toOPDSError } from "../result.ts"
import {
  type StandaloneValidator,
  validateAuth as validateAuthFn,
  validateFeed as validateFeedFn,
} from "../schemas/ajv/standalone.cjs"

const run =
  (fn: StandaloneValidator) =>
  (json: unknown): OPDSError[] | null => {
    if (fn(json)) return null
    return (fn.errors ?? []).map(toOPDSError)
  }

/** validates an OPDS2 feed, returning located errors or null when valid */
export const validateFeed = run(validateFeedFn)

/** validates an OPDS authentication document */
export const validateAuth = run(validateAuthFn)

/** parses a feed with full schema validation */
export const parseFeed = (json: unknown) =>
  Feed.deserialize(json, { validate: validateFeed })

/** parses an authentication document with full schema validation */
export const parseAuthDocument = (json: unknown) =>
  AuthDocument.deserialize(json, { validate: validateAuth })

// the live AJV validators (which bundle ajv, frontend-friendly) are exposed
// separately at `@storyteller/opds/validate/ajv`
// keeping them out of this entry lets `./validate` ship the self-contained standalone validators
