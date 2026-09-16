import {
  Acquisition,
  type Contributor,
  type Link,
  Price,
  type Subject,
} from "@readium/shared"
import XMLBuilder from "fast-xml-builder"

import { type Facet } from "../model/Facet.ts"
import { type Feed } from "../model/Feed.ts"
import { type Group } from "../model/Group.ts"
import { type OPDSPublication } from "../model/OPDSPublication.ts"

const NS = {
  xmlns: "http://www.w3.org/2005/Atom",
  opds: "http://opds-spec.org/2010/catalog",
  // OPDS 1.2 maps the dc prefix to the DCMI terms namespace (5.1.1)
  dc: "http://purl.org/dc/terms/",
  thr: "http://purl.org/syndication/thread/1.0",
  opensearch: "http://a9.com/-/spec/opensearch/1.1/",
} as const

const REL = {
  facet: "http://opds-spec.org/facet",
  image: "http://opds-spec.org/image",
  collection: "collection",
} as const

type XmlNode = Record<string, unknown>

const plainText = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined

/* oxlint-disable typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type */
const otherProps = (link: Link): Record<string, unknown> =>
  (link.properties?.otherProperties ?? {}) as Record<string, unknown>
/* oxlint-enable typescript/no-unnecessary-type-assertion */

const acquisitionXml = (acquisition: Acquisition): XmlNode => {
  const node: XmlNode = { "@_type": acquisition.type }
  if (acquisition.children && acquisition.children.length > 0) {
    node["opds:indirectAcquisition"] = acquisition.children.map(acquisitionXml)
  }
  return node
}

const linkXml = (link: Link): XmlNode => {
  const node: XmlNode = { "@_href": link.href }
  if (link.rels && link.rels.size > 0) node["@_rel"] = [...link.rels].join(" ")
  if (link.type) node["@_type"] = link.type
  if (link.title) node["@_title"] = link.title

  const price = Price.deserialize(otherProps(link)["price"])
  if (price) {
    node["opds:price"] = {
      "@_currencycode": price.currency,
      "#text": price.value,
    }
  }
  const indirect = Acquisition.deserializeArray(
    otherProps(link)["indirectAcquisition"],
  )
  if (indirect && indirect.length > 0) {
    node["opds:indirectAcquisition"] = indirect.map(acquisitionXml)
  }
  return node
}

const imageLinkXml = (link: Link): XmlNode => {
  const node = linkXml(link)
  if (!("@_rel" in node)) node["@_rel"] = REL.image
  return node
}

const authorXml = (contributor: Contributor): XmlNode => {
  const node: XmlNode = { name: contributor.name.getTranslation() }
  const uri = contributor.links?.items[0]?.href ?? contributor.identifier
  if (uri) node["uri"] = uri
  return node
}

const categoryXml = (subject: Subject): XmlNode => {
  const node: XmlNode = { "@_label": subject.name.getTranslation() }
  if (subject.scheme) node["@_scheme"] = subject.scheme
  if (subject.code) node["@_term"] = subject.code
  return node
}

const publicationEntryXml = (publication: OPDSPublication): XmlNode => {
  const metadata = publication.metadata
  const entry: XmlNode = {}

  if (metadata.identifier) entry["id"] = metadata.identifier
  entry["title"] = metadata.title.getTranslation()
  if (metadata.modified) entry["updated"] = metadata.modified.toISOString()
  if (metadata.published) entry["published"] = metadata.published.toISOString()
  if (metadata.description) {
    // 5.1.3: atom:summary must use type="text" with no child elements
    entry["summary"] = { "@_type": "text", "#text": metadata.description }
  }
  if (metadata.languages && metadata.languages.length > 0) {
    entry["dc:language"] = metadata.languages
  }
  if (metadata.publishers && metadata.publishers.items.length > 0) {
    entry["dc:publisher"] = metadata.publishers.items.map((p) =>
      p.name.getTranslation(),
    )
  }
  if (metadata.authors && metadata.authors.items.length > 0) {
    entry["author"] = metadata.authors.items.map(authorXml)
  }
  if (metadata.subjects && metadata.subjects.items.length > 0) {
    entry["category"] = metadata.subjects.items.map(categoryXml)
  }

  const links = [
    ...publication.links.items.map(linkXml),
    ...(publication.images?.items.map(imageLinkXml) ?? []),
  ]
  if (links.length > 0) entry["link"] = links
  return entry
}
const navigationEntryXml = (link: Link): XmlNode => ({
  id: link.href,
  title: link.title ?? "",
  link: linkXml(link),
})

const facetLinksXml = (facet: Facet): XmlNode[] => {
  const group = plainText(facet.metadata?.title)
  return facet.links.items.map((link) => {
    const node = linkXml(link)
    node["@_rel"] = REL.facet
    if (group) node["@_opds:facetGroup"] = group
    const count = otherProps(link)["numberOfItems"]
    if (typeof count === "number") node["@_thr:count"] = count
    return node
  })
}

const groupEntriesXml = (group: Group): XmlNode[] => {
  const self = group.links?.items[0]
  const title = plainText(group.metadata.title)
  const collectionLink: XmlNode | undefined = self
    ? {
        "@_rel": REL.collection,
        "@_href": self.href,
        ...(title && { "@_title": title }),
      }
    : undefined

  const publications = (group.publications ?? []).map((publication) => {
    const entry = publicationEntryXml(publication)
    if (collectionLink) {
      const existing = (entry["link"] as XmlNode[] | undefined) ?? []
      entry["link"] = [...existing, collectionLink]
    }
    return entry
  })

  const navigation = (group.navigation?.items ?? []).map(navigationEntryXml)
  return [...publications, ...navigation]
}

export interface ToAtomXmlOptions {
  /** pretty-print with indentation, defaults to true */
  pretty?: boolean
}

/** renders a {@link Feed} as an OPDS 1.2 atom XML document */
export const toAtomXml = (
  feed: Feed,
  options: ToAtomXmlOptions = {},
): string => {
  const links = [
    ...feed.links.items.map(linkXml),
    ...(feed.facets?.flatMap(facetLinksXml) ?? []),
  ]
  const entries = [
    ...(feed.publications?.map(publicationEntryXml) ?? []),
    ...(feed.navigation?.items.map(navigationEntryXml) ?? []),
    ...(feed.groups?.flatMap(groupEntriesXml) ?? []),
  ]

  const root: XmlNode = {
    "@_xmlns": NS.xmlns,
    "@_xmlns:opds": NS.opds,
    "@_xmlns:dc": NS.dc,
    "@_xmlns:thr": NS.thr,
    "@_xmlns:opensearch": NS.opensearch,
    title: plainText(feed.metadata.title) ?? "",
    updated: feed.metadata.modified ?? new Date().toISOString(),
  }
  if (feed.metadata.identifier) root["id"] = feed.metadata.identifier
  if (feed.metadata.numberOfItems !== undefined) {
    root["opensearch:totalResults"] = feed.metadata.numberOfItems
  }
  if (feed.metadata.itemsPerPage !== undefined) {
    root["opensearch:itemsPerPage"] = feed.metadata.itemsPerPage
  }
  if (links.length > 0) root["link"] = links
  if (entries.length > 0) root["entry"] = entries

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: options.pretty ?? true,
    suppressEmptyNode: true,
  })
  const body = builder.build({ feed: root })
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`
}
