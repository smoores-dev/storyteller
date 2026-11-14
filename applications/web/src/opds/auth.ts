import { format } from "date-fns"

import { MediaType } from "@storyteller-platform/media-types"
import { OPDS_AUTHENTICATION_JSON } from "@storyteller-platform/opds"

import { READING_SCOPE, createApiToken } from "@/database/apiTokens"
import { getSettings } from "@/database/settings"
import { describeUserAgent } from "@/userAgent"
import { type UUID } from "@/uuid"

const OPDS_TOKEN_IDLE_DAYS = 365
export function opdsTokenName(userAgent: string | null, now = new Date()) {
  const client = describeUserAgent(userAgent)
  const date = format(now, "yyyy-MM-dd")
  return client
    ? `OPDS sign-in from ${client}, ${date}`
    : `OPDS sign-in, ${date}`
}

export function createOPDSToken(userId: UUID, userAgent: string | null) {
  return createApiToken(userId, opdsTokenName(userAgent), READING_SCOPE, {
    idleTimeoutDays: OPDS_TOKEN_IDLE_DAYS,
  })
}

export interface OPDSAuthenticationDocument {
  id: string
  title: string
  description?: string
  links?: Array<{
    rel: string
    href: string
    type?: string
    title?: string
    width?: number
    height?: number
  }>
  authentication: Array<{
    type: string
    labels?:
      | {
          login?: string
          password?: string
        }
      | {
          authenticate?: string
        }
    links?: Array<{
      rel: string
      href: string
      type?: string
    }>
  }>
}

export async function createOPDSAuthenticationDocument(): Promise<OPDSAuthenticationDocument> {
  const settings = await getSettings()
  const libraryName = settings.libraryName || "Storyteller"

  const authDocument: OPDSAuthenticationDocument = {
    id: `/opds/auth/auth.json`,
    title: libraryName,
    description:
      "Sign in with your email or username, and your password or an API token from your preferences.",
    links: [
      settings.serverIconSha256
        ? {
            rel: "logo",
            href: `/api/v2/server/icon?s=512`,
            type: MediaType.WEBP.mime,
          }
        : {
            rel: "logo",
            href: `/Storyteller_Logo.png`,
            type: MediaType.PNG.mime,
          },
    ],
    authentication: [
      // {
      //   type: "http://opds-spec.org/auth/oauth/password",
      //   labels: {
      //     login: "Email or Username",
      //     password: "Password",
      //   },
      //   links: [
      //     {
      //       rel: "authenticate",
      //       href: `/opds/auth/token`,
      //       type: "application/json",
      //     },
      //   ],
      // },
      {
        type: "http://opds-spec.org/auth/oauth/implicit",
        links: [
          {
            rel: "authenticate",
            href: `/opds/authorize`,
            type: MediaType.HTML.mime,
          },
        ],
      },
      // {
      //   type: "http://opds-spec.org/auth/basic",
      //   labels: {
      //     login: "Email or Username",
      //     password: "Password",
      //   },
      // },
    ],
  }

  return authDocument
}

export function createOPDSAuthResponse(
  authDocument: OPDSAuthenticationDocument,
) {
  return new Response(JSON.stringify(authDocument, null, 2), {
    status: 401,
    headers: {
      "Content-Type": OPDS_AUTHENTICATION_JSON,
      // many clients will not check for auth if Basic Auth is not supported
      "WWW-Authenticate": 'Basic realm="Storyteller"',
      Link: `<${authDocument.id}>; rel="http://opds-spec.org/auth/document"; type="${OPDS_AUTHENTICATION_JSON}"`,
    },
  })
}

export const OPDS_AUTH_OPTIONS = {
  allowBasicAuth: true,
  on401: async () => {
    const authDocument = await createOPDSAuthenticationDocument()
    return createOPDSAuthResponse(authDocument)
  },
}
