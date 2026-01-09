import { getSettings } from "@/database/settings"

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
      "Enter your email or username and password to access your library.",
    links: [
      {
        rel: "logo",
        href: `/Storyteller_Logo.png`,
        type: "image/png",
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
            type: "text/html",
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
      "Content-Type": "application/opds-authentication+json",
      // many clients will not check for auth if Basic Auth is not supported
      "WWW-Authenticate": 'Basic realm="Storyteller"',
      Link: `<${authDocument.id}>; rel="http://opds-spec.org/auth/document"; type="application/opds-authentication+json"`,
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
