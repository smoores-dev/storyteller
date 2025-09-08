# @storyteller-platform/epub

A Node.js library for inspecting, modifying, and creating EPUB 3 publications.

<!-- toc -->

- [Installation](#installation)
- [About](#about)
  - [EPUB Basics](#epub-basics)
  - [What this library does](#what-this-library-does)
- [Usage](#usage)
  - [Reading from a file](#reading-from-a-file)
  - [Creating from scratch](#creating-from-scratch)
  - [Adding a chapter](#adding-a-chapter)
  - [Writing to disk](#writing-to-disk)
  - [Writing to a byte array](#writing-to-a-byte-array)
- [Development](#development)
- [API Docs](#api-docs)

<!-- tocstop -->

## Installation

npm:

```sh
npm install @storyteller-platform/epub
```

yarn:

```sh
yarn add @storyteller-platform/epub
```

deno:

```sh
deno install npm:@storyteller-platform/epub
```

## About

Throughout this library's documentation, there will be many references to
[the EPUB 3 specification](https://www.w3.org/TR/epub-33/). The lower level APIs
exposed by this library require some knowledge of this specification. Here we
will cover the very basics necessary to work with the library, but we recommend
that users read through the linked specification to gain a deeper understanding
of the format.

### EPUB Basics

An EPUB file is a ZIP archive with a partially specified directory and file
structure. Most of the metadata and content is specified as XML documents, with
additional resources referenced from those XML documents.

The most important of these documents is the
[package document](https://www.w3.org/TR/epub-33/#sec-package-doc).

> The package document is an XML document that consists of a set of elements
> that each encapsulate information about a particular aspect of an EPUB
> publication. These elements serve to centralize metadata, detail the
> individual resources, and provide the reading order and other information
> necessary for its rendering.

This library is primarily concerned with providing access to the metadata,
manifest, and spine of the EPUB publication. Metadata refers to information
_about_ the publication, such as its title or authors. The manifest refers to
the complete set of resources that are used to render the publication, such as
XHTML documents and image files. And the spine refers to the ordered list of
manifest items that represent the default reading order &mdash; the order that
readers will encounter the manifest items by simply turning pages one at a time.

### What this library does

`@storyteller-platform/epub` provides an API to interact with the metadata,
manifest, and spine of the EPUB publication. There are higher level APIs that
mostly abstract away the implementation details of the EPUB specification, like
`epub.setTitle(title: string)` and `epub.getCreators()`, as well as lower level
APIs like `epub.writeItemContents(path: string, contents: Uint8Array)` and
`epub.addMetadata(entry: MetadataEntry)`, which require some understanding of
the EPUB structure to utilize effectively.

Because EPUB publications rely heavily on the XML document format, this library
also provides utility methods for parsing, manipulating, and building XML
documents. The underlying XML operations are based on
[fast-xml-parser](https://www.npmjs.com/package/fast-xml-parser).

## Usage

The entrypoint to the library is through the [`Epub`](#epub) class. An `Epub`
can either be read from an existing EPUB publication file, or created from
scratch.

### Reading from a file

```ts
import { Epub } from "@storyteller-platform/epub"

const epub = await Epub.from("path/to/book.epub")
console.log(await epub.getTitle())
```

### Creating from scratch

When creating an `Epub` from scratch, the `title`, `language`, and `identifier`
_must_ be provided, as these are required for all publications by the EPUB 3
specification.

Other [Dublin Core](https://www.w3.org/TR/epub-33/#sec-opf-dcmes-hd) and
non-core metadata may also be provided at creation time, or may be added
incrementally after creation.

```ts
import { randomUUID } from "node:crypto"

import { Epub } from "@storyteller-platform/epub"

const epub = await Epub.create({
  title: "S'mores For Everyone",
  // This should be the primary language of the publication.
  // Individual content resources may specify their own languages.
  language: new Intl.Locale("en-US"),
  // This can be any unique identifier, including UUIDs, ISBNs, etc
  identifier: randomUUID(),
})
```

### Adding a chapter

```ts
import { Epub, ManifestItem } from "@storyteller-platform/epub"

const epub = await Epub.from("path/to/book.epub")

// Construct a manifest item describing the chapter
const manifestItem: ManifestItem = {
  id: "chapter-one",
  // This is the filepath for the chapter contents within the
  // EPUB archive.
  href: "XHTML/chapter-one.xhtml",
  mediaType: "application/xhtml+xml",
}

// You can specify the contents as a string
const contents = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="en-US"
      lang="en-US">
  <head></head>
  <body>
    <h1>Chapter 1</h1>
    <p>At first, there were s'mores.</p>
  </body>
</html>`

// Or you can specify the contents as an XML structure
const xmlContents = epub.createXhtmlDocument([
  Epub.createXmlElement("h1", {}, [Epub.createXmlTextNode("Chapter 1")]),
  Epub.createXmlElement("p", {}, [
    Epub.createXmlTextNode("At first, there were s'mores."),
  ]),
])

// First, add the new item to the manifest, and add
// its contents to the publication
await epub.addManifestItem(manifestItem, contents, "utf-8")

// OR, using the XMl:
await epub.addManifestItem(manifestItem, xmlContents, "xml")

// Then add the item to the spine
await epub.addSpineItem(manifestItem.id)
```

### Writing to disk

```ts
import { Epub } from "@storyteller-platform/epub"

const epub = await Epub.from("path/to/book.epub")
await epub.setTitle("S'mores for Everyone")

await epub.writeToFile("path/to/updated.epub")
```

### Writing to a byte array

```ts
import { randomUUID } from "node:crypto"

import { Epub } from "@storyteller-platform/epub"

const epub = await Epub.create({
  title: "S'mores For Everyone",
  language: new Intl.Locale("en-US"),
  identifier: randomUUID(),
})

const data: Uint8Array = await epub.writeToArray()
```

For more details about using the API, see the [API documentation](#epub).

## Development

This package lives in the
[Storyteller monorepo](https://gitlab.com/smoores/storyteller), and is developed
alongside the [Storyteller platform](https://smoores.gitlab.io/storyteller).

To get started with developing in the Storyteller monorepo, check out the
[development guides in the docs](https://smoores.gitlab.io/storyteller/docs/category/development).

## API Docs

## Epub

Defined in:
[epub/node.ts:24](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/node.ts#L24)

### Extends

- `Epub`

### Constructors

#### Constructor

> `protected` **new Epub**(`entries`, `onClose?`): [`Epub`](#epub)

Defined in:
[epub/index.ts:410](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L410)

##### Parameters

| Parameter  | Type                                |
| ---------- | ----------------------------------- |
| `entries`  | `EpubEntry`[]                       |
| `onClose?` | () => `void` \| `Promise`\<`void`\> |

##### Returns

[`Epub`](#epub)

##### Inherited from

`BaseEpub.constructor`

### Properties

#### xhtmlBuilder

> `static` **xhtmlBuilder**: `XMLBuilder`

Defined in:
[epub/index.ts:242](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L242)

##### Inherited from

`BaseEpub.xhtmlBuilder`

#### xhtmlParser

> `static` **xhtmlParser**: `XMLParser`

Defined in:
[epub/index.ts:210](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L210)

##### Inherited from

`BaseEpub.xhtmlParser`

#### xmlBuilder

> `static` **xmlBuilder**: `XMLBuilder`

Defined in:
[epub/index.ts:235](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L235)

##### Inherited from

`BaseEpub.xmlBuilder`

#### xmlParser

> `static` **xmlParser**: `XMLParser`

Defined in:
[epub/index.ts:203](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L203)

##### Inherited from

`BaseEpub.xmlParser`

### Methods

#### addCollection()

> **addCollection**(`collection`, `index?`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1520](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1520)

Add a collection to the EPUB metadata.

If index is provided, the collection will be placed at that index in the list of
collections. Otherwise, it will be added to the end of the list.

##### Parameters

| Parameter    | Type                        |
| ------------ | --------------------------- |
| `collection` | [`Collection`](#collection) |
| `index?`     | `number`                    |

##### Returns

`Promise`\<`void`\>

##### Inherited from

`BaseEpub.addCollection`

#### addContributor()

> **addContributor**(`contributor`, `index?`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1862](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1862)

Add a contributor to the EPUB metadata.

If index is provided, the creator will be placed at that index in the list of
creators. Otherwise, it will be added to the end of the list.

This is a convenience method for
`epub.addCreator(contributor, index, 'contributor')`.

##### Parameters

| Parameter     | Type                      |
| ------------- | ------------------------- |
| `contributor` | [`DcCreator`](#dccreator) |
| `index?`      | `number`                  |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dccreator

##### Inherited from

`BaseEpub.addContributor`

#### addCreator()

> **addCreator**(`creator`, `index?`, `type?`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1707](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1707)

Add a creator to the EPUB metadata.

If index is provided, the creator will be placed at that index in the list of
creators. Otherwise, it will be added to the end of the list.

##### Parameters

| Parameter | Type                           | Default value |
| --------- | ------------------------------ | ------------- |
| `creator` | [`DcCreator`](#dccreator)      | `undefined`   |
| `index?`  | `number`                       | `undefined`   |
| `type?`   | `"creator"` \| `"contributor"` | `"creator"`   |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dccreator

##### Inherited from

`BaseEpub.addCreator`

#### addManifestItem()

##### Call Signature

> **addManifestItem**(`item`, `contents`, `encoding`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2198](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2198)

Create a new manifest item and write its contents to a new entry.

###### Parameters

| Parameter  | Type                            | Description                                                                                                                 |
| ---------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `item`     | [`ManifestItem`](#manifestitem) | -                                                                                                                           |
| `contents` | [`ParsedXml`](#parsedxml)       | The new contents. May be either a parsed XML tree or a unicode string, as determined by the `as` argument.                  |
| `encoding` | `"xml"`                         | Optional - whether to interpret contents as a parsed XML tree, a unicode string, or a byte array. Defaults to a byte array. |

###### Returns

`Promise`\<`void`\>

###### Link

https://www.w3.org/TR/epub-33/#sec-pkg-manifest

###### Link

https://www.w3.org/TR/epub-33/#sec-contentdocs

###### Inherited from

`BaseEpub.addManifestItem`

##### Call Signature

> **addManifestItem**(`item`, `contents`, `encoding`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2203](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2203)

Create a new manifest item and write its contents to a new entry.

###### Parameters

| Parameter  | Type                            | Description                                                                                                                 |
| ---------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `item`     | [`ManifestItem`](#manifestitem) | -                                                                                                                           |
| `contents` | `string`                        | The new contents. May be either a parsed XML tree or a unicode string, as determined by the `as` argument.                  |
| `encoding` | `"utf-8"`                       | Optional - whether to interpret contents as a parsed XML tree, a unicode string, or a byte array. Defaults to a byte array. |

###### Returns

`Promise`\<`void`\>

###### Link

https://www.w3.org/TR/epub-33/#sec-pkg-manifest

###### Link

https://www.w3.org/TR/epub-33/#sec-contentdocs

###### Inherited from

`BaseEpub.addManifestItem`

##### Call Signature

> **addManifestItem**(`item`, `contents`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2208](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2208)

Create a new manifest item and write its contents to a new entry.

###### Parameters

| Parameter  | Type                            | Description                                                                                                |
| ---------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `item`     | [`ManifestItem`](#manifestitem) | -                                                                                                          |
| `contents` | `Uint8Array`                    | The new contents. May be either a parsed XML tree or a unicode string, as determined by the `as` argument. |

###### Returns

`Promise`\<`void`\>

###### Link

https://www.w3.org/TR/epub-33/#sec-pkg-manifest

###### Link

https://www.w3.org/TR/epub-33/#sec-contentdocs

###### Inherited from

`BaseEpub.addManifestItem`

#### addMetadata()

> **addMetadata**(`entry`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2317](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2317)

Add a new metadata entry to the Epub.

This method, like `epub.getMetadata()`, operates on metadata entries. For more
useful semantic representations of metadata, use specific methods such as
`setTitle()` and `setLanguage()`.

##### Parameters

| Parameter | Type                              |
| --------- | --------------------------------- |
| `entry`   | [`MetadataEntry`](#metadataentry) |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-pkg-metadata

##### Inherited from

`BaseEpub.addMetadata`

#### addSpineItem()

> **addSpineItem**(`manifestId`, `index?`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1916](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1916)

Add an item to the spine of the EPUB.

If `index` is undefined, the item will be added to the end of the spine.
Otherwise it will be inserted at the specified index.

If the manifestId does not correspond to an item in the manifest, this will
throw an error.

##### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `manifestId` | `string` |
| `index?`     | `number` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-spine-elem

##### Inherited from

`BaseEpub.addSpineItem`

#### addSubject()

> **addSubject**(`subject`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1052](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1052)

Add a subject to the EPUB metadata.

##### Parameters

| Parameter | Type                                  | Description                                                                         |
| --------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| `subject` | `string` \| [`DcSubject`](#dcsubject) | May be a string representing just a schema-less subject name, or a DcSubject object |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcsubject

##### Inherited from

`BaseEpub.addSubject`

#### close()

> **close**(): `Promise`\<`void`\>

Defined in:
[epub/index.ts:430](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L430)

Close the Epub. Must be called before the Epub goes out of scope/is garbage
collected.

##### Returns

`Promise`\<`void`\>

##### Inherited from

`BaseEpub.close`

#### createXhtmlDocument()

> **createXhtmlDocument**(`body`, `head?`, `language?`):
> `Promise`\<([`XmlElement`](#xmlelement)\<`"html"`\> \|
> [`XmlElement`](#xmlelement)\<`"?xml"`\>)[]\>

Defined in:
[epub/index.ts:2021](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2021)

Create a new XHTML document with the given body and head.

##### Parameters

| Parameter   | Type                      | Description                                        |
| ----------- | ------------------------- | -------------------------------------------------- |
| `body`      | [`ParsedXml`](#parsedxml) | The XML nodes to place in the body of the document |
| `head?`     | [`ParsedXml`](#parsedxml) | Optional - the XMl nodes to place in the head      |
| `language?` | `Locale`                  | Optional - defaults to the EPUB's language         |

##### Returns

`Promise`\<([`XmlElement`](#xmlelement)\<`"html"`\> \|
[`XmlElement`](#xmlelement)\<`"?xml"`\>)[]\>

##### Inherited from

`BaseEpub.createXhtmlDocument`

#### findAllMetadataItems()

> **findAllMetadataItems**(`predicate`): `Promise`\<`object`[]\>

Defined in:
[epub/index.ts:805](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L805)

Returns the item in the metadata element's children array that matches the
provided predicate.

##### Parameters

| Parameter   | Type                   |
| ----------- | ---------------------- |
| `predicate` | (`entry`) => `boolean` |

##### Returns

`Promise`\<`object`[]\>

##### Inherited from

`BaseEpub.findAllMetadataItems`

#### findMetadataItem()

> **findMetadataItem**(`predicate`): `Promise`\<`null` \| \{ `id`: `undefined`
> \| `string`; `properties`: \{[`k`: `string`]: `string`; \}; `type`:
> `` `a${string}` `` \| `` `b${string}` `` \| `` `c${string}` `` \|
> `` `d${string}` `` \| `` `e${string}` `` \| `` `f${string}` `` \|
> `` `g${string}` `` \| `` `h${string}` `` \| `` `i${string}` `` \|
> `` `j${string}` `` \| `` `k${string}` `` \| `` `l${string}` `` \|
> `` `m${string}` `` \| `` `n${string}` `` \| `` `o${string}` `` \|
> `` `p${string}` `` \| `` `q${string}` `` \| `` `r${string}` `` \|
> `` `s${string}` `` \| `` `t${string}` `` \| `` `u${string}` `` \|
> `` `v${string}` `` \| `` `w${string}` `` \| `` `x${string}` `` \|
> `` `y${string}` `` \| `` `z${string}` `` \| `` `A${string}` `` \|
> `` `B${string}` `` \| `` `C${string}` `` \| `` `D${string}` `` \|
> `` `E${string}` `` \| `` `F${string}` `` \| `` `G${string}` `` \|
> `` `H${string}` `` \| `` `I${string}` `` \| `` `J${string}` `` \|
> `` `K${string}` `` \| `` `L${string}` `` \| `` `M${string}` `` \|
> `` `N${string}` `` \| `` `O${string}` `` \| `` `P${string}` `` \|
> `` `Q${string}` `` \| `` `R${string}` `` \| `` `S${string}` `` \|
> `` `T${string}` `` \| `` `U${string}` `` \| `` `V${string}` `` \|
> `` `W${string}` `` \| `` `X${string}` `` \| `` `Y${string}` `` \|
> `` `Z${string}` `` \| `` `?${string}` ``; `value`: `undefined` \| `string`;
> \}\>

Defined in:
[epub/index.ts:796](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L796)

Returns the item in the metadata element's children array that matches the
provided predicate.

##### Parameters

| Parameter   | Type                   |
| ----------- | ---------------------- |
| `predicate` | (`entry`) => `boolean` |

##### Returns

`Promise`\<`null` \| \{ `id`: `undefined` \| `string`; `properties`: \{[`k`:
`string`]: `string`; \}; `type`: `` `a${string}` `` \| `` `b${string}` `` \|
`` `c${string}` `` \| `` `d${string}` `` \| `` `e${string}` `` \|
`` `f${string}` `` \| `` `g${string}` `` \| `` `h${string}` `` \|
`` `i${string}` `` \| `` `j${string}` `` \| `` `k${string}` `` \|
`` `l${string}` `` \| `` `m${string}` `` \| `` `n${string}` `` \|
`` `o${string}` `` \| `` `p${string}` `` \| `` `q${string}` `` \|
`` `r${string}` `` \| `` `s${string}` `` \| `` `t${string}` `` \|
`` `u${string}` `` \| `` `v${string}` `` \| `` `w${string}` `` \|
`` `x${string}` `` \| `` `y${string}` `` \| `` `z${string}` `` \|
`` `A${string}` `` \| `` `B${string}` `` \| `` `C${string}` `` \|
`` `D${string}` `` \| `` `E${string}` `` \| `` `F${string}` `` \|
`` `G${string}` `` \| `` `H${string}` `` \| `` `I${string}` `` \|
`` `J${string}` `` \| `` `K${string}` `` \| `` `L${string}` `` \|
`` `M${string}` `` \| `` `N${string}` `` \| `` `O${string}` `` \|
`` `P${string}` `` \| `` `Q${string}` `` \| `` `R${string}` `` \|
`` `S${string}` `` \| `` `T${string}` `` \| `` `U${string}` `` \|
`` `V${string}` `` \| `` `W${string}` `` \| `` `X${string}` `` \|
`` `Y${string}` `` \| `` `Z${string}` `` \| `` `?${string}` ``; `value`:
`undefined` \| `string`; \}\>

##### Inherited from

`BaseEpub.findMetadataItem`

#### getCollections()

> **getCollections**(): `Promise`\<[`Collection`](#collection)[]\>

Defined in:
[epub/index.ts:1480](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1480)

Retrieve the list of collections.

##### Returns

`Promise`\<[`Collection`](#collection)[]\>

##### Inherited from

`BaseEpub.getCollections`

#### getContributors()

> **getContributors**(): `Promise`\<[`DcCreator`](#dccreator)[]\>

Defined in:
[epub/index.ts:1694](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1694)

Retrieve the list of contributors.

This is a convenience method for `epub.getCreators('contributor')`.

##### Returns

`Promise`\<[`DcCreator`](#dccreator)[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dccontributor

##### Inherited from

`BaseEpub.getContributors`

#### getCoverImage()

> **getCoverImage**(): `Promise`\<`null` \| `Uint8Array`\<`ArrayBufferLike`\>\>

Defined in:
[epub/index.ts:955](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L955)

Retrieve the cover image data as a byte array.

This does not include, for example, the cover image's filename or mime type. To
retrieve the image manifest item, use epub.getCoverImageItem().

##### Returns

`Promise`\<`null` \| `Uint8Array`\<`ArrayBufferLike`\>\>

##### Link

https://www.w3.org/TR/epub-33/#sec-cover-image

##### Inherited from

`BaseEpub.getCoverImage`

#### getCoverImageItem()

> **getCoverImageItem**(): `Promise`\<`null` \|
> [`ManifestItem`](#manifestitem)\>

Defined in:
[epub/index.ts:936](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L936)

Retrieve the cover image manifest item.

This does not return the actual image data. To retrieve the image data, pass
this item's id to epub.readItemContents, or use epub.getCoverImage() instead.

##### Returns

`Promise`\<`null` \| [`ManifestItem`](#manifestitem)\>

##### Link

https://www.w3.org/TR/epub-33/#sec-cover-image

##### Inherited from

`BaseEpub.getCoverImageItem`

#### getCreators()

> **getCreators**(`type`): `Promise`\<[`DcCreator`](#dccreator)[]\>

Defined in:
[epub/index.ts:1633](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1633)

Retrieve the list of creators.

##### Parameters

| Parameter | Type                           | Default value |
| --------- | ------------------------------ | ------------- |
| `type`    | `"creator"` \| `"contributor"` | `"creator"`   |

##### Returns

`Promise`\<[`DcCreator`](#dccreator)[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dccreator

##### Inherited from

`BaseEpub.getCreators`

#### getDescription()

> **getDescription**(): `Promise`\<`null` \| `string`\>

Defined in:
[epub/index.ts:1330](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1330)

Retrieve the Epub's description as specified in its package document metadata.

If no description metadata is specified, returns null. Returns the description
as a string. Descriptions may include HTML markup.

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

`BaseEpub.getDescription`

#### getLanguage()

> **getLanguage**(): `Promise`\<`null` \| `Locale`\>

Defined in:
[epub/index.ts:1171](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1171)

Retrieve the Epub's language as specified in its package document metadata.

If no language metadata is specified, returns null. Returns the language as an
Intl.Locale instance.

##### Returns

`Promise`\<`null` \| `Locale`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dclanguage

##### Inherited from

`BaseEpub.getLanguage`

#### getManifest()

> **getManifest**(): `Promise`\<`Record`\<`string`,
> [`ManifestItem`](#manifestitem)\>\>

Defined in:
[epub/index.ts:721](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L721)

Retrieve the manifest for the Epub.

This is represented as a map from each manifest items' id to the rest of its
properties.

##### Returns

`Promise`\<`Record`\<`string`, [`ManifestItem`](#manifestitem)\>\>

##### Link

https://www.w3.org/TR/epub-33/#sec-pkg-manifest

##### Inherited from

`BaseEpub.getManifest`

#### getMetadata()

> **getMetadata**(): `Promise`\<[`EpubMetadata`](#epubmetadata)\>

Defined in:
[epub/index.ts:872](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L872)

Retrieve the metadata entries for the Epub.

This is represented as an array of metadata entries, in the order that they're
presented in the Epub package document.

For more useful semantic representations of metadata, use specific methods such
as `getTitle()` and `getAuthors()`.

##### Returns

`Promise`\<[`EpubMetadata`](#epubmetadata)\>

##### Link

https://www.w3.org/TR/epub-33/#sec-pkg-metadata

##### Inherited from

`BaseEpub.getMetadata`

#### getPackageVocabularyPrefixes()

> **getPackageVocabularyPrefixes**(): `Promise`\<`Record`\<`string`,
> `string`\>\>

Defined in:
[epub/index.ts:1348](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1348)

Return the set of custom vocabulary prefixes set on this publication's root
package element.

Returns a map from prefix to URI

##### Returns

`Promise`\<`Record`\<`string`, `string`\>\>

##### Link

https://www.w3.org/TR/epub-33/#sec-prefix-attr

##### Inherited from

`BaseEpub.getPackageVocabularyPrefixes`

#### getPublicationDate()

> **getPublicationDate**(): `Promise`\<`null` \| `Date`\>

Defined in:
[epub/index.ts:992](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L992)

Retrieve the publication date from the dc:date element in the EPUB metadata as a
Date object.

If there is no dc:date element, returns null.

##### Returns

`Promise`\<`null` \| `Date`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcdate

##### Inherited from

`BaseEpub.getPublicationDate`

#### getSpineItems()

> **getSpineItems**(): `Promise`\<[`ManifestItem`](#manifestitem)[]\>

Defined in:
[epub/index.ts:1897](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1897)

Retrieve the manifest items that make up the Epub's spine.

The spine specifies the order that the contents of the Epub should be displayed
to users by default.

##### Returns

`Promise`\<[`ManifestItem`](#manifestitem)[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-spine-elem

##### Inherited from

`BaseEpub.getSpineItems`

#### getSubjects()

> **getSubjects**(): `Promise`\<(`string` \| [`DcSubject`](#dcsubject))[]\>

Defined in:
[epub/index.ts:1126](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1126)

Retrieve the list of subjects for this EPUB.

Subjects without associated authority and term metadata will be returned as
strings. Otherwise, they will be represented as DcSubject objects, with a value,
authority, and term.

##### Returns

`Promise`\<(`string` \| [`DcSubject`](#dcsubject))[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcsubject

##### Inherited from

`BaseEpub.getSubjects`

#### getSubtitle()

> **getSubtitle**(): `Promise`\<`null` \| `string`\>

Defined in:
[epub/index.ts:1237](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1237)

Retrieve the subtitle of the Epub, if it exists.

##### Returns

`Promise`\<`null` \| `string`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

##### Inherited from

`BaseEpub.getSubtitle`

#### getTitle()

> **getTitle**(`expanded`): `Promise`\<`null` \| `string`\>

Defined in:
[epub/index.ts:1213](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1213)

Retrieve the title of the Epub.

##### Parameters

| Parameter  | Type      | Default value |
| ---------- | --------- | ------------- |
| `expanded` | `boolean` | `false`       |

##### Returns

`Promise`\<`null` \| `string`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

##### Inherited from

`BaseEpub.getTitle`

#### getTitles()

> **getTitles**(): `Promise`\<`object`[]\>

Defined in:
[epub/index.ts:1249](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1249)

Retrieve all title entries of the Epub.

##### Returns

`Promise`\<`object`[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

##### Inherited from

`BaseEpub.getTitles`

#### getType()

> **getType**(): `Promise`\<`null` \| [`MetadataEntry`](#metadataentry)\>

Defined in:
[epub/index.ts:1039](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1039)

Retrieve the publication type from the dc:type element in the EPUB metadata.

If there is no dc:type element, returns null.

##### Returns

`Promise`\<`null` \| [`MetadataEntry`](#metadataentry)\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctype

##### Inherited from

`BaseEpub.getType`

#### readItemContents()

##### Call Signature

> **readItemContents**(`id`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in:
[epub/index.ts:1993](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1993)

Retrieve the contents of a manifest item, given its id.

###### Parameters

| Parameter | Type     | Description                             |
| --------- | -------- | --------------------------------------- |
| `id`      | `string` | The id of the manifest item to retrieve |

###### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

###### Link

https://www.w3.org/TR/epub-33/#sec-contentdocs

###### Inherited from

`BaseEpub.readItemContents`

##### Call Signature

> **readItemContents**(`id`, `encoding`): `Promise`\<`string`\>

Defined in:
[epub/index.ts:1994](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1994)

Retrieve the contents of a manifest item, given its id.

###### Parameters

| Parameter  | Type      | Description                                                                                                                                                        |
| ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`       | `string`  | The id of the manifest item to retrieve                                                                                                                            |
| `encoding` | `"utf-8"` | Optional - must be the string "utf-8". If provided, the function will encode the data into a unicode string. Otherwise, the data will be returned as a byte array. |

###### Returns

`Promise`\<`string`\>

###### Link

https://www.w3.org/TR/epub-33/#sec-contentdocs

###### Inherited from

`BaseEpub.readItemContents`

#### readXhtmlItemContents()

##### Call Signature

> **readXhtmlItemContents**(`id`, `as?`): `Promise`\<[`ParsedXml`](#parsedxml)\>

Defined in:
[epub/index.ts:2054](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2054)

Retrieves the contents of an XHTML item, given its manifest id.

###### Parameters

| Parameter | Type      | Description                                                                                                                           |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | `string`  | The id of the manifest item to retrieve                                                                                               |
| `as?`     | `"xhtml"` | Optional - whether to return the parsed XML document tree, or the concatenated text of the document. Defaults to the parsed XML tree. |

###### Returns

`Promise`\<[`ParsedXml`](#parsedxml)\>

###### Link

https://www.w3.org/TR/epub-33/#sec-xhtml

###### Inherited from

`BaseEpub.readXhtmlItemContents`

##### Call Signature

> **readXhtmlItemContents**(`id`, `as`): `Promise`\<`string`\>

Defined in:
[epub/index.ts:2055](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2055)

Retrieves the contents of an XHTML item, given its manifest id.

###### Parameters

| Parameter | Type     | Description                                                                                                                           |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | `string` | The id of the manifest item to retrieve                                                                                               |
| `as`      | `"text"` | Optional - whether to return the parsed XML document tree, or the concatenated text of the document. Defaults to the parsed XML tree. |

###### Returns

`Promise`\<`string`\>

###### Link

https://www.w3.org/TR/epub-33/#sec-xhtml

###### Inherited from

`BaseEpub.readXhtmlItemContents`

#### removeCollection()

> **removeCollection**(`index`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1589](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1589)

Remove a collection from the EPUB metadata.

Removes the collection at the provided index. This index refers to the array
returned by `epub.getCollections()`.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `index`   | `number` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

`BaseEpub.removeCollection`

#### removeContributor()

> **removeContributor**(`index`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1846](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1846)

Remove a contributor from the EPUB metadata.

Removes the contributor at the provided index. This index refers to the array
returned by `epub.getContributors()`.

This is a convenience method for `epub.removeCreator(index, 'contributor')`.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `index`   | `number` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dccreator

##### Inherited from

`BaseEpub.removeContributor`

#### removeCreator()

> **removeCreator**(`index`, `type`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1794](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1794)

Remove a creator from the EPUB metadata.

Removes the creator at the provided index. This index refers to the array
returned by `epub.getCreators()`.

##### Parameters

| Parameter | Type                           | Default value |
| --------- | ------------------------------ | ------------- |
| `index`   | `number`                       | `undefined`   |
| `type`    | `"creator"` \| `"contributor"` | `"creator"`   |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dccreator

##### Inherited from

`BaseEpub.removeCreator`

#### removeManifestItem()

> **removeManifestItem**(`id`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2155](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2155)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

`BaseEpub.removeManifestItem`

#### removeMetadata()

> **removeMetadata**(`predicate`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2401](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2401)

Remove one or more metadata entries.

The `predicate` argument will be used to determine which entries to remove. The
all metadata entries that match the predicate will be removed.

##### Parameters

| Parameter   | Type                   | Description                                                                          |
| ----------- | ---------------------- | ------------------------------------------------------------------------------------ |
| `predicate` | (`entry`) => `boolean` | Calls predicate once for each metadata entry, removing any for which it returns true |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-pkg-metadata

##### Inherited from

`BaseEpub.removeMetadata`

#### removeSpineItem()

> **removeSpineItem**(`index`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1952](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1952)

Remove the spine item at the specified index.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `index`   | `number` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-spine-elem

##### Inherited from

`BaseEpub.removeSpineItem`

#### removeSubject()

> **removeSubject**(`index`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1089](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1089)

Remove a subject from the EPUB metadata.

Removes the subject at the provided index. This index refers to the array
returned by `epub.getSubjects()`.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `index`   | `number` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dccreator

##### Inherited from

`BaseEpub.removeSubject`

#### replaceMetadata()

> **replaceMetadata**(`predicate`, `entry`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2356](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2356)

Replace a metadata entry with a new one.

The `predicate` argument will be used to determine which entry to replace. The
first metadata entry that matches the predicate will be replaced.

##### Parameters

| Parameter   | Type                              | Description                                                                                   |
| ----------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| `predicate` | (`entry`) => `boolean`            | Calls predicate once for each metadata entry, until it finds one where predicate returns true |
| `entry`     | [`MetadataEntry`](#metadataentry) | The new entry to replace the found entry with                                                 |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-pkg-metadata

##### Inherited from

`BaseEpub.replaceMetadata`

#### setCoverImage()

> **setCoverImage**(`href`, `data`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:969](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L969)

Set the cover image for the EPUB.

Adds a manifest item with the `cover-image` property, per the EPUB 3 spec, and
then writes the provided image data to the provided href within the publication.

##### Parameters

| Parameter | Type         |
| --------- | ------------ |
| `href`    | `string`     |
| `data`    | `Uint8Array` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

`BaseEpub.setCoverImage`

#### setDescription()

> **setDescription**(`description`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1314](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1314)

Update the Epub's description metadata entry.

Updates the existing dc:description element if one exists. Otherwise creates a
new element. Any non-ASCII symbols, `&`, `<`, `>`, `"`, `'`, and ```` will be
encoded as HTML entities.

##### Parameters

| Parameter     | Type     |
| ------------- | -------- |
| `description` | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

`BaseEpub.setDescription`

#### setLanguage()

> **setLanguage**(`locale`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1196](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1196)

Update the Epub's language metadata entry.

Updates the existing dc:language element if one exists. Otherwise creates a new
element

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `locale`  | `Locale` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dclanguage

##### Inherited from

`BaseEpub.setLanguage`

#### setPackageVocabularyPrefix()

> **setPackageVocabularyPrefix**(`prefix`, `uri`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1366](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1366)

Set a custom vocabulary prefix on the root package element.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `prefix`  | `string` |
| `uri`     | `string` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-prefix-attr

##### Inherited from

`BaseEpub.setPackageVocabularyPrefix`

#### setPublicationDate()

> **setPublicationDate**(`date`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1007](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1007)

Set the dc:date metadata element with the provided date.

Updates the existing dc:date element if one exists. Otherwise creates a new
element

##### Parameters

| Parameter | Type   |
| --------- | ------ |
| `date`    | `Date` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcdate

##### Inherited from

`BaseEpub.setPublicationDate`

#### setTitle()

> **setTitle**(`title`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1390](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1390)

Set the title of the Epub.

This will replace all existing dc:title elements with this title. It will be
given title-type "main".

To set specific titles and their types, use epub.setTitles().

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `title`   | `string` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

##### Inherited from

`BaseEpub.setTitle`

#### setTitles()

> **setTitles**(`entries`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1418](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1418)

##### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `entries` | `object`[] |

##### Returns

`Promise`\<`void`\>

##### Inherited from

`BaseEpub.setTitles`

#### setType()

> **setType**(`type`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1023](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1023)

Set the dc:type metadata element.

Updates the existing dc:type element if one exists. Otherwise creates a new
element.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `type`    | `string` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctype

##### Inherited from

`BaseEpub.setType`

#### updateManifestItem()

> **updateManifestItem**(`id`, `newItem`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2268](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2268)

Update the manifest entry for an existing item.

To update the contents of an entry, use `epub.writeItemContents()` or
`epub.writeXhtmlItemContents()`

##### Parameters

| Parameter | Type                                              |
| --------- | ------------------------------------------------- |
| `id`      | `string`                                          |
| `newItem` | `Omit`\<[`ManifestItem`](#manifestitem), `"id"`\> |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-pkg-manifest

##### Inherited from

`BaseEpub.updateManifestItem`

#### writeItemContents()

##### Call Signature

> **writeItemContents**(`id`, `contents`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2107](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2107)

Write new contents for an existing manifest item, specified by its id.

The id must reference an existing manifest item. If creating a new item, use
`epub.addManifestItem()` instead.

###### Parameters

| Parameter  | Type         | Description                                                                                           |
| ---------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `id`       | `string`     | The id of the manifest item to write new contents for                                                 |
| `contents` | `Uint8Array` | The new contents. May be either a utf-8 encoded string or a byte array, as determined by the encoding |

###### Returns

`Promise`\<`void`\>

###### Link

https://www.w3.org/TR/epub-33/#sec-contentdocs

###### Inherited from

`BaseEpub.writeItemContents`

##### Call Signature

> **writeItemContents**(`id`, `contents`, `encoding`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2108](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2108)

Write new contents for an existing manifest item, specified by its id.

The id must reference an existing manifest item. If creating a new item, use
`epub.addManifestItem()` instead.

###### Parameters

| Parameter  | Type      | Description                                                                                                                                             |
| ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`       | `string`  | The id of the manifest item to write new contents for                                                                                                   |
| `contents` | `string`  | The new contents. May be either a utf-8 encoded string or a byte array, as determined by the encoding                                                   |
| `encoding` | `"utf-8"` | Optional - must be the string "utf-8". If provided, the contents will be interpreted as a unicode string. Otherwise, the contents must be a byte array. |

###### Returns

`Promise`\<`void`\>

###### Link

https://www.w3.org/TR/epub-33/#sec-contentdocs

###### Inherited from

`BaseEpub.writeItemContents`

#### writeToArray()

> **writeToArray**(): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in:
[epub/index.ts:2438](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2438)

Write the current contents of the Epub to a new Uint8Array.

This _does not_ close the Epub. It can continue to be modified after it has been
written to disk. Use `epub.close()` to close the Epub.

When this method is called, the "dcterms:modified" meta tag is automatically
updated to the current UTC timestamp.

##### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

##### Inherited from

`BaseEpub.writeToArray`

#### writeToFile()

> **writeToFile**(`path`): `Promise`\<`void`\>

Defined in:
[epub/node.ts:56](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/node.ts#L56)

Write the current contents of the Epub to a new EPUB archive on disk.

This _does not_ close the Epub. It can continue to be modified after it has been
written to disk. Use `epub.close()` to close the Epub.

When this method is called, the "dcterms:modified" meta tag is automatically
updated to the current UTC timestamp.

##### Parameters

| Parameter | Type     | Description                                                                                                                     |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `path`    | `string` | The file path to write the new archive to. The parent directory does not need te exist -- the path will be recursively created. |

##### Returns

`Promise`\<`void`\>

#### writeXhtmlItemContents()

> **writeXhtmlItemContents**(`id`, `contents`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2147](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2147)

Write new contents for an existing XHTML item, specified by its id.

The id must reference an existing manifest item. If creating a new item, use
`epub.addManifestItem()` instead.

##### Parameters

| Parameter  | Type                      | Description                                           |
| ---------- | ------------------------- | ----------------------------------------------------- |
| `id`       | `string`                  | The id of the manifest item to write new contents for |
| `contents` | [`ParsedXml`](#parsedxml) | The new contents. Must be a parsed XML tree.          |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-xhtml

##### Inherited from

`BaseEpub.writeXhtmlItemContents`

#### addLinkToXhtmlHead()

> `static` **addLinkToXhtmlHead**(`xml`, `link`): `void`

Defined in:
[epub/index.ts:272](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L272)

Given an XML structure representing a complete XHTML document, add a `link`
element to the `head` of the document.

This method modifies the provided XML structure.

##### Parameters

| Parameter   | Type                                                       |
| ----------- | ---------------------------------------------------------- |
| `xml`       | [`ParsedXml`](#parsedxml)                                  |
| `link`      | \{ `href`: `string`; `rel`: `string`; `type`: `string`; \} |
| `link.href` | `string`                                                   |
| `link.rel`  | `string`                                                   |
| `link.type` | `string`                                                   |

##### Returns

`void`

##### Inherited from

`BaseEpub.addLinkToXhtmlHead`

#### create()

> `static` **create**(...`args`): `Promise`\<[`Epub`](#epub)\>

Defined in:
[epub/node.ts:25](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/node.ts#L25)

Construct an Epub instance, optionally beginning with the provided metadata.

##### Parameters

| Parameter | Type                                                             |
| --------- | ---------------------------------------------------------------- |
| ...`args` | \[[`DublinCore`](#dublincore), [`EpubMetadata`](#epubmetadata)\] |

##### Returns

`Promise`\<[`Epub`](#epub)\>

##### Overrides

`BaseEpub.create`

#### createXmlElement()

> `static` **createXmlElement**\<`Name`\>(`name`, `properties`, `children`):
> [`XmlElement`](#xmlelement)\<`Name`\>

Defined in:
[epub/index.ts:307](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L307)

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` _extends_ `` `a${string}` `` \| `` `b${string}` `` \| `` `c${string}` `` \| `` `d${string}` `` \| `` `e${string}` `` \| `` `f${string}` `` \| `` `g${string}` `` \| `` `h${string}` `` \| `` `i${string}` `` \| `` `j${string}` `` \| `` `k${string}` `` \| `` `l${string}` `` \| `` `m${string}` `` \| `` `n${string}` `` \| `` `o${string}` `` \| `` `p${string}` `` \| `` `q${string}` `` \| `` `r${string}` `` \| `` `s${string}` `` \| `` `t${string}` `` \| `` `u${string}` `` \| `` `v${string}` `` \| `` `w${string}` `` \| `` `x${string}` `` \| `` `y${string}` `` \| `` `z${string}` `` \| `` `A${string}` `` \| `` `B${string}` `` \| `` `C${string}` `` \| `` `D${string}` `` \| `` `E${string}` `` \| `` `F${string}` `` \| `` `G${string}` `` \| `` `H${string}` `` \| `` `I${string}` `` \| `` `J${string}` `` \| `` `K${string}` `` \| `` `L${string}` `` \| `` `M${string}` `` \| `` `N${string}` `` \| `` `O${string}` `` \| `` `P${string}` `` \| `` `Q${string}` `` \| `` `R${string}` `` \| `` `S${string}` `` \| `` `T${string}` `` \| `` `U${string}` `` \| `` `V${string}` `` \| `` `W${string}` `` \| `` `X${string}` `` \| `` `Y${string}` `` \| `` `Z${string}` `` \| `` `?${string}` `` |

##### Parameters

| Parameter    | Type                           | Default value |
| ------------ | ------------------------------ | ------------- |
| `name`       | `Name`                         | `undefined`   |
| `properties` | `Record`\<`string`, `string`\> | `undefined`   |
| `children`   | [`XmlNode`](#xmlnode)[]        | `[]`          |

##### Returns

[`XmlElement`](#xmlelement)\<`Name`\>

##### Inherited from

`BaseEpub.createXmlElement`

#### createXmlTextNode()

> `static` **createXmlTextNode**(`text`): [`XmlTextNode`](#xmltextnode)

Defined in:
[epub/index.ts:320](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L320)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `text`    | `string` |

##### Returns

[`XmlTextNode`](#xmltextnode)

##### Inherited from

`BaseEpub.createXmlTextNode`

#### findXmlChildByName()

> `static` **findXmlChildByName**\<`Name`\>(`name`, `xml`, `filter?`):
> `undefined` \| [`XmlElement`](#xmlelement)\<`Name`\>

Defined in:
[epub/index.ts:381](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L381)

Given an XML structure, find the first child matching the provided name and
optional filter.

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` _extends_ `` `a${string}` `` \| `` `b${string}` `` \| `` `c${string}` `` \| `` `d${string}` `` \| `` `e${string}` `` \| `` `f${string}` `` \| `` `g${string}` `` \| `` `h${string}` `` \| `` `i${string}` `` \| `` `j${string}` `` \| `` `k${string}` `` \| `` `l${string}` `` \| `` `m${string}` `` \| `` `n${string}` `` \| `` `o${string}` `` \| `` `p${string}` `` \| `` `q${string}` `` \| `` `r${string}` `` \| `` `s${string}` `` \| `` `t${string}` `` \| `` `u${string}` `` \| `` `v${string}` `` \| `` `w${string}` `` \| `` `x${string}` `` \| `` `y${string}` `` \| `` `z${string}` `` \| `` `A${string}` `` \| `` `B${string}` `` \| `` `C${string}` `` \| `` `D${string}` `` \| `` `E${string}` `` \| `` `F${string}` `` \| `` `G${string}` `` \| `` `H${string}` `` \| `` `I${string}` `` \| `` `J${string}` `` \| `` `K${string}` `` \| `` `L${string}` `` \| `` `M${string}` `` \| `` `N${string}` `` \| `` `O${string}` `` \| `` `P${string}` `` \| `` `Q${string}` `` \| `` `R${string}` `` \| `` `S${string}` `` \| `` `T${string}` `` \| `` `U${string}` `` \| `` `V${string}` `` \| `` `W${string}` `` \| `` `X${string}` `` \| `` `Y${string}` `` \| `` `Z${string}` `` \| `` `?${string}` `` |

##### Parameters

| Parameter | Type                      |
| --------- | ------------------------- |
| `name`    | `Name`                    |
| `xml`     | [`ParsedXml`](#parsedxml) |
| `filter?` | (`node`) => `boolean`     |

##### Returns

`undefined` \| [`XmlElement`](#xmlelement)\<`Name`\>

##### Inherited from

`BaseEpub.findXmlChildByName`

#### formatSmilDuration()

> `static` **formatSmilDuration**(`duration`): `string`

Defined in:
[epub/index.ts:255](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L255)

Format a duration, provided as a number of seconds, as a SMIL clock value, to be
used for Media Overlays.

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `duration` | `number` |

##### Returns

`string`

##### Link

https://www.w3.org/TR/epub-33/#sec-duration

##### Inherited from

`BaseEpub.formatSmilDuration`

#### from()

> `static` **from**(...`args`): `Promise`\<[`Epub`](#epub)\>

Defined in:
[epub/node.ts:31](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/node.ts#L31)

Construct an Epub instance by reading an existing EPUB publication.

##### Parameters

| Parameter | Type                                              |
| --------- | ------------------------------------------------- |
| ...`args` | \[`string` \| `Uint8Array`\<`ArrayBufferLike`\>\] |

##### Returns

`Promise`\<[`Epub`](#epub)\>

##### Overrides

`BaseEpub.from`

#### getXhtmlBody()

> `static` **getXhtmlBody**(`xml`): [`ParsedXml`](#parsedxml)

Defined in:
[epub/index.ts:297](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L297)

Given an XML structure representing a complete XHTML document, return the
sub-structure representing the children of the document's body element.

##### Parameters

| Parameter | Type                      |
| --------- | ------------------------- |
| `xml`     | [`ParsedXml`](#parsedxml) |

##### Returns

[`ParsedXml`](#parsedxml)

##### Inherited from

`BaseEpub.getXhtmlBody`

#### getXhtmlTextContent()

> `static` **getXhtmlTextContent**(`xml`): `string`

Defined in:
[epub/index.ts:329](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L329)

Given an XML structure representing a complete XHTML document, return a string
representing the concatenation of all text nodes in the document.

##### Parameters

| Parameter | Type                      |
| --------- | ------------------------- |
| `xml`     | [`ParsedXml`](#parsedxml) |

##### Returns

`string`

##### Inherited from

`BaseEpub.getXhtmlTextContent`

#### getXmlChildren()

> `static` **getXmlChildren**\<`Name`\>(`element`): [`ParsedXml`](#parsedxml)

Defined in:
[epub/index.ts:361](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L361)

Given an XMLElement, return a list of its children

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` _extends_ `` `a${string}` `` \| `` `b${string}` `` \| `` `c${string}` `` \| `` `d${string}` `` \| `` `e${string}` `` \| `` `f${string}` `` \| `` `g${string}` `` \| `` `h${string}` `` \| `` `i${string}` `` \| `` `j${string}` `` \| `` `k${string}` `` \| `` `l${string}` `` \| `` `m${string}` `` \| `` `n${string}` `` \| `` `o${string}` `` \| `` `p${string}` `` \| `` `q${string}` `` \| `` `r${string}` `` \| `` `s${string}` `` \| `` `t${string}` `` \| `` `u${string}` `` \| `` `v${string}` `` \| `` `w${string}` `` \| `` `x${string}` `` \| `` `y${string}` `` \| `` `z${string}` `` \| `` `A${string}` `` \| `` `B${string}` `` \| `` `C${string}` `` \| `` `D${string}` `` \| `` `E${string}` `` \| `` `F${string}` `` \| `` `G${string}` `` \| `` `H${string}` `` \| `` `I${string}` `` \| `` `J${string}` `` \| `` `K${string}` `` \| `` `L${string}` `` \| `` `M${string}` `` \| `` `N${string}` `` \| `` `O${string}` `` \| `` `P${string}` `` \| `` `Q${string}` `` \| `` `R${string}` `` \| `` `S${string}` `` \| `` `T${string}` `` \| `` `U${string}` `` \| `` `V${string}` `` \| `` `W${string}` `` \| `` `X${string}` `` \| `` `Y${string}` `` \| `` `Z${string}` `` \| `` `?${string}` `` |

##### Parameters

| Parameter | Type                                  |
| --------- | ------------------------------------- |
| `element` | [`XmlElement`](#xmlelement)\<`Name`\> |

##### Returns

[`ParsedXml`](#parsedxml)

##### Inherited from

`BaseEpub.getXmlChildren`

#### getXmlElementName()

> `static` **getXmlElementName**\<`Name`\>(`element`): `Name`

Defined in:
[epub/index.ts:346](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L346)

Given an XMLElement, return its tag name.

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` _extends_ `` `a${string}` `` \| `` `b${string}` `` \| `` `c${string}` `` \| `` `d${string}` `` \| `` `e${string}` `` \| `` `f${string}` `` \| `` `g${string}` `` \| `` `h${string}` `` \| `` `i${string}` `` \| `` `j${string}` `` \| `` `k${string}` `` \| `` `l${string}` `` \| `` `m${string}` `` \| `` `n${string}` `` \| `` `o${string}` `` \| `` `p${string}` `` \| `` `q${string}` `` \| `` `r${string}` `` \| `` `s${string}` `` \| `` `t${string}` `` \| `` `u${string}` `` \| `` `v${string}` `` \| `` `w${string}` `` \| `` `x${string}` `` \| `` `y${string}` `` \| `` `z${string}` `` \| `` `A${string}` `` \| `` `B${string}` `` \| `` `C${string}` `` \| `` `D${string}` `` \| `` `E${string}` `` \| `` `F${string}` `` \| `` `G${string}` `` \| `` `H${string}` `` \| `` `I${string}` `` \| `` `J${string}` `` \| `` `K${string}` `` \| `` `L${string}` `` \| `` `M${string}` `` \| `` `N${string}` `` \| `` `O${string}` `` \| `` `P${string}` `` \| `` `Q${string}` `` \| `` `R${string}` `` \| `` `S${string}` `` \| `` `T${string}` `` \| `` `U${string}` `` \| `` `V${string}` `` \| `` `W${string}` `` \| `` `X${string}` `` \| `` `Y${string}` `` \| `` `Z${string}` `` \| `` `?${string}` `` |

##### Parameters

| Parameter | Type                                  |
| --------- | ------------------------------------- |
| `element` | [`XmlElement`](#xmlelement)\<`Name`\> |

##### Returns

`Name`

##### Inherited from

`BaseEpub.getXmlElementName`

#### isXmlTextNode()

> `static` **isXmlTextNode**(`node`): `node is XmlTextNode`

Defined in:
[epub/index.ts:394](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L394)

Given an XMLNode, determine whether it represents a text node or an XML element.

##### Parameters

| Parameter | Type                  |
| --------- | --------------------- |
| `node`    | [`XmlNode`](#xmlnode) |

##### Returns

`node is XmlTextNode`

##### Inherited from

`BaseEpub.isXmlTextNode`

#### replaceXmlChildren()

> `static` **replaceXmlChildren**\<`Name`\>(`element`, `children`): `void`

Defined in:
[epub/index.ts:369](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L369)

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` _extends_ `` `a${string}` `` \| `` `b${string}` `` \| `` `c${string}` `` \| `` `d${string}` `` \| `` `e${string}` `` \| `` `f${string}` `` \| `` `g${string}` `` \| `` `h${string}` `` \| `` `i${string}` `` \| `` `j${string}` `` \| `` `k${string}` `` \| `` `l${string}` `` \| `` `m${string}` `` \| `` `n${string}` `` \| `` `o${string}` `` \| `` `p${string}` `` \| `` `q${string}` `` \| `` `r${string}` `` \| `` `s${string}` `` \| `` `t${string}` `` \| `` `u${string}` `` \| `` `v${string}` `` \| `` `w${string}` `` \| `` `x${string}` `` \| `` `y${string}` `` \| `` `z${string}` `` \| `` `A${string}` `` \| `` `B${string}` `` \| `` `C${string}` `` \| `` `D${string}` `` \| `` `E${string}` `` \| `` `F${string}` `` \| `` `G${string}` `` \| `` `H${string}` `` \| `` `I${string}` `` \| `` `J${string}` `` \| `` `K${string}` `` \| `` `L${string}` `` \| `` `M${string}` `` \| `` `N${string}` `` \| `` `O${string}` `` \| `` `P${string}` `` \| `` `Q${string}` `` \| `` `R${string}` `` \| `` `S${string}` `` \| `` `T${string}` `` \| `` `U${string}` `` \| `` `V${string}` `` \| `` `W${string}` `` \| `` `X${string}` `` \| `` `Y${string}` `` \| `` `Z${string}` `` \| `` `?${string}` `` |

##### Parameters

| Parameter  | Type                                  |
| ---------- | ------------------------------------- |
| `element`  | [`XmlElement`](#xmlelement)\<`Name`\> |
| `children` | [`XmlNode`](#xmlnode)[]               |

##### Returns

`void`

##### Inherited from

`BaseEpub.replaceXmlChildren`

---

## AlternateScript

Defined in:
[epub/index.ts:143](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L143)

### Properties

#### locale

> **locale**: `Locale`

Defined in:
[epub/index.ts:145](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L145)

#### name

> **name**: `string`

Defined in:
[epub/index.ts:144](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L144)

---

## Collection

Defined in:
[epub/index.ts:167](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L167)

### Properties

#### name

> **name**: `string`

Defined in:
[epub/index.ts:168](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L168)

#### position?

> `optional` **position**: `string`

Defined in:
[epub/index.ts:170](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L170)

#### type?

> `optional` **type**: `string`

Defined in:
[epub/index.ts:169](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L169)

---

## DcCreator

Defined in:
[epub/index.ts:148](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L148)

### Properties

#### alternateScripts?

> `optional` **alternateScripts**: [`AlternateScript`](#alternatescript)[]

Defined in:
[epub/index.ts:153](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L153)

#### fileAs?

> `optional` **fileAs**: `string`

Defined in:
[epub/index.ts:152](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L152)

#### name

> **name**: `string`

Defined in:
[epub/index.ts:149](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L149)

#### role?

> `optional` **role**: `string`

Defined in:
[epub/index.ts:150](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L150)

#### roleScheme?

> `optional` **roleScheme**: `string`

Defined in:
[epub/index.ts:151](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L151)

---

## DcSubject

Defined in:
[epub/index.ts:137](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L137)

### Properties

#### authority

> **authority**: `string`

Defined in:
[epub/index.ts:139](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L139)

#### term

> **term**: `string`

Defined in:
[epub/index.ts:140](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L140)

#### value

> **value**: `string`

Defined in:
[epub/index.ts:138](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L138)

---

## DublinCore

Defined in:
[epub/index.ts:156](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L156)

### Properties

#### contributors?

> `optional` **contributors**: [`DcCreator`](#dccreator)[]

Defined in:
[epub/index.ts:163](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L163)

#### creators?

> `optional` **creators**: [`DcCreator`](#dccreator)[]

Defined in:
[epub/index.ts:162](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L162)

#### date?

> `optional` **date**: `Date`

Defined in:
[epub/index.ts:160](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L160)

#### identifier

> **identifier**: `string`

Defined in:
[epub/index.ts:159](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L159)

#### language

> **language**: `Locale`

Defined in:
[epub/index.ts:158](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L158)

#### subjects?

> `optional` **subjects**: (`string` \| [`DcSubject`](#dcsubject))[]

Defined in:
[epub/index.ts:161](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L161)

#### title

> **title**: `string`

Defined in:
[epub/index.ts:157](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L157)

#### type?

> `optional` **type**: `string`

Defined in:
[epub/index.ts:164](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L164)

---

## ElementName

> **ElementName** =
> \`$\{Letter \| Uppercase\<Letter\> \| QuestionMark\}$\{string\}\`

Defined in:
[epub/index.ts:64](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L64)

A valid name for an XML element (must start with a letter)

---

## EpubMetadata

> **EpubMetadata** = [`MetadataEntry`](#metadataentry)[]

Defined in:
[epub/index.ts:135](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L135)

---

## ManifestItem

> **ManifestItem** = `object`

Defined in:
[epub/index.ts:85](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L85)

### Properties

#### fallback?

> `optional` **fallback**: `string`

Defined in:
[epub/index.ts:89](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L89)

#### href

> **href**: `string`

Defined in:
[epub/index.ts:87](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L87)

#### id

> **id**: `string`

Defined in:
[epub/index.ts:86](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L86)

#### mediaOverlay?

> `optional` **mediaOverlay**: `string`

Defined in:
[epub/index.ts:90](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L90)

#### mediaType?

> `optional` **mediaType**: `string`

Defined in:
[epub/index.ts:88](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L88)

#### properties?

> `optional` **properties**: `string`[]

Defined in:
[epub/index.ts:91](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L91)

---

## MetadataEntry

> **MetadataEntry** = `object`

Defined in:
[epub/index.ts:128](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L128)

### Properties

#### id?

> `optional` **id**: `string`

Defined in:
[epub/index.ts:129](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L129)

#### properties

> **properties**: `Record`\<`string`, `string`\>

Defined in:
[epub/index.ts:131](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L131)

#### type

> **type**: [`ElementName`](#elementname)

Defined in:
[epub/index.ts:130](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L130)

#### value

> **value**: `string` \| `undefined`

Defined in:
[epub/index.ts:132](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L132)

---

## ParsedXml

> **ParsedXml** = [`XmlNode`](#xmlnode)[]

Defined in:
[epub/index.ts:83](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L83)

An XML structure

---

## XmlElement\<Name\>

> **XmlElement**\<`Name`\> = `object` & `{ [key in Name]: ParsedXml }`

Defined in:
[epub/index.ts:70](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L70)

An XML element

### Type declaration

#### :@?

> `optional` **:@**: `Record`\<`` `${PropertyPrefix}${string}` ``, `string`\>

### Type Parameters

| Type Parameter                                 | Default type                  |
| ---------------------------------------------- | ----------------------------- |
| `Name` _extends_ [`ElementName`](#elementname) | [`ElementName`](#elementname) |

---

## XmlNode

> **XmlNode** = [`XmlElement`](#xmlelement) \| [`XmlTextNode`](#xmltextnode)

Defined in:
[epub/index.ts:80](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L80)

A valid XML node. May be either an element or a text node.

---

## XmlTextNode

> **XmlTextNode** = `object`

Defined in:
[epub/index.ts:77](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L77)

A text node in an XML document

### Properties

#### #text

> **#text**: `string`

Defined in:
[epub/index.ts:77](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L77)
