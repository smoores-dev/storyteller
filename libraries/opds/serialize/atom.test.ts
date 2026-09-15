import assert from "node:assert"

import { SyntaxValidator } from "fast-xml-validator"
import { describe, it } from "vitest"

import { Feed } from "../index.ts"
import rawCatalog from "../test-catalog.json.ts"

import { toAtomXml } from "./atom.ts"

const parse = (json: unknown): Feed => {
  const result = Feed.deserialize(json)
  assert.ok(result.ok, "expected a valid parse")
  return result.value
}

describe("toAtomXml", () => {
  it("renders the catalog as well-formed Atom", () => {
    const xml = toAtomXml(parse(rawCatalog))

    assert.strictEqual(SyntaxValidator.validate(xml), true)
    assert.match(xml, /<feed[\s>]/)
    assert.match(xml, /xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/)
    assert.match(xml, /<entry>/)
  })

  it("projects OPDS2 features into OPDS1 and strips OPDS2-only ones", () => {
    const feedJson = {
      metadata: { title: "Synthetic", numberOfItems: 1 },
      links: [{ rel: "self", href: "/feed", type: "application/opds+json" }],
      facets: [
        {
          metadata: { title: "Language" },
          links: [
            {
              href: "/feed?lang=en",
              title: "English",
              type: "application/opds+json",
              properties: { numberOfItems: 42 },
            },
          ],
        },
      ],
      publications: [
        {
          metadata: {
            title: "Book One",
            language: "en",
            author: "Jane Doe",
            description: "A short blurb.",
            subject: [{ name: "Fiction", scheme: "bisac", code: "FIC000000" }],
          },
          links: [
            {
              rel: "http://opds-spec.org/acquisition/buy",
              href: "/buy/1",
              type: "application/epub+zip",
              properties: {
                price: { currency: "USD", value: 9.99 },
                indirectAcquisition: [{ type: "application/epub+zip" }],
                // OPDS2-only: must not appear in the Atom output
                availability: { state: "available" },
                copies: { total: 5, available: 5 },
                holds: { total: 0 },
              },
            },
          ],
          images: [{ href: "/cover/1.jpg", type: "image/jpeg" }],
        },
      ],
    }

    const xml = toAtomXml(parse(feedJson))

    assert.strictEqual(SyntaxValidator.validate(xml), true)
    // facet -> feed-level link with the OPDS facet rel + group/count hints
    assert.match(xml, /rel="http:\/\/opds-spec\.org\/facet"/)
    assert.match(xml, /opds:facetGroup="Language"/)
    assert.match(xml, /thr:count="42"/)
    // price + indirect acquisition children
    assert.match(xml, /<opds:price currencycode="USD">9\.99<\/opds:price>/)
    assert.match(xml, /<opds:indirectAcquisition type="application\/epub\+zip"/)
    // cover image rel + subject category
    assert.match(xml, /rel="http:\/\/opds-spec\.org\/image"/)
    assert.match(xml, /<category label="Fiction"/)
    // 5.1.1 prefers the dc prefix; 5.1.3 requires atom:summary type="text"
    assert.match(xml, /xmlns:dc="http:\/\/purl\.org\/dc\/terms\/"/)
    assert.doesNotMatch(xml, /dcterms:/)
    assert.match(xml, /<dc:language>en<\/dc:language>/)
    assert.match(xml, /<summary type="text">A short blurb\.<\/summary>/)
    assert.doesNotMatch(xml, /<content[\s>]/)
    // OPDS2-only acquisition state has no OPDS1 representation
    assert.doesNotMatch(xml, /availability/)
    assert.doesNotMatch(xml, /copies/)
    assert.doesNotMatch(xml, /holds/)
  })
})
