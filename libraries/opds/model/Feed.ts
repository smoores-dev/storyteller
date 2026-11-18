import { Links } from "@readium/shared"

import { type OPDSError, type Result, err, ok } from "../result.ts"
import { type OPDSFeed } from "../types/feed.ts"

import { Facet } from "./Facet.ts"
import { FeedMetadata } from "./FeedMetadata.ts"
import { Group } from "./Group.ts"
import { NavigationLinks } from "./NavigationLinks.ts"
import { OPDSPublication } from "./OPDSPublication.ts"

export interface DeserializeOptions {
  /**
   * runs before construction, returns the schema errors (with JSON pointer
   * paths) or null when valid. pass `validateFeed` from
   * `@storyteller/opds/validate` for full AJV validation, omit it to
   * (mostly) trust the input
   */
  validate?: (json: unknown) => OPDSError[] | null
}

/**
 * An OPDS 2.0 feed. the canonical model: `serialize()` emits OPDS2 JSON
 *
 * Can be used to generate an OPDS1 atom feed (see `serialize/atom`)
 *
 * See {@link https://specs.opds.io/schema/feed.schema.json}
 */
export class Feed {
  readonly metadata: FeedMetadata
  readonly links: Links
  readonly publications?: OPDSPublication[]
  readonly navigation?: NavigationLinks
  readonly facets?: Facet[]
  readonly groups?: Group[]

  constructor(values: {
    metadata: FeedMetadata
    links: Links
    publications?: OPDSPublication[]
    navigation?: NavigationLinks
    facets?: Facet[]
    groups?: Group[]
  }) {
    this.metadata = values.metadata
    this.links = values.links
    this.publications = values.publications
    this.navigation = values.navigation
    this.facets = values.facets
    this.groups = values.groups
  }

  /**
   * parses a feed from its OPDS2 JSON. unlike @readium/shared's `deserialize`
   * this never silently returns undefined or drops invalid entries, it returns
   * a {@link Result} that locates every problem. with `options.validate` it
   * reports the full set of schema errors, without it only cheap structural
   * checks run
   */
  static deserialize(
    json: unknown,
    options: DeserializeOptions = {},
  ): Result<Feed> {
    if (options.validate) {
      const errors = options.validate(json)
      if (errors && errors.length > 0) return err(errors)
    }

    const feed = json as OPDSFeed

    const links = Links.deserialize(feed.links)
    if (!links) {
      return err([
        { path: "/links", message: "invalid links", keyword: "construct" },
      ])
    }

    let publications: OPDSPublication[] | undefined
    if (feed.publications) {
      publications = []
      for (const [i, pub] of feed.publications.entries()) {
        const result = OPDSPublication.deserialize(pub, `/publications/${i}`)
        if (!result.ok) return result
        publications.push(result.value)
      }
    }

    let facets: Facet[] | undefined
    if (feed.facets) {
      facets = []
      for (const [i, facet] of feed.facets.entries()) {
        const result = Facet.deserialize(facet, `/facets/${i}`)
        if (!result.ok) return result
        facets.push(result.value)
      }
    }

    let groups: Group[] | undefined
    if (feed.groups) {
      groups = []
      for (const [i, group] of feed.groups.entries()) {
        const result = Group.deserialize(group, `/groups/${i}`)
        if (!result.ok) return result
        groups.push(result.value)
      }
    }

    return ok(
      new Feed({
        metadata: FeedMetadata.deserialize(feed.metadata),
        links,
        publications,
        navigation: feed.navigation
          ? NavigationLinks.deserialize(feed.navigation)
          : undefined,
        facets,
        groups,
      }),
    )
  }

  serialize(): OPDSFeed {
    const json = {
      metadata: this.metadata.serialize(),
      links: this.links.serialize() as OPDSFeed["links"],
    } as OPDSFeed
    if (this.publications) {
      json.publications = this.publications.map((p) =>
        p.serialize(),
      ) as OPDSFeed["publications"]
    }
    if (this.navigation) {
      json.navigation = this.navigation.serialize() as OPDSFeed["navigation"]
    }
    if (this.facets) {
      json.facets = this.facets.map((f) => f.serialize()) as OPDSFeed["facets"]
    }
    if (this.groups) json.groups = this.groups.map((g) => g.serialize())
    return json
  }
}
