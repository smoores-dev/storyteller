import { Links } from "@readium/shared"

import { MediaType } from "@storyteller-platform/media-types"

import { type OPDSError, type Result, err, ok } from "../../result.ts"
import { type OPDSAuthenticationDocument } from "../../types/authentication.ts"

type OPDSAuthenticationFlow =
  OPDSAuthenticationDocument["authentication"][number]

/** well-known OPDS authentication flow type URIs */
export const AuthFlowType = {
  basic: "http://opds-spec.org/auth/basic",
  oauthPassword: "http://opds-spec.org/auth/oauth/password",
  oauthImplicit: "http://opds-spec.org/auth/oauth/implicit",
} as const

export interface AuthFlow {
  type: string
  links?: Links
  labels?: { login?: string; password?: string }
}

/** HTTP basic auth flow */
export const basic = (labels?: {
  login?: string
  password?: string
}): AuthFlow => ({ type: AuthFlowType.basic, labels })

/** OAuth password-grant flow, `authenticate` is the token endpoint */
export const oauthPassword = (
  authenticate: string,
  labels?: { login?: string; password?: string },
): AuthFlow => ({
  type: AuthFlowType.oauthPassword,
  links: new Links([
    {
      href: authenticate,
      type: MediaType.JSON.mime,
      rels: new Set(["authenticate"]),
    },
  ] as ConstructorParameters<typeof Links>[0]),
  labels,
})

/** OAuth implicit flow, `authenticate` is the authorization page */
export const oauthImplicit = (authenticate: string): AuthFlow => ({
  type: AuthFlowType.oauthImplicit,
  links: new Links([
    {
      href: authenticate,
      type: MediaType.HTML.mime,
      rels: new Set(["authenticate"]),
    },
  ] as ConstructorParameters<typeof Links>[0]),
})

/**
 * an OPDS authentication document, served with a 401 to tell a client how to
 * authenticate. https://drafts.opds.io/authentication-for-opds-1.0.html
 */
export class AuthDocument {
  readonly id: string
  readonly title: string
  readonly authentication: AuthFlow[]
  readonly description?: string
  readonly links?: Links

  constructor(values: {
    id: string
    title: string
    authentication: AuthFlow[]
    description?: string
    links?: Links
  }) {
    this.id = values.id
    this.title = values.title
    this.authentication = values.authentication
    this.description = values.description
    this.links = values.links
  }

  static deserialize(
    json: unknown,
    options: { validate?: (json: unknown) => OPDSError[] | null } = {},
  ): Result<AuthDocument> {
    if (options.validate) {
      const errors = options.validate(json)
      if (errors && errors.length > 0) return err(errors)
    }

    const doc = json as OPDSAuthenticationDocument

    const authentication = doc.authentication.map(
      (flow): AuthFlow => ({
        type: flow.type,
        links: flow.links ? Links.deserialize(flow.links) : undefined,
        labels: flow.labels,
      }),
    )

    return ok(
      new AuthDocument({
        id: doc.id,
        title: doc.title,
        authentication,
        description: doc.description,
        links: doc.links ? Links.deserialize(doc.links) : undefined,
      }),
    )
  }

  serialize(): OPDSAuthenticationDocument {
    const json: OPDSAuthenticationDocument = {
      id: this.id,
      title: this.title,
      authentication: this.authentication.map(
        (flow): OPDSAuthenticationFlow => {
          const out: OPDSAuthenticationFlow = { type: flow.type }
          if (flow.links) {
            out.links =
              flow.links.serialize() as OPDSAuthenticationFlow["links"]
          }
          if (flow.labels) out.labels = flow.labels
          return out
        },
      ),
    }
    if (this.description !== undefined) json.description = this.description
    if (this.links) {
      json.links = this.links.serialize() as OPDSAuthenticationDocument["links"]
    }
    return json
  }
}
