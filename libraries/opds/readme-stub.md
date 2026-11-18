# @storyteller/opds

A library for generating, validating, and parsing OPDS 2.0 catalog feeds,
compatible with [`@readium/shared`](https://github.com/readium/ts-toolkit).

<!-- toc -->

- [Installation](#installation)
- [Usage](#usage)
  - [Creating a catalog feed](#creating-a-catalog-feed)
  - [Validating a catalog feed](#validating-a-catalog-feed)
- [API Docs](#api-docs)

<!-- tocstop -->

## Installation

```sh
npm install @storyteller/opds
# yarn add @storyteller/opds
# deno install npm:@storyteller/opds
# pnpm add @storyteller/opds
# bun add @storyteller/opds
```

## Usage

### Creating a catalog feed

```ts
import {
  Feed,
  FeedMetadata,
  Links,
  Link,
  NavigationLinks,
  NavigationLink,
  ATOM_NAV,
  OPDS_JSON,
  toAtomXml,
} from "@storyteller/opds"

const feed = new Feed({
  metadata: new FeedMetadata({
    title: "Storyteller Catalog",
    identifier: "urn:uuid:12345678-1234-1234-1234-123456789012",
  }),
  navigation: new NavigationLinks([
    new NavigationLink({
      href: "/opds/v1",
      rels: new Set(["self"]),
      type: OPDS_JSON,
    }),
  ]),
  links: new Links([
    new Link({
      href: "https://storyteller.io/opds/v1",
      rels: new Set(["alternate"]),
      type: ATOM_NAV,
      title: "Storyteller OPDS v1.2 Catalog",
    }),
  ]),
  publications: [
    new OPDSPublication({
      metadata: new Metadata({
        title: "Storyteller Book 1",
        identifier: "urn:uuid:12345678-1234-1234-1234-123456789012",
      }),
      links: new Links([
        new AcquisitionLink({
          href: "https://storyteller.io/api/v2/books/12345678-1234-1234-1234-123456789012/files?format=readaloud",
          rel: "acquisition",
          type: "application/epub+zip",
        }),
      ]),
    }),
  ],
})

// produces Result<Feed>
if (feed.ok) {
  console.log(feed.value.serialize()) // opds2 feed
  console.log(toAtomXml(feed.value)) // opds 1.2 atom xml
} else {
  console.error(feed.errors)
}
```

### Validating a catalog feed

This library also comes with a AJV validator for the OPDS2 schema.

The validator needs to be imported from the `validate` sub-package. This
validator is rather large (~400kb), so think twice before importing it in your
frontend.

You can use it standalone like this

```ts
import { validateFeed } from "@storyteller/opds/validate"

const result = validateFeed(feed.value.serialize())
if (result.ok) {
  console.log("feed is valid")
} else {
  console.error(result.errors)
}
```

or when you are consuming a feed from an external source

```ts
import { Feed } from "@storyteller/opds"
import { validateFeed } from "@storyteller/opds/validate"

const feed = Feed.deserialize(json, { validate: validateFeed })
if (feed.ok) {
  console.log("feed is valid")
} else {
  console.error(feed.errors)
}
```

### OPDS Auth & Progression

This package also exposes some basic models for OPDS Authentication Documents
and OPDS Progression Documents.

## Development

To sync schemas from the OPDS/Readium JSON Schemas, run `yarn schemas:sync`.
