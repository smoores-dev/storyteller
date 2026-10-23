export { type DeserializeOptions, Feed } from "./model/Feed.ts"
export { FeedMetadata } from "./model/FeedMetadata.ts"
export {
  AcquisitionLink,
  ProgressionLink,
  OPDSPublication,
} from "./model/OPDSPublication.ts"
export { Facet } from "./model/Facet.ts"
export { Group } from "./model/Group.ts"
export {
  AuthDocument,
  type AuthFlow,
  AuthFlowType,
  basic,
  oauthImplicit,
  oauthPassword,
} from "./model/auth/AuthDocument.ts"
export { NavigationLink, NavigationLinks } from "./model/NavigationLinks.ts"

export { type ToAtomXmlOptions, toAtomXml } from "./serialize/atom.ts"

export {
  Acquisition,
  Availability,
  Copies,
  Holds,
  Price,
} from "@readium/shared"

export {
  type AjvErrorLike,
  type OPDSError,
  type Result,
  err,
  ok,
  toOPDSError,
} from "./result.ts"

export type {
  OPDSFeed,
  OPDSPublication as OPDSPublicationJSON,
} from "./types/feed.ts"
export type { OPDSAuthenticationDocument } from "./types/authentication.ts"
export type { OPDSProgressionDocument } from "./types/progression.ts"

export {
  ACQUISITION_RELS,
  ACQUISITION_RELS_ARRAY,
  ATOM_ACQ,
  ATOM_NAV,
  OPDS_AUTHENTICATION_JSON,
  OPDS_JSON,
  OPDS_PUBLICATION_JSON,
  OPENSEARCH_XML,
  THUMBNAIL_REL,
} from "./model/constants.ts"
