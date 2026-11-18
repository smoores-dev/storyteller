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

The validator needs to be imported from the `validate` sub-package.

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

## API Docs

## Acquisition

Defined in: node_modules/@readium/shared/types/src/opds/Acquisition.d.ts:6

OPDS Acquisition Object.

https://drafts.opds.io/schema/acquisition-object.schema.json

### Constructors

#### Constructor

> **new Acquisition**(`values`): [`Acquisition`](#acquisition)

Defined in: node_modules/@readium/shared/types/src/opds/Acquisition.d.ts:13

Creates a [Acquisition].

##### Parameters

| Parameter          | Type                                                                  |
| ------------------ | --------------------------------------------------------------------- |
| `values`           | \{ `children?`: [`Acquisition`](#acquisition)[]; `type`: `string`; \} |
| `values.children?` | [`Acquisition`](#acquisition)[]                                       |
| `values.type`      | `string`                                                              |

##### Returns

[`Acquisition`](#acquisition)

### Properties

#### children?

> `optional` **children**: [`Acquisition`](#acquisition)[]

Defined in: node_modules/@readium/shared/types/src/opds/Acquisition.d.ts:11

Price value, should only be used for display purposes, because of precision
issues inherent with Double and the JSON parsing.

#### type

> **type**: `string`

Defined in: node_modules/@readium/shared/types/src/opds/Acquisition.d.ts:8

Currency for the price, eg. EUR.

### Methods

#### serialize()

> **serialize**(): `any`

Defined in: node_modules/@readium/shared/types/src/opds/Acquisition.d.ts:25

Serializes a [Acquisition] to its RWPM JSON representation.

##### Returns

`any`

#### deserialize()

> `static` **deserialize**(`json`): `undefined` \| [`Acquisition`](#acquisition)

Defined in: node_modules/@readium/shared/types/src/opds/Acquisition.d.ts:20

Parses a [Acquisition] from its RWPM JSON representation.

##### Parameters

| Parameter | Type  |
| --------- | ----- |
| `json`    | `any` |

##### Returns

`undefined` \| [`Acquisition`](#acquisition)

#### deserializeArray()

> `static` **deserializeArray**(`json`): `undefined` \| >
> [`Acquisition`](#acquisition)[]

Defined in: node_modules/@readium/shared/types/src/opds/Acquisition.d.ts:21

##### Parameters

| Parameter | Type  |
| --------- | ----- |
| `json`    | `any` |

##### Returns

`undefined` \| [`Acquisition`](#acquisition)[]

---

## AcquisitionLink

Defined in:
[opds/model/OPDSPublication.ts:14](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/OPDSPublication.ts#L14)

A link that represents an acquisition of a publication Since this extends Link,
it does not follow the same Result pattern as other models.

### Extends

- `Link`

### Constructors

#### Constructor

> **new AcquisitionLink**(`values`): [`AcquisitionLink`](#acquisitionlink)

Defined in:
[opds/model/OPDSPublication.ts:15](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/OPDSPublication.ts#L15)

##### Parameters

| Parameter     | Type                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `values`      | \{ `href`: `string`; `rel`: `"acquisition"` \| `"buy"` \| `"borrow"` \| `"download"` \| `"preview"` \| `"subscribe"`; `type`: `string`; \} |
| `values.href` | `string`                                                                                                                                   |
| `values.rel`  | `"acquisition"` \| `"buy"` \| `"borrow"` \| `"download"` \| `"preview"` \| `"subscribe"`                                                   |
| `values.type` | `string`                                                                                                                                   |

##### Returns

[`AcquisitionLink`](#acquisitionlink)

##### Overrides

`Link.constructor`

### Properties

#### alternates?

> `readonly` `optional` **alternates**: `Links`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:34

Alternate resources for the linked resource.

##### Inherited from

`Link.alternates`

#### bitrate?

> `readonly` `optional` **bitrate**: `number`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:30

Bitrate of the linked resource in kbps.

##### Inherited from

`Link.bitrate`

#### children?

> `readonly` `optional` **children**: `Links`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:36

Resources that are children of the linked resource, in the context of a given
collection role.

##### Inherited from

`Link.children`

#### duration?

> `readonly` `optional` **duration**: `number`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:28

Length of the linked resource in seconds.

##### Inherited from

`Link.duration`

#### height?

> `readonly` `optional` **height**: `number`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:22

Height of the linked resource in pixels.

##### Inherited from

`Link.height`

#### href

> `readonly` **href**: `string`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:10

URI or URI template of the linked resource.

##### Inherited from

`Link.href`

#### languages?

> `readonly` `optional` **languages**: `string`[]

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:32

Expected language of the linked resource.

##### Inherited from

`Link.languages`

#### properties?

> `optional` **properties**: `Properties`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:20

Properties associated to the linked resource.

##### Inherited from

`Link.properties`

#### rels?

> `readonly` `optional` **rels**: `Set`\<`string`\>

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:18

Relation between the linked resource and its containing collection.

##### Inherited from

`Link.rels`

#### size?

> `readonly` `optional` **size**: `number`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:26

Size of the linked resource in bytes.

##### Inherited from

`Link.size`

#### templated?

> `readonly` `optional` **templated**: `boolean`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:12

Indicates that a URI template is used in href.

##### Inherited from

`Link.templated`

#### title?

> `readonly` `optional` **title**: `string`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:16

Title of the linked resource.

##### Inherited from

`Link.title`

#### type?

> `readonly` `optional` **type**: `string`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:14

MIME type of the linked resource.

##### Inherited from

`Link.type`

#### width?

> `readonly` `optional` **width**: `number`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:24

Width of the linked resource in pixels.

##### Inherited from

`Link.width`

### Accessors

#### locator

##### Get Signature

> **get** **locator**(): `Locator`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:87

Creates a [Locator] from a reading order [Link].

###### Returns

`Locator`

##### Inherited from

`Link.locator`

#### mediaType

##### Get Signature

> **get** **mediaType**(): `MediaType`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:65

MediaType of the linked resource.

###### Returns

`MediaType`

##### Inherited from

`Link.mediaType`

#### templateParameters

##### Get Signature

> **get** **templateParameters**(): `Set`\<`string`\>

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:71

List of URI template parameter keys, if the `Link` is templated.

###### Returns

`Set`\<`string`\>

##### Inherited from

`Link.templateParameters`

### Methods

#### addProperties()

> **addProperties**(`properties`): `Link`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:81

Makes a copy of this [Link] after merging in the given additional other
[properties].

##### Parameters

| Parameter    | Type                           |
| ------------ | ------------------------------ |
| `properties` | \{[`key`: `string`]: `any`; \} |

##### Returns

`Link`

##### Inherited from

`Link.addProperties`

#### expandTemplate()

> **expandTemplate**(`parameters`): `Link`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:75

Expands the `Link`'s HREF by replacing URI template variables by the given
parameters. See RFC 6570 on URI template: https://tools.ietf.org/html/rfc6570

##### Parameters

| Parameter    | Type                                |
| ------------ | ----------------------------------- |
| `parameters` | \{[`param`: `string`]: `string`; \} |

##### Returns

`Link`

##### Inherited from

`Link.expandTemplate`

#### serialize()

> **serialize**(): `any`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:63

Serializes a [Link] to its RWPM JSON representation.

##### Returns

`any`

##### Inherited from

`Link.serialize`

#### toURL()

> **toURL**(`baseUrl?`): `undefined` \| `string`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:69

Computes an absolute URL to the link, relative to the given `baseURL`. If the
link's `href` is already absolute, the `baseURL` is ignored.

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `baseUrl?` | `string` |

##### Returns

`undefined` \| `string`

##### Inherited from

`Link.toURL`

#### deserialize()

> `static` **deserialize**(`json`): `undefined` \| >
> [`AcquisitionLink`](#acquisitionlink)

Defined in:
[opds/model/OPDSPublication.ts:27](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/OPDSPublication.ts#L27)

Parses a [Link] from its RWPM JSON representation.

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `json`    | `unknown` |

##### Returns

`undefined` \| [`AcquisitionLink`](#acquisitionlink)

##### Overrides

`Link.deserialize`

---

## AuthDocument

Defined in:
[opds/model/auth/AuthDocument.ts:56](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L56)

an OPDS authentication document, served with a 401 to tell a client how to
authenticate. https://drafts.opds.io/authentication-for-opds-1.0.html

### Constructors

#### Constructor

> **new AuthDocument**(`values`): [`AuthDocument`](#authdocument)

Defined in:
[opds/model/auth/AuthDocument.ts:63](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L63)

##### Parameters

| Parameter               | Type                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `values`                | \{ `authentication`: [`AuthFlow`](#authflow)[]; `description?`: `string`; `id`: `string`; `links?`: `Links`; `title`: `string`; \} |
| `values.authentication` | [`AuthFlow`](#authflow)[]                                                                                                          |
| `values.description?`   | `string`                                                                                                                           |
| `values.id`             | `string`                                                                                                                           |
| `values.links?`         | `Links`                                                                                                                            |
| `values.title`          | `string`                                                                                                                           |

##### Returns

[`AuthDocument`](#authdocument)

### Properties

#### authentication

> `readonly` **authentication**: [`AuthFlow`](#authflow)[]

Defined in:
[opds/model/auth/AuthDocument.ts:59](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L59)

#### description?

> `readonly` `optional` **description**: `string`

Defined in:
[opds/model/auth/AuthDocument.ts:60](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L60)

#### id

> `readonly` **id**: `string`

Defined in:
[opds/model/auth/AuthDocument.ts:57](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L57)

#### links?

> `readonly` `optional` **links**: `Links`

Defined in:
[opds/model/auth/AuthDocument.ts:61](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L61)

#### title

> `readonly` **title**: `string`

Defined in:
[opds/model/auth/AuthDocument.ts:58](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L58)

### Methods

#### serialize()

> **serialize**(): [`OPDSAuthenticationDocument`](#opdsauthenticationdocument)

Defined in:
[opds/model/auth/AuthDocument.ts:107](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L107)

##### Returns

[`OPDSAuthenticationDocument`](#opdsauthenticationdocument)

#### deserialize()

> `static` **deserialize**(`json`, `options`):
> [`Result`](#result)\<[`AuthDocument`](#authdocument)\>

Defined in:
[opds/model/auth/AuthDocument.ts:77](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L77)

##### Parameters

| Parameter           | Type                                                                  |
| ------------------- | --------------------------------------------------------------------- |
| `json`              | `unknown`                                                             |
| `options`           | \{ `validate?`: (`json`) => `null` \| [`OPDSError`](#opdserror)[]; \} |
| `options.validate?` | (`json`) => `null` \| [`OPDSError`](#opdserror)[]                     |

##### Returns

[`Result`](#result)\<[`AuthDocument`](#authdocument)\>

---

## Availability

Defined in: node_modules/@readium/shared/types/src/opds/Availability.d.ts:12

Indicated the availability of a given resource.

https://drafts.opds.io/schema/properties.schema.json

### Constructors

#### Constructor

> **new Availability**(`values`): [`Availability`](#availability)

Defined in: node_modules/@readium/shared/types/src/opds/Availability.d.ts:19

Creates a [Availability].

##### Parameters

| Parameter       | Type                                                                     |
| --------------- | ------------------------------------------------------------------------ |
| `values`        | \{ `since?`: `Date`; `state`: `AvailabilityStatus`; `until?`: `Date`; \} |
| `values.since?` | `Date`                                                                   |
| `values.state`  | `AvailabilityStatus`                                                     |
| `values.until?` | `Date`                                                                   |

##### Returns

[`Availability`](#availability)

### Properties

#### since?

> `optional` **since**: `Date`

Defined in: node_modules/@readium/shared/types/src/opds/Availability.d.ts:14

Timestamp for the previous state change.

#### state

> **state**: `AvailabilityStatus`

Defined in: node_modules/@readium/shared/types/src/opds/Availability.d.ts:17

#### until?

> `optional` **until**: `Date`

Defined in: node_modules/@readium/shared/types/src/opds/Availability.d.ts:16

Timestamp for the next state change.

### Methods

#### serialize()

> **serialize**(): `any`

Defined in: node_modules/@readium/shared/types/src/opds/Availability.d.ts:31

Serializes a [Availability] to its RWPM JSON representation.

##### Returns

`any`

#### deserialize()

> `static` **deserialize**(`json`): `undefined` \| >
> [`Availability`](#availability)

Defined in: node_modules/@readium/shared/types/src/opds/Availability.d.ts:27

Parses a [Availability] from its RWPM JSON representation.

##### Parameters

| Parameter | Type  |
| --------- | ----- |
| `json`    | `any` |

##### Returns

`undefined` \| [`Availability`](#availability)

---

## Copies

Defined in: node_modules/@readium/shared/types/src/opds/Copies.d.ts:6

Library-specific feature that contains information about the copies that a
library has acquired.

https://drafts.opds.io/schema/properties.schema.json

### Constructors

#### Constructor

> **new Copies**(`values`): [`Copies`](#copies)

Defined in: node_modules/@readium/shared/types/src/opds/Copies.d.ts:10

Creates a [Copies].

##### Parameters

| Parameter           | Type                                              |
| ------------------- | ------------------------------------------------- |
| `values`            | \{ `available?`: `number`; `total?`: `number`; \} |
| `values.available?` | `number`                                          |
| `values.total?`     | `number`                                          |

##### Returns

[`Copies`](#copies)

### Properties

#### available?

> `optional` **available**: `number`

Defined in: node_modules/@readium/shared/types/src/opds/Copies.d.ts:8

#### total?

> `optional` **total**: `number`

Defined in: node_modules/@readium/shared/types/src/opds/Copies.d.ts:7

### Methods

#### serialize()

> **serialize**(): `any`

Defined in: node_modules/@readium/shared/types/src/opds/Copies.d.ts:21

Serializes a [Copies] to its RWPM JSON representation.

##### Returns

`any`

#### deserialize()

> `static` **deserialize**(`json`): `undefined` \| [`Copies`](#copies)

Defined in: node_modules/@readium/shared/types/src/opds/Copies.d.ts:17

Parses a [Copies] from its RWPM JSON representation.

##### Parameters

| Parameter | Type  |
| --------- | ----- |
| `json`    | `any` |

##### Returns

`undefined` \| [`Copies`](#copies)

---

## Facet

Defined in:
[opds/model/Facet.ts:11](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Facet.ts#L11)

a facet re-orders or filters the current list of publications

### Constructors

#### Constructor

> **new Facet**(`values`): [`Facet`](#facet)

Defined in:
[opds/model/Facet.ts:15](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Facet.ts#L15)

##### Parameters

| Parameter          | Type                                                                    |
| ------------------ | ----------------------------------------------------------------------- |
| `values`           | \{ `links`: `Links`; `metadata?`: [`FeedMetadata`](#feedmetadata-1); \} |
| `values.links`     | `Links`                                                                 |
| `values.metadata?` | [`FeedMetadata`](#feedmetadata-1)                                       |

##### Returns

[`Facet`](#facet)

### Properties

#### links

> `readonly` **links**: `Links`

Defined in:
[opds/model/Facet.ts:13](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Facet.ts#L13)

#### metadata?

> `readonly` `optional` **metadata**: [`FeedMetadata`](#feedmetadata-1)

Defined in:
[opds/model/Facet.ts:12](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Facet.ts#L12)

### Methods

#### serialize()

> **serialize**(): \{ `links?`: \[`Link`, `...Link[]`\]; `metadata?`:
> `OPDSMetadata`; \} \| \{ `links?`: \[`Link`, `...Link[]`\]; `metadata?`:
> `OPDSMetadata`; \}

Defined in:
[opds/model/Facet.ts:41](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Facet.ts#L41)

##### Returns

\{ `links?`: \[`Link`, `...Link[]`\]; `metadata?`: `OPDSMetadata`; \}

###### links?

> `optional` **links**: \[`Link`, `...Link[]`\]

###### Min Items

1

###### metadata?

> `optional` **metadata**: `OPDSMetadata`

\{ `links?`: \[`Link`, `...Link[]`\]; `metadata?`: `OPDSMetadata`; \}

###### links?

> `optional` **links**: \[`Link`, `...Link[]`\]

###### Min Items

1

###### metadata?

> `optional` **metadata**: `OPDSMetadata`

#### deserialize()

> `static` **deserialize**(`json`, `path`):
> [`Result`](#result)\<[`Facet`](#facet)\>

Defined in:
[opds/model/Facet.ts:20](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Facet.ts#L20)

##### Parameters

| Parameter | Type                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `json`    | \{ `links?`: \[`Link`, `...Link[]`\]; `metadata?`: `OPDSMetadata`; \} \| \{ `links?`: \[`Link`, `...Link[]`\]; `metadata?`: `OPDSMetadata`; \} |
| `path`    | `string`                                                                                                                                       |

##### Returns

[`Result`](#result)\<[`Facet`](#facet)\>

---

## Feed

Defined in:
[opds/model/Feed.ts:29](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Feed.ts#L29)

An OPDS 2.0 feed. the canonical model: `serialize()` emits OPDS2 JSON

Can be used to generate an OPDS1 atom feed (see `serialize/atom`)

See
[https://specs.opds.io/schema/feed.schema.json](https://specs.opds.io/schema/feed.schema.json)

### Constructors

#### Constructor

> **new Feed**(`values`): [`Feed`](#feed)

Defined in:
[opds/model/Feed.ts:37](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Feed.ts#L37)

##### Parameters

| Parameter              | Type                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `values`               | \{ `facets?`: [`Facet`](#facet)[]; `groups?`: [`Group`](#group)[]; `links`: `Links`; `metadata`: [`FeedMetadata`](#feedmetadata-1); `navigation?`: [`NavigationLinks`](#navigationlinks); `publications?`: [`OPDSPublication`](#opdspublication)[]; \} |
| `values.facets?`       | [`Facet`](#facet)[]                                                                                                                                                                                                                                    |
| `values.groups?`       | [`Group`](#group)[]                                                                                                                                                                                                                                    |
| `values.links`         | `Links`                                                                                                                                                                                                                                                |
| `values.metadata`      | [`FeedMetadata`](#feedmetadata-1)                                                                                                                                                                                                                      |
| `values.navigation?`   | [`NavigationLinks`](#navigationlinks)                                                                                                                                                                                                                  |
| `values.publications?` | [`OPDSPublication`](#opdspublication)[]                                                                                                                                                                                                                |

##### Returns

[`Feed`](#feed)

### Properties

#### facets?

> `readonly` `optional` **facets**: [`Facet`](#facet)[]

Defined in:
[opds/model/Feed.ts:34](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Feed.ts#L34)

#### groups?

> `readonly` `optional` **groups**: [`Group`](#group)[]

Defined in:
[opds/model/Feed.ts:35](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Feed.ts#L35)

#### links

> `readonly` **links**: `Links`

Defined in:
[opds/model/Feed.ts:31](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Feed.ts#L31)

#### metadata

> `readonly` **metadata**: [`FeedMetadata`](#feedmetadata-1)

Defined in:
[opds/model/Feed.ts:30](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Feed.ts#L30)

#### navigation?

> `readonly` `optional` **navigation**: [`NavigationLinks`](#navigationlinks)

Defined in:
[opds/model/Feed.ts:33](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Feed.ts#L33)

#### publications?

> `readonly` `optional` **publications**:
> [`OPDSPublication`](#opdspublication)[]

Defined in:
[opds/model/Feed.ts:32](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Feed.ts#L32)

### Methods

#### serialize()

> **serialize**(): [`OPDSFeed`](#opdsfeed)

Defined in:
[opds/model/Feed.ts:122](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Feed.ts#L122)

##### Returns

[`OPDSFeed`](#opdsfeed)

#### deserialize()

> `static` **deserialize**(`json`, `options`):
> [`Result`](#result)\<[`Feed`](#feed)\>

Defined in:
[opds/model/Feed.ts:60](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Feed.ts#L60)

parses a feed from its OPDS2 JSON. unlike @readium/shared's `deserialize` this
never silently returns undefined or drops invalid entries, it returns a
[Result](#result) that locates every problem. with `options.validate` it reports
the full set of schema errors, without it only cheap structural checks run

##### Parameters

| Parameter | Type                                        |
| --------- | ------------------------------------------- |
| `json`    | `unknown`                                   |
| `options` | [`DeserializeOptions`](#deserializeoptions) |

##### Returns

[`Result`](#result)\<[`Feed`](#feed)\>

---

## FeedMetadata

Defined in:
[opds/model/FeedMetadata.ts:8](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/FeedMetadata.ts#L8)

Feed-level metadata

See
[https://specs.opds.io/schema/feed-metadata.schema.json](https://specs.opds.io/schema/feed-metadata.schema.json)

### Constructors

#### Constructor

> **new FeedMetadata**(`values`): [`FeedMetadata`](#feedmetadata-1)

Defined in:
[opds/model/FeedMetadata.ts:21](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/FeedMetadata.ts#L21)

##### Parameters

| Parameter               | Type                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `values`                | \{ `currentPage?`: `number`; `description?`: `string`; `extra?`: `Record`\<`string`, `unknown`\>; `identifier?`: `string`; `itemsPerPage?`: `number`; `modified?`: `string`; `numberOfItems?`: `number`; `subtitle?`: `string` \| \{ \} \| `unknown`[]; `title`: `string` \| \{ \} \| `unknown`[]; `type?`: `string`; \} |
| `values.currentPage?`   | `number`                                                                                                                                                                                                                                                                                                                 |
| `values.description?`   | `string`                                                                                                                                                                                                                                                                                                                 |
| `values.extra?`         | `Record`\<`string`, `unknown`\>                                                                                                                                                                                                                                                                                          |
| `values.identifier?`    | `string`                                                                                                                                                                                                                                                                                                                 |
| `values.itemsPerPage?`  | `number`                                                                                                                                                                                                                                                                                                                 |
| `values.modified?`      | `string`                                                                                                                                                                                                                                                                                                                 |
| `values.numberOfItems?` | `number`                                                                                                                                                                                                                                                                                                                 |
| `values.subtitle?`      | `string` \| \{ \} \| `unknown`[]                                                                                                                                                                                                                                                                                         |
| `values.title`          | `string` \| \{ \} \| `unknown`[]                                                                                                                                                                                                                                                                                         |
| `values.type?`          | `string`                                                                                                                                                                                                                                                                                                                 |

##### Returns

[`FeedMetadata`](#feedmetadata-1)

### Properties

#### currentPage?

> `readonly` `optional` **currentPage**: `number`

Defined in:
[opds/model/FeedMetadata.ts:16](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/FeedMetadata.ts#L16)

#### description?

> `readonly` `optional` **description**: `string`

Defined in:
[opds/model/FeedMetadata.ts:14](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/FeedMetadata.ts#L14)

#### extra?

> `readonly` `optional` **extra**: `Record`\<`string`, `unknown`\>

Defined in:
[opds/model/FeedMetadata.ts:19](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/FeedMetadata.ts#L19)

any properties outside the known set, preserved on round-trip

#### identifier?

> `readonly` `optional` **identifier**: `string`

Defined in:
[opds/model/FeedMetadata.ts:10](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/FeedMetadata.ts#L10)

#### itemsPerPage?

> `readonly` `optional` **itemsPerPage**: `number`

Defined in:
[opds/model/FeedMetadata.ts:15](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/FeedMetadata.ts#L15)

#### modified?

> `readonly` `optional` **modified**: `string`

Defined in:
[opds/model/FeedMetadata.ts:13](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/FeedMetadata.ts#L13)

#### numberOfItems?

> `readonly` `optional` **numberOfItems**: `number`

Defined in:
[opds/model/FeedMetadata.ts:17](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/FeedMetadata.ts#L17)

#### subtitle?

> `readonly` `optional` **subtitle**: `string` \| \{ \} \| `unknown`[]

Defined in:
[opds/model/FeedMetadata.ts:12](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/FeedMetadata.ts#L12)

#### title

> `readonly` **title**: `string` \| \{ \} \| `unknown`[]

Defined in:
[opds/model/FeedMetadata.ts:9](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/FeedMetadata.ts#L9)

#### type?

> `readonly` `optional` **type**: `string`

Defined in:
[opds/model/FeedMetadata.ts:11](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/FeedMetadata.ts#L11)

### Methods

#### serialize()

> **serialize**(): `OPDSMetadata`

Defined in:
[opds/model/FeedMetadata.ts:72](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/FeedMetadata.ts#L72)

##### Returns

`OPDSMetadata`

#### deserialize()

> `static` **deserialize**(`json`): [`FeedMetadata`](#feedmetadata-1)

Defined in:
[opds/model/FeedMetadata.ts:45](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/FeedMetadata.ts#L45)

##### Parameters

| Parameter | Type           |
| --------- | -------------- |
| `json`    | `OPDSMetadata` |

##### Returns

[`FeedMetadata`](#feedmetadata-1)

---

## Group

Defined in:
[opds/model/Group.ts:14](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Group.ts#L14)

A Group curates publications or navigation links under a shared heading

### Constructors

#### Constructor

> **new Group**(`values`): [`Group`](#group)

Defined in:
[opds/model/Group.ts:20](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Group.ts#L20)

##### Parameters

| Parameter              | Type                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `values`               | \{ `links?`: `Links`; `metadata`: [`FeedMetadata`](#feedmetadata-1); `navigation?`: `Links`; `publications?`: [`OPDSPublication`](#opdspublication)[]; \} |
| `values.links?`        | `Links`                                                                                                                                                   |
| `values.metadata`      | [`FeedMetadata`](#feedmetadata-1)                                                                                                                         |
| `values.navigation?`   | `Links`                                                                                                                                                   |
| `values.publications?` | [`OPDSPublication`](#opdspublication)[]                                                                                                                   |

##### Returns

[`Group`](#group)

### Properties

#### links?

> `readonly` `optional` **links**: `Links`

Defined in:
[opds/model/Group.ts:16](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Group.ts#L16)

#### metadata

> `readonly` **metadata**: [`FeedMetadata`](#feedmetadata-1)

Defined in:
[opds/model/Group.ts:15](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Group.ts#L15)

#### navigation?

> `readonly` `optional` **navigation**: `Links`

Defined in:
[opds/model/Group.ts:18](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Group.ts#L18)

#### publications?

> `readonly` `optional` **publications**:
> [`OPDSPublication`](#opdspublication)[]

Defined in:
[opds/model/Group.ts:17](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Group.ts#L17)

### Methods

#### serialize()

> **serialize**(): `object`

Defined in:
[opds/model/Group.ts:58](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Group.ts#L58)

##### Returns

###### links?

> `optional` **links**: \[`Link`, `...Link[]`\]

###### Min Items

1

###### metadata

> **metadata**: `OPDSMetadata`

###### navigation?

> `optional` **navigation**: \[`Link`, `...Link[]`\]

###### Min Items

1

###### publications?

> `optional` **publications**: \[[`OPDSPublicationJSON`](#opdspublicationjson),
> `...OPDSPublicationJSON[]`\]

###### Min Items

1

#### deserialize()

> `static` **deserialize**(`json`, `path`):
> [`Result`](#result)\<[`Group`](#group)\>

Defined in:
[opds/model/Group.ts:32](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Group.ts#L32)

##### Parameters

| Parameter            | Type                                                                                                                                                                                                         | Default value | Description     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | --------------- |
| `json`               | \{ `links?`: \[`Link`, `...Link[]`\]; `metadata`: `OPDSMetadata`; `navigation?`: \[`Link`, `...Link[]`\]; `publications?`: \[[`OPDSPublicationJSON`](#opdspublicationjson), `...OPDSPublicationJSON[]`\]; \} | `undefined`   | -               |
| `json.links?`        | \[`Link`, `...Link[]`\]                                                                                                                                                                                      | `undefined`   | **Min Items** 1 |
| `json.metadata`      | `OPDSMetadata`                                                                                                                                                                                               | `undefined`   | -               |
| `json.navigation?`   | \[`Link`, `...Link[]`\]                                                                                                                                                                                      | `undefined`   | **Min Items** 1 |
| `json.publications?` | \[[`OPDSPublicationJSON`](#opdspublicationjson), `...OPDSPublicationJSON[]`\]                                                                                                                                | `undefined`   | **Min Items** 1 |
| `path`               | `string`                                                                                                                                                                                                     | `""`          | -               |

##### Returns

[`Result`](#result)\<[`Group`](#group)\>

---

## Holds

Defined in: node_modules/@readium/shared/types/src/opds/Holds.d.ts:6

Library-specific features when a specific book is unavailable but provides a
hold list.

https://drafts.opds.io/schema/properties.schema.json

### Constructors

#### Constructor

> **new Holds**(`values`): [`Holds`](#holds)

Defined in: node_modules/@readium/shared/types/src/opds/Holds.d.ts:10

Creates a [Price].

##### Parameters

| Parameter          | Type                                             |
| ------------------ | ------------------------------------------------ |
| `values`           | \{ `position?`: `number`; `total?`: `number`; \} |
| `values.position?` | `number`                                         |
| `values.total?`    | `number`                                         |

##### Returns

[`Holds`](#holds)

### Properties

#### position?

> `optional` **position**: `number`

Defined in: node_modules/@readium/shared/types/src/opds/Holds.d.ts:8

#### total?

> `optional` **total**: `number`

Defined in: node_modules/@readium/shared/types/src/opds/Holds.d.ts:7

### Methods

#### serialize()

> **serialize**(): `any`

Defined in: node_modules/@readium/shared/types/src/opds/Holds.d.ts:21

Serializes a [Holds] to its RWPM JSON representation.

##### Returns

`any`

#### deserialize()

> `static` **deserialize**(`json`): `undefined` \| [`Holds`](#holds)

Defined in: node_modules/@readium/shared/types/src/opds/Holds.d.ts:17

Parses a [Holds] from its RWPM JSON representation.

##### Parameters

| Parameter | Type  |
| --------- | ----- |
| `json`    | `any` |

##### Returns

`undefined` \| [`Holds`](#holds)

---

## NavigationLink

Defined in:
[opds/model/NavigationLinks.ts:31](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/NavigationLinks.ts#L31)

Same as Link but with a required title Since this extends Link, it does not
follow the same Result pattern as other models.

### Extends

- `Link`

### Constructors

#### Constructor

> **new NavigationLink**(`values`): [`NavigationLink`](#navigationlink)

Defined in:
[opds/model/NavigationLinks.ts:33](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/NavigationLinks.ts#L33)

##### Parameters

| Parameter | Type                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `values`  | `Omit`\<\{ `alternates?`: `Links`; `bitrate?`: `number`; `children?`: `Links`; `duration?`: `number`; `height?`: `number`; `href`: `string`; `languages?`: `string`[]; `properties?`: `Properties`; `rels?`: `Set`\<`string`\>; `size?`: `number`; `templated?`: `boolean`; `title?`: `string`; `type?`: `string`; `width?`: `number`; \}, `"title"`\> & `object` |

##### Returns

[`NavigationLink`](#navigationlink)

##### Overrides

`Link.constructor`

### Properties

#### alternates?

> `readonly` `optional` **alternates**: `Links`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:34

Alternate resources for the linked resource.

##### Inherited from

`Link.alternates`

#### bitrate?

> `readonly` `optional` **bitrate**: `number`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:30

Bitrate of the linked resource in kbps.

##### Inherited from

`Link.bitrate`

#### children?

> `readonly` `optional` **children**: `Links`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:36

Resources that are children of the linked resource, in the context of a given
collection role.

##### Inherited from

`Link.children`

#### duration?

> `readonly` `optional` **duration**: `number`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:28

Length of the linked resource in seconds.

##### Inherited from

`Link.duration`

#### height?

> `readonly` `optional` **height**: `number`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:22

Height of the linked resource in pixels.

##### Inherited from

`Link.height`

#### href

> `readonly` **href**: `string`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:10

URI or URI template of the linked resource.

##### Inherited from

`Link.href`

#### languages?

> `readonly` `optional` **languages**: `string`[]

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:32

Expected language of the linked resource.

##### Inherited from

`Link.languages`

#### properties?

> `optional` **properties**: `Properties`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:20

Properties associated to the linked resource.

##### Inherited from

`Link.properties`

#### rels?

> `readonly` `optional` **rels**: `Set`\<`string`\>

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:18

Relation between the linked resource and its containing collection.

##### Inherited from

`Link.rels`

#### size?

> `readonly` `optional` **size**: `number`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:26

Size of the linked resource in bytes.

##### Inherited from

`Link.size`

#### templated?

> `readonly` `optional` **templated**: `boolean`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:12

Indicates that a URI template is used in href.

##### Inherited from

`Link.templated`

#### title?

> `readonly` `optional` **title**: `string`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:16

Title of the linked resource.

##### Inherited from

`Link.title`

#### type?

> `readonly` `optional` **type**: `string`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:14

MIME type of the linked resource.

##### Inherited from

`Link.type`

#### width?

> `readonly` `optional` **width**: `number`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:24

Width of the linked resource in pixels.

##### Inherited from

`Link.width`

### Accessors

#### locator

##### Get Signature

> **get** **locator**(): `Locator`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:87

Creates a [Locator] from a reading order [Link].

###### Returns

`Locator`

##### Inherited from

`Link.locator`

#### mediaType

##### Get Signature

> **get** **mediaType**(): `MediaType`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:65

MediaType of the linked resource.

###### Returns

`MediaType`

##### Inherited from

`Link.mediaType`

#### templateParameters

##### Get Signature

> **get** **templateParameters**(): `Set`\<`string`\>

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:71

List of URI template parameter keys, if the `Link` is templated.

###### Returns

`Set`\<`string`\>

##### Inherited from

`Link.templateParameters`

### Methods

#### addProperties()

> **addProperties**(`properties`): `Link`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:81

Makes a copy of this [Link] after merging in the given additional other
[properties].

##### Parameters

| Parameter    | Type                           |
| ------------ | ------------------------------ |
| `properties` | \{[`key`: `string`]: `any`; \} |

##### Returns

`Link`

##### Inherited from

`Link.addProperties`

#### expandTemplate()

> **expandTemplate**(`parameters`): `Link`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:75

Expands the `Link`'s HREF by replacing URI template variables by the given
parameters. See RFC 6570 on URI template: https://tools.ietf.org/html/rfc6570

##### Parameters

| Parameter    | Type                                |
| ------------ | ----------------------------------- |
| `parameters` | \{[`param`: `string`]: `string`; \} |

##### Returns

`Link`

##### Inherited from

`Link.expandTemplate`

#### serialize()

> **serialize**(): `any`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:63

Serializes a [Link] to its RWPM JSON representation.

##### Returns

`any`

##### Inherited from

`Link.serialize`

#### toURL()

> **toURL**(`baseUrl?`): `undefined` \| `string`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:69

Computes an absolute URL to the link, relative to the given `baseURL`. If the
link's `href` is already absolute, the `baseURL` is ignored.

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `baseUrl?` | `string` |

##### Returns

`undefined` \| `string`

##### Inherited from

`Link.toURL`

#### deserialize()

> `static` **deserialize**(`json`): `undefined` \| >
> [`NavigationLink`](#navigationlink)

Defined in:
[opds/model/NavigationLinks.ts:41](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/NavigationLinks.ts#L41)

Parses a [Link] from its RWPM JSON representation.

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `json`    | `unknown` |

##### Returns

`undefined` \| [`NavigationLink`](#navigationlink)

##### Overrides

`Link.deserialize`

---

## NavigationLinks

Defined in:
[opds/model/NavigationLinks.ts:7](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/NavigationLinks.ts#L7)

A collection of [NavigationLink](#navigationlink)s Since this extends Links, it
does not follow the same Result pattern as other models.

### Extends

- `Links`

### Constructors

#### Constructor

> **new NavigationLinks**(`links`): [`NavigationLinks`](#navigationlinks)

Defined in:
[opds/model/NavigationLinks.ts:8](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/NavigationLinks.ts#L8)

##### Parameters

| Parameter | Type                                  |
| --------- | ------------------------------------- |
| `links`   | [`NavigationLink`](#navigationlink)[] |

##### Returns

[`NavigationLinks`](#navigationlinks)

##### Overrides

`Links.constructor`

### Properties

#### items

> **items**: `Link`[]

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:93

##### Inherited from

`Links.items`

#### links

> **links**: [`NavigationLink`](#navigationlink)[]

Defined in:
[opds/model/NavigationLinks.ts:8](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/NavigationLinks.ts#L8)

### Methods

#### everyIsAudio()

> **everyIsAudio**(): `boolean`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:121

Returns whether all the resources in the collection are audio clips.

##### Returns

`boolean`

##### Inherited from

`Links.everyIsAudio`

#### everyIsBitmap()

> **everyIsBitmap**(): `boolean`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:123

Returns whether all the resources in the collection are bitmaps.

##### Returns

`boolean`

##### Inherited from

`Links.everyIsBitmap`

#### everyIsHTML()

> **everyIsHTML**(): `boolean`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:125

Returns whether all the resources in the collection are HTML documents.

##### Returns

`boolean`

##### Inherited from

`Links.everyIsHTML`

#### everyIsVideo()

> **everyIsVideo**(): `boolean`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:127

Returns whether all the resources in the collection are video clips.

##### Returns

`boolean`

##### Inherited from

`Links.everyIsVideo`

#### everyMatchesMediaType()

> **everyMatchesMediaType**(`mediaTypes`): `boolean`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:129

Returns whether all the resources in the collection are matching any of the
given media types.

##### Parameters

| Parameter    | Type                   |
| ------------ | ---------------------- |
| `mediaTypes` | `string` \| `string`[] |

##### Returns

`boolean`

##### Inherited from

`Links.everyMatchesMediaType`

#### filterByMediaType()

> **filterByMediaType**(`mediaType`): `Link`[]

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:117

Finds all the links matching the given media type.

##### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `mediaType` | `string` |

##### Returns

`Link`[]

##### Inherited from

`Links.filterByMediaType`

#### filterByMediaTypes()

> **filterByMediaTypes**(`mediaTypes`): `Link`[]

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:119

Finds all the links matching any of the given media types.

##### Parameters

| Parameter    | Type       |
| ------------ | ---------- |
| `mediaTypes` | `string`[] |

##### Returns

`Link`[]

##### Inherited from

`Links.filterByMediaTypes`

#### filterByRel()

> **filterByRel**(`rel`): `Link`[]

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:109

Finds all the links with the given relation.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `rel`     | `string` |

##### Returns

`Link`[]

##### Inherited from

`Links.filterByRel`

#### filterLinksHasType()

> **filterLinksHasType**(): `Link`[]

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:130

##### Returns

`Link`[]

##### Inherited from

`Links.filterLinksHasType`

#### findIndexWithHref()

> **findIndexWithHref**(`href`): `number`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:113

Finds the index of the first link matching the given HREF.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `href`    | `string` |

##### Returns

`number`

##### Inherited from

`Links.findIndexWithHref`

#### findWithHref()

> **findWithHref**(`href`): `undefined` \| `Link`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:111

Finds the first link matching the given HREF.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `href`    | `string` |

##### Returns

`undefined` \| `Link`

##### Inherited from

`Links.findWithHref`

#### findWithMediaType()

> **findWithMediaType**(`mediaType`): `undefined` \| `Link`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:115

Finds the first link matching the given media type.

##### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `mediaType` | `string` |

##### Returns

`undefined` \| `Link`

##### Inherited from

`Links.findWithMediaType`

#### findWithRel()

> **findWithRel**(`rel`): `undefined` \| `Link`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:107

Finds the first link with the given relation.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `rel`     | `string` |

##### Returns

`undefined` \| `Link`

##### Inherited from

`Links.findWithRel`

#### serialize()

> **serialize**(): `any`

Defined in: node_modules/@readium/shared/types/src/publication/Link.d.ts:105

Serializes an array of [Link] to its RWPM JSON representation.

##### Returns

`any`

##### Inherited from

`Links.serialize`

#### deserialize()

> `static` **deserialize**(`json`): `undefined` \| >
> [`NavigationLinks`](#navigationlinks)

Defined in:
[opds/model/NavigationLinks.ts:11](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/NavigationLinks.ts#L11)

Creates a list of [Link] from its RWPM JSON representation.

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `json`    | `unknown` |

##### Returns

`undefined` \| [`NavigationLinks`](#navigationlinks)

##### Overrides

`Links.deserialize`

---

## OPDSPublication

Defined in:
[opds/model/OPDSPublication.ts:48](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/OPDSPublication.ts#L48)

A publication entry in an OPDS feed

See
[https://specs.opds.io/schema/publication.schema.json](https://specs.opds.io/schema/publication.schema.json)

### Constructors

#### Constructor

> **new OPDSPublication**(`values`): [`OPDSPublication`](#opdspublication)

Defined in:
[opds/model/OPDSPublication.ts:53](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/OPDSPublication.ts#L53)

##### Parameters

| Parameter         | Type                                                                |
| ----------------- | ------------------------------------------------------------------- |
| `values`          | \{ `images?`: `Links`; `links`: `Links`; `metadata`: `Metadata`; \} |
| `values.images?`  | `Links`                                                             |
| `values.links`    | `Links`                                                             |
| `values.metadata` | `Metadata`                                                          |

##### Returns

[`OPDSPublication`](#opdspublication)

### Properties

#### images?

> `readonly` `optional` **images**: `Links`

Defined in:
[opds/model/OPDSPublication.ts:51](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/OPDSPublication.ts#L51)

#### links

> `readonly` **links**: `Links`

Defined in:
[opds/model/OPDSPublication.ts:50](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/OPDSPublication.ts#L50)

#### metadata

> `readonly` **metadata**: `Metadata`

Defined in:
[opds/model/OPDSPublication.ts:49](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/OPDSPublication.ts#L49)

### Methods

#### serialize()

> **serialize**(): [`OPDSPublicationJSON`](#opdspublicationjson)

Defined in:
[opds/model/OPDSPublication.ts:106](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/OPDSPublication.ts#L106)

##### Returns

[`OPDSPublicationJSON`](#opdspublicationjson)

#### deserialize()

> `static` **deserialize**(`json`, `path`):
> [`Result`](#result)\<[`OPDSPublication`](#opdspublication)\>

Defined in:
[opds/model/OPDSPublication.ts:59](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/OPDSPublication.ts#L59)

##### Parameters

| Parameter | Type                                          |
| --------- | --------------------------------------------- |
| `json`    | [`OPDSPublicationJSON`](#opdspublicationjson) |
| `path`    | `string`                                      |

##### Returns

[`Result`](#result)\<[`OPDSPublication`](#opdspublication)\>

---

## Price

Defined in: node_modules/@readium/shared/types/src/opds/Price.d.ts:10

The price of a publication in an OPDS link.

https://drafts.opds.io/schema/properties.schema.json

currency Currency for the price, eg. EUR. value Price value, should only be used
for display purposes, because of precision issues inherent with Double and the
JSON parsing.

### Constructors

#### Constructor

> **new Price**(`values`): [`Price`](#price)

Defined in: node_modules/@readium/shared/types/src/opds/Price.d.ts:17

Creates a [Price].

##### Parameters

| Parameter         | Type                                           |
| ----------------- | ---------------------------------------------- |
| `values`          | \{ `currency`: `string`; `value`: `number`; \} |
| `values.currency` | `string`                                       |
| `values.value`    | `number`                                       |

##### Returns

[`Price`](#price)

### Properties

#### currency

> **currency**: `string`

Defined in: node_modules/@readium/shared/types/src/opds/Price.d.ts:12

Currency for the price, eg. EUR.

#### value

> **value**: `number`

Defined in: node_modules/@readium/shared/types/src/opds/Price.d.ts:15

Price value, should only be used for display purposes, because of precision
issues inherent with Double and the JSON parsing.

### Methods

#### serialize()

> **serialize**(): `any`

Defined in: node_modules/@readium/shared/types/src/opds/Price.d.ts:28

Serializes a [Price] to its RWPM JSON representation.

##### Returns

`any`

#### deserialize()

> `static` **deserialize**(`json`): `undefined` \| [`Price`](#price)

Defined in: node_modules/@readium/shared/types/src/opds/Price.d.ts:24

Parses a [Price] from its RWPM JSON representation.

##### Parameters

| Parameter | Type  |
| --------- | ----- |
| `json`    | `any` |

##### Returns

`undefined` \| [`Price`](#price)

---

## AjvErrorLike

Defined in:
[opds/result.ts:25](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/result.ts#L25)

the shape of an ajv error object, typed structurally so the core never imports
ajv

### Properties

#### instancePath?

> `optional` **instancePath**: `string`

Defined in:
[opds/result.ts:26](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/result.ts#L26)

#### keyword?

> `optional` **keyword**: `string`

Defined in:
[opds/result.ts:28](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/result.ts#L28)

#### message?

> `optional` **message**: `string`

Defined in:
[opds/result.ts:27](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/result.ts#L27)

---

## AuthFlow

Defined in:
[opds/model/auth/AuthDocument.ts:16](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L16)

### Properties

#### labels?

> `optional` **labels**: `object`

Defined in:
[opds/model/auth/AuthDocument.ts:19](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L19)

##### login?

> `optional` **login**: `string`

##### password?

> `optional` **password**: `string`

#### links?

> `optional` **links**: `Links`

Defined in:
[opds/model/auth/AuthDocument.ts:18](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L18)

#### type

> **type**: `string`

Defined in:
[opds/model/auth/AuthDocument.ts:17](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L17)

---

## DeserializeOptions

Defined in:
[opds/model/Feed.ts:12](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Feed.ts#L12)

### Properties

#### validate()?

> `optional` **validate**: (`json`) => `null` \| [`OPDSError`](#opdserror)[]

Defined in:
[opds/model/Feed.ts:19](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/Feed.ts#L19)

runs before construction, returns the schema errors (with JSON pointer paths) or
null when valid. pass `validateFeed` from `@storyteller/opds/validate`
for full AJV validation, omit it to (mostly) trust the input

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `json`    | `unknown` |

##### Returns

`null` \| [`OPDSError`](#opdserror)[]

---

## OPDSAuthenticationDocument

Defined in:
[opds/types/authentication.ts:9](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/authentication.ts#L9)

### Properties

#### authentication

> **authentication**: `object`[]

Defined in:
[opds/types/authentication.ts:26](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/authentication.ts#L26)

A list of supported Authentication Flows

##### labels?

> `optional` **labels**: `object`

###### labels.login?

> `optional` **login**: `string`

###### labels.password?

> `optional` **password**: `string`

##### links?

> `optional` **links**: `Link`[]

##### type

> **type**: `string`

#### description?

> `optional` **description**: `string`

Defined in:
[opds/types/authentication.ts:21](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/authentication.ts#L21)

A description of the service being displayed to the user

#### id

> **id**: `string`

Defined in:
[opds/types/authentication.ts:17](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/authentication.ts#L17)

Unique identifier for the Catalog provider and canonical location for the
Authentication Document

#### links?

> `optional` **links**: `Link`[]

Defined in:
[opds/types/authentication.ts:22](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/authentication.ts#L22)

#### title

> **title**: `string`

Defined in:
[opds/types/authentication.ts:13](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/authentication.ts#L13)

Title of the Catalog being accessed

---

## OPDSError

Defined in:
[opds/result.ts:5](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/result.ts#L5)

a deserialize result that, unlike @readium/shared's `T | undefined`, says what
went wrong and where. paths are JSON pointers into the source document

### Properties

#### keyword

> **keyword**: `string`

Defined in:
[opds/result.ts:10](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/result.ts#L10)

the failing rule, e.g. "required" | "type" | "format"

#### message

> **message**: `string`

Defined in:
[opds/result.ts:8](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/result.ts#L8)

#### path

> **path**: `string`

Defined in:
[opds/result.ts:7](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/result.ts#L7)

JSON pointer to the offending value, e.g. "/publications/3/links/0/href"

---

## OPDSProgressionDocument

Defined in:
[opds/types/progression.ts:7](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/progression.ts#L7)

GENERATED by schemas/sync.ts from the OPDS/Readium JSON Schemas. DO NOT EDIT BY
HAND. run `yarn schemas:sync` to regenerate.

### Properties

#### device

> **device**: `object`

Defined in:
[opds/types/progression.ts:10](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/progression.ts#L10)

##### id

> **id**: `string`

##### name

> **name**: `string`

#### modified

> **modified**: `string`

Defined in:
[opds/types/progression.ts:9](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/progression.ts#L9)

#### progression

> **progression**: `number`

Defined in:
[opds/types/progression.ts:14](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/progression.ts#L14)

#### references?

> `optional` **references**: `string`[]

Defined in:
[opds/types/progression.ts:15](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/progression.ts#L15)

#### title?

> `optional` **title**: `string`

Defined in:
[opds/types/progression.ts:8](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/progression.ts#L8)

---

## OPDSPublicationJSON

Defined in:
[opds/types/feed.ts:527](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/feed.ts#L527)

### Properties

#### images?

> `optional` **images**: \[`Link`, `...Link[]`\]

Defined in:
[opds/types/feed.ts:535](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/feed.ts#L535)

Images are meant to be displayed to the user when browsing publications

##### Min Items

1

#### links

> **links**: `Link`[]

Defined in:
[opds/types/feed.ts:529](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/feed.ts#L529)

#### metadata

> **metadata**: `Metadata`

Defined in:
[opds/types/feed.ts:528](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/feed.ts#L528)

---

## ToAtomXmlOptions

Defined in:
[opds/serialize/atom.ts:164](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/serialize/atom.ts#L164)

### Properties

#### pretty?

> `optional` **pretty**: `boolean`

Defined in:
[opds/serialize/atom.ts:166](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/serialize/atom.ts#L166)

pretty-print with indentation, defaults to true

---

## OPDSFeed

> **OPDSFeed** = `object`

Defined in:
[opds/types/feed.ts:7](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/feed.ts#L7)

GENERATED by schemas/sync.ts from the OPDS/Readium JSON Schemas. DO NOT EDIT BY
HAND. run `yarn schemas:sync` to regenerate.

### Indexable

\[`k`: `string`\]: `unknown`

### Properties

#### facets?

> `optional` **facets**: \[\{ `links?`: \[`Link`, `...Link[]`\]; `metadata?`:
> `OPDSMetadata`; \},
> `...{ links?: [Link, ...Link[]]; metadata?: OPDSMetadata }[]`\]

Defined in:
[opds/types/feed.ts:32](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/feed.ts#L32)

Facets are meant to re-order or obtain a subset for the current list of
publications

##### Min Items

1

#### groups?

> `optional` **groups**: `object`[]

Defined in:
[opds/types/feed.ts:51](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/feed.ts#L51)

Groups provide a curated experience, grouping publications or navigation links
together

##### links?

> `optional` **links**: \[`Link`, `...Link[]`\]

###### Min Items

1

##### metadata

> **metadata**: `OPDSMetadata`

##### navigation?

> `optional` **navigation**: \[`Link`, `...Link[]`\]

###### Min Items

1

##### publications?

> `optional` **publications**: \[[`OPDSPublicationJSON`](#opdspublicationjson),
> `...OPDSPublicationJSON[]`\]

###### Min Items

1

#### links

> **links**: \[`Link`, `...Link[]`\]

Defined in:
[opds/types/feed.ts:14](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/feed.ts#L14)

Feed-level links such as search or pagination

##### Min Items

1

#### metadata

> **metadata**: `OPDSMetadata`

Defined in:
[opds/types/feed.ts:8](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/feed.ts#L8)

#### navigation?

> `optional` **navigation**: \[`Link`, `...Link[]`\]

Defined in:
[opds/types/feed.ts:26](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/feed.ts#L26)

Navigation for the catalog using links

##### Min Items

1

#### publications?

> `optional` **publications**: \[[`OPDSPublicationJSON`](#opdspublicationjson),
> `...OPDSPublicationJSON[]`\]

Defined in:
[opds/types/feed.ts:20](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/types/feed.ts#L20)

A list of publications that can be acquired

##### Min Items

1

---

## Result\<T\>

> **Result**\<`T`\> = \{ `ok`: `true`; `value`: `T`; \} \| \{ `errors`:
> [`OPDSError`](#opdserror)[]; `ok`: `false`; \}

Defined in:
[opds/result.ts:13](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/result.ts#L13)

### Type Parameters

| Type Parameter |
| -------------- |
| `T`            |

---

## ACQUISITION_RELS

> `const` **ACQUISITION_RELS**: `object`

Defined in:
[opds/model/constants.ts:11](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/constants.ts#L11)

all valid acquisition rels as an "enum"

### Type Declaration

#### acquisition

> `readonly` **acquisition**: `"http://opds-spec.org/acquisition"` =
> `"http://opds-spec.org/acquisition"`

#### borrow

> `readonly` **borrow**: `"http://opds-spec.org/acquisition/borrow"` =
> `"http://opds-spec.org/acquisition/borrow"`

#### buy

> `readonly` **buy**: `"http://opds-spec.org/acquisition/buy"` =
> `"http://opds-spec.org/acquisition/buy"`

#### download

> `readonly` **download**: `"http://opds-spec.org/acquisition/open-access"` =
> `"http://opds-spec.org/acquisition/open-access"`

#### preview

> `readonly` **preview**: `"http://opds-spec.org/acquisition/sample"` =
> `"http://opds-spec.org/acquisition/sample"`

#### subscribe

> `readonly` **subscribe**: `"http://opds-spec.org/acquisition/subscribe"` =
> `"http://opds-spec.org/acquisition/subscribe"`

---

## ACQUISITION_RELS_ARRAY

> `const` **ACQUISITION_RELS_ARRAY**: `string`[]

Defined in:
[opds/model/constants.ts:23](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/constants.ts#L23)

all valid acquisition rels as an array

---

## ATOM_ACQ

> `const` **ATOM_ACQ**:
> `"application/atom+xml;profile=opds-catalog;kind=acquisition"`

Defined in:
[opds/model/constants.ts:3](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/constants.ts#L3)

---

## ATOM_NAV

> `const` **ATOM_NAV**:
> `"application/atom+xml;profile=opds-catalog;kind=navigation"`

Defined in:
[opds/model/constants.ts:1](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/constants.ts#L1)

---

## AuthFlowType

> `const` **AuthFlowType**: `object`

Defined in:
[opds/model/auth/AuthDocument.ts:10](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L10)

well-known OPDS authentication flow type URIs

### Type Declaration

#### basic

> `readonly` **basic**: `"http://opds-spec.org/auth/basic"` =
> `"http://opds-spec.org/auth/basic"`

#### oauthImplicit

> `readonly` **oauthImplicit**: `"http://opds-spec.org/auth/oauth/implicit"` =
> `"http://opds-spec.org/auth/oauth/implicit"`

#### oauthPassword

> `readonly` **oauthPassword**: `"http://opds-spec.org/auth/oauth/password"` =
> `"http://opds-spec.org/auth/oauth/password"`

---

## OPDS_JSON

> `const` **OPDS_JSON**: `"application/opds+json"`

Defined in:
[opds/model/constants.ts:5](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/constants.ts#L5)

---

## OPDS_PUBLICATION_JSON

> `const` **OPDS_PUBLICATION_JSON**: `"application/opds-publication+json"` =
> `"application/opds-publication+json"`

Defined in:
[opds/model/constants.ts:6](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/constants.ts#L6)

---

## THUMBNAIL_REL

> `const` **THUMBNAIL_REL**: `"http://opds-spec.org/image/thumbnail"`

Defined in:
[opds/model/constants.ts:28](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/constants.ts#L28)

---

## basic()

> **basic**(`labels?`): [`AuthFlow`](#authflow)

Defined in:
[opds/model/auth/AuthDocument.ts:23](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L23)

HTTP basic auth flow

### Parameters

| Parameter          | Type                                             |
| ------------------ | ------------------------------------------------ |
| `labels?`          | \{ `login?`: `string`; `password?`: `string`; \} |
| `labels.login?`    | `string`                                         |
| `labels.password?` | `string`                                         |

### Returns

[`AuthFlow`](#authflow)

---

## err()

> **err**(`errors`): [`Result`](#result)\<`never`\>

Defined in:
[opds/result.ts:19](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/result.ts#L19)

### Parameters

| Parameter | Type                        |
| --------- | --------------------------- |
| `errors`  | [`OPDSError`](#opdserror)[] |

### Returns

[`Result`](#result)\<`never`\>

---

## oauthImplicit()

> **oauthImplicit**(`authenticate`): [`AuthFlow`](#authflow)

Defined in:
[opds/model/auth/AuthDocument.ts:45](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L45)

OAuth implicit flow, `authenticate` is the authorization page

### Parameters

| Parameter      | Type     |
| -------------- | -------- |
| `authenticate` | `string` |

### Returns

[`AuthFlow`](#authflow)

---

## oauthPassword()

> **oauthPassword**(`authenticate`, `labels?`): [`AuthFlow`](#authflow)

Defined in:
[opds/model/auth/AuthDocument.ts:29](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/model/auth/AuthDocument.ts#L29)

OAuth password-grant flow, `authenticate` is the token endpoint

### Parameters

| Parameter          | Type                                             |
| ------------------ | ------------------------------------------------ |
| `authenticate`     | `string`                                         |
| `labels?`          | \{ `login?`: `string`; `password?`: `string`; \} |
| `labels.login?`    | `string`                                         |
| `labels.password?` | `string`                                         |

### Returns

[`AuthFlow`](#authflow)

---

## ok()

> **ok**\<`T`\>(`value`): [`Result`](#result)\<`T`\>

Defined in:
[opds/result.ts:17](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/result.ts#L17)

### Type Parameters

| Type Parameter |
| -------------- |
| `T`            |

### Parameters

| Parameter | Type |
| --------- | ---- |
| `value`   | `T`  |

### Returns

[`Result`](#result)\<`T`\>

---

## toAtomXml()

> **toAtomXml**(`feed`, `options`): `string`

Defined in:
[opds/serialize/atom.ts:170](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/serialize/atom.ts#L170)

renders a [Feed](#feed) as an OPDS 1.2 atom XML document

### Parameters

| Parameter | Type                                    |
| --------- | --------------------------------------- |
| `feed`    | [`Feed`](#feed)                         |
| `options` | [`ToAtomXmlOptions`](#toatomxmloptions) |

### Returns

`string`

---

## toOPDSError()

> **toOPDSError**(`e`): [`OPDSError`](#opdserror)

Defined in:
[opds/result.ts:31](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/opds/result.ts#L31)

### Parameters

| Parameter | Type                            |
| --------- | ------------------------------- |
| `e`       | [`AjvErrorLike`](#ajverrorlike) |

### Returns

[`OPDSError`](#opdserror)
