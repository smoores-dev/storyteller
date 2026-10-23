import { Link, Links, Metadata, type Properties } from "@readium/shared"

import { type Result, err, ok } from "../result.ts"
import { type OPDSPublication as OPDSPublicationJSON } from "../types/feed.ts"

import {
  ACQUISITION_RELS,
  ACQUISITION_RELS_ARRAY,
  OPDS_PROGRESSION,
  PROGRESSION_REL,
} from "./constants.ts"

const opdsRels = new Set(ACQUISITION_RELS_ARRAY)

/**
 * A link that represents an acquisition of a publication
 * Since this extends {@link Link}, it does not follow the same Result pattern as other models.
 */
export class AcquisitionLink extends Link {
  constructor(values: {
    href: string
    rel: keyof typeof ACQUISITION_RELS
    type: string
  }) {
    super({
      href: values.href,
      rels: new Set([ACQUISITION_RELS[values.rel]]),
      type: values.type,
    })
  }

  static override deserialize(json: unknown): AcquisitionLink | undefined {
    if (
      typeof json !== "object" ||
      json === null ||
      !("href" in json) ||
      !("rel" in json) ||
      !("type" in json)
    ) {
      throw new Error("invalid acquisition link")
    }
    return new AcquisitionLink(
      json as ConstructorParameters<typeof AcquisitionLink>[0],
    )
  }
}

/**
 * A link that represents the user's current progression in a publication
 * Since this extends {@link Link}, it does not follow the same Result pattern as other models.
 */
export class ProgressionLink extends Link {
  constructor(values: { href: string; properties?: Properties }) {
    super({
      href: values.href,
      rels: new Set([PROGRESSION_REL]),
      type: OPDS_PROGRESSION,
      ...(values.properties ? { properties: values.properties } : {}),
    })
  }

  static override deserialize(json: unknown): ProgressionLink | undefined {
    if (
      typeof json !== "object" ||
      json === null ||
      !("href" in json) ||
      !("rel" in json) ||
      json.rel !== PROGRESSION_REL ||
      !("type" in json) ||
      json.type !== OPDS_PROGRESSION
    ) {
      throw new Error("invalid progression link")
    }
    return new ProgressionLink(
      json as ConstructorParameters<typeof ProgressionLink>[0],
    )
  }
}

/**
 * A publication entry in an OPDS feed
 *
 * See {@link https://specs.opds.io/schema/publication.schema.json}
 */
export class OPDSPublication {
  readonly metadata: Metadata
  readonly links: Links
  readonly images?: Links

  constructor(values: { metadata: Metadata; links: Links; images?: Links }) {
    this.metadata = values.metadata
    this.links = values.links
    this.images = values.images
  }

  static deserialize(
    json: OPDSPublicationJSON,
    path: string,
  ): Result<OPDSPublication> {
    const metadata = Metadata.deserialize(json.metadata)
    if (!metadata) {
      return err([
        {
          path: `${path}/metadata`,
          message: "invalid publication metadata",
          keyword: "construct",
        },
      ])
    }

    const links = Links.deserialize(json.links)
    if (!links) {
      return err([
        {
          path: `${path}/links`,
          message: "invalid links",
          keyword: "construct",
        },
      ])
    }

    if (
      !links.items.some((link) =>
        Array.from(link.rels ?? []).some((rel) => opdsRels.has(rel)),
      )
    ) {
      return err([
        {
          path: `${path}/links`,
          message: "missing acquisition link",
          keyword: "construct",
        },
      ])
    }

    return ok(
      new OPDSPublication({
        metadata,
        links,
        images: json.images ? Links.deserialize(json.images) : undefined,
      }),
    )
  }

  serialize(): OPDSPublicationJSON {
    const json = {
      metadata: this.metadata.serialize() as OPDSPublicationJSON["metadata"],
      links: this.links.serialize() as OPDSPublicationJSON["links"],
    } as OPDSPublicationJSON
    if (this.images) {
      json.images = this.images.serialize() as OPDSPublicationJSON["images"]
    }
    return json
  }
}
