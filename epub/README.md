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
// If you want to read or write to disk, import from the `/node`
// export
import { Epub } from "@storyteller-platform/epub/node"

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
import { Epub } from "@storyteller-platform/epub/node"

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
[Storyteller monorepo](https://gitlab.com/storyteller-platform/storyteller), and
is developed alongside the
[Storyteller platform](https://storyteller-platform.gitlab.io/storyteller).

To get started with developing in the Storyteller monorepo, check out the
[development guides in the docs](https://storyteller-platform.gitlab.io/storyteller/docs/category/development).

## API Docs

## Epub

Defined in:
[epub/index.ts:235](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L235)

A single EPUB instance.

The entire EPUB contents will be read into memory.

Example usage:

```ts
import {
  Epub,
  getBody,
  findByName,
  textContent,
} from "@storyteller-platform/epub"

const epub = await Epub.from("./path/to/book.epub")
const title = await epub.getTitle()
const spineItems = await epub.getSpineItems()
const chptOne = spineItems[0]
const chptOneXml = await epub.readXhtmlItemContents(chptOne.id)

const body = getBody(chptOneXml)
const h1 = Epub.findXmlChildByName("h1", body)
const headingText = textContent(h1)

await epub.setTitle(headingText)
await epub.writeToFile("./path/to/updated.epub")
await epub.close()
```

### Link

https://www.w3.org/TR/epub-33/

### Constructors

#### Constructor

> `protected` **new Epub**(`extractPath`, `inputPath`): [`Epub`](#epub)

Defined in:
[epub/index.ts:486](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L486)

##### Parameters

| Parameter     | Type                    |
| ------------- | ----------------------- |
| `extractPath` | `string`                |
| `inputPath`   | `undefined` \| `string` |

##### Returns

[`Epub`](#epub)

### Properties

#### extractPath

> `protected` **extractPath**: `string`

Defined in:
[epub/index.ts:487](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L487)

#### inputPath

> `protected` **inputPath**: `undefined` \| `string`

Defined in:
[epub/index.ts:488](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L488)

#### xhtmlBuilder

> `static` **xhtmlBuilder**: `XMLBuilder`

Defined in:
[epub/index.ts:283](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L283)

#### xhtmlParser

> `static` **xhtmlParser**: `XMLParser`

Defined in:
[epub/index.ts:243](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L243)

#### xmlBuilder

> `static` **xmlBuilder**: `XMLBuilder`

Defined in:
[epub/index.ts:276](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L276)

#### xmlParser

> `static` **xmlParser**: `XMLParser`

Defined in:
[epub/index.ts:236](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L236)

### Methods

#### \[dispose\]()

> **\[dispose\]**(): `void`

Defined in:
[epub/index.ts:3108](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L3108)

##### Returns

`void`

#### addCollection()

> **addCollection**(`collection`, `index?`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1704](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1704)

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

#### addContributor()

> **addContributor**(`contributor`, `index?`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2046](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2046)

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

#### addCreator()

> **addCreator**(`creator`, `index?`, `type?`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1891](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1891)

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

#### addManifestItem()

##### Call Signature

> **addManifestItem**(`item`, `contents`, `encoding`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2580](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2580)

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

##### Call Signature

> **addManifestItem**(`item`, `contents`, `encoding`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2585](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2585)

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

##### Call Signature

> **addManifestItem**(`item`, `contents`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2590](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2590)

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

#### addMetadata()

> **addMetadata**(`entry`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2702](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2702)

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

#### addSpineItem()

> **addSpineItem**(`manifestId`, `index?`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2100](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2100)

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

#### addSubject()

> **addSubject**(`subject`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1233](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1233)

Add a subject to the EPUB metadata.

##### Parameters

| Parameter | Type                                  | Description                                                                         |
| --------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| `subject` | `string` \| [`DcSubject`](#dcsubject) | May be a string representing just a schema-less subject name, or a DcSubject object |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcsubject

#### copy()

> **copy**(`path?`): `Promise`\<[`Epub`](#epub)\>

Defined in:
[epub/index.ts:658](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L658)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `path?`   | `string` |

##### Returns

`Promise`\<[`Epub`](#epub)\>

#### createXhtmlDocument()

> **createXhtmlDocument**(`body`, `head?`, `language?`):
> `Promise`\<([`XmlElement`](#xmlelement)\<`"?xml"`\> \|
> [`XmlElement`](#xmlelement)\<`"html"`\>)[]\>

Defined in:
[epub/index.ts:2406](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2406)

Create a new XHTML document with the given body and head.

##### Parameters

| Parameter   | Type                      | Description                                        |
| ----------- | ------------------------- | -------------------------------------------------- |
| `body`      | [`ParsedXml`](#parsedxml) | The XML nodes to place in the body of the document |
| `head?`     | [`ParsedXml`](#parsedxml) | Optional - the XMl nodes to place in the head      |
| `language?` | `Locale`                  | Optional - defaults to the EPUB's language         |

##### Returns

`Promise`\<([`XmlElement`](#xmlelement)\<`"?xml"`\> \|
[`XmlElement`](#xmlelement)\<`"html"`\>)[]\>

#### discardAndClose()

> **discardAndClose**(): `void`

Defined in:
[epub/index.ts:2945](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2945)

##### Returns

`void`

#### findAllMetadataItems()

> **findAllMetadataItems**(`predicate`): `Promise`\<`object`[]\>

Defined in:
[epub/index.ts:903](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L903)

Returns the item in the metadata element's children array that matches the
provided predicate.

##### Parameters

| Parameter   | Type                   |
| ----------- | ---------------------- |
| `predicate` | (`entry`) => `boolean` |

##### Returns

`Promise`\<`object`[]\>

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
[epub/index.ts:894](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L894)

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

#### getBaseDirection()

> **getBaseDirection**(): `Promise`\<`"auto"` \| `"rtl"` \| `"ltr"`\>

Defined in:
[epub/index.ts:1187](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1187)

Retrieve the base direction from the package element.

If there is no `dir` attribute on the package element, returns 'auto'.

##### Returns

`Promise`\<`"auto"` \| `"rtl"` \| `"ltr"`\>

##### Link

https://www.w3.org/TR/epub-33/#attrdef-dir

#### getCollections()

> **getCollections**(): `Promise`\<[`Collection`](#collection)[]\>

Defined in:
[epub/index.ts:1664](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1664)

Retrieve the list of collections.

##### Returns

`Promise`\<[`Collection`](#collection)[]\>

#### getContributors()

> **getContributors**(): `Promise`\<[`DcCreator`](#dccreator)[]\>

Defined in:
[epub/index.ts:1878](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1878)

Retrieve the list of contributors.

This is a convenience method for `epub.getCreators('contributor')`.

##### Returns

`Promise`\<[`DcCreator`](#dccreator)[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dccontributor

#### getCoverImage()

> **getCoverImage**(): `Promise`\<`null` \| `Uint8Array`\<`ArrayBufferLike`\>\>

Defined in:
[epub/index.ts:1083](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1083)

Retrieve the cover image data as a byte array.

This does not include, for example, the cover image's filename or mime type. To
retrieve the image manifest item, use epub.getCoverImageItem().

##### Returns

`Promise`\<`null` \| `Uint8Array`\<`ArrayBufferLike`\>\>

##### Link

https://www.w3.org/TR/epub-33/#sec-cover-image

#### getCoverImageItem()

> **getCoverImageItem**(): `Promise`\<`null` \|
> [`ManifestItem`](#manifestitem)\>

Defined in:
[epub/index.ts:1064](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1064)

Retrieve the cover image manifest item.

This does not return the actual image data. To retrieve the image data, pass
this item's id to epub.readItemContents, or use epub.getCoverImage() instead.

##### Returns

`Promise`\<`null` \| [`ManifestItem`](#manifestitem)\>

##### Link

https://www.w3.org/TR/epub-33/#sec-cover-image

#### getCreators()

> **getCreators**(`type`): `Promise`\<[`DcCreator`](#dccreator)[]\>

Defined in:
[epub/index.ts:1817](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1817)

Retrieve the list of creators.

##### Parameters

| Parameter | Type                           | Default value |
| --------- | ------------------------------ | ------------- |
| `type`    | `"creator"` \| `"contributor"` | `"creator"`   |

##### Returns

`Promise`\<[`DcCreator`](#dccreator)[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dccreator

#### getDescription()

> **getDescription**(): `Promise`\<`null` \| `string`\>

Defined in:
[epub/index.ts:1515](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1515)

Retrieve the Epub's description as specified in its package document metadata.

If no description metadata is specified, returns null. Returns the description
as a string. Descriptions may include HTML markup.

##### Returns

`Promise`\<`null` \| `string`\>

#### getGuideEntries()

> **getGuideEntries**(): `Promise`\<`GuideItem`[]\>

Defined in:
[epub/index.ts:2922](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2922)

Retrieve the guide entries from the package document.

The guide element is deprecated in EPUB 3 in favor of the landmarks nav, but
many publications still include it.

##### Returns

`Promise`\<`GuideItem`[]\>

#### getIdentifier()

> **getIdentifier**(): `Promise`\<`null` \| `string`\>

Defined in:
[epub/index.ts:998](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L998)

Retrieve the identifier from the dc:identifier element in the EPUB metadata.

If there is no dc:identifier element, returns null.

##### Returns

`Promise`\<`null` \| `string`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier

#### getLandmarks()

> **getLandmarks**(`__namedParameters`): `Promise`\<`null` \|
> [`Navigation`](#navigation)\>

Defined in:
[epub/index.ts:2279](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2279)

Returns the structured landmarks navigation document as a Navigation object

##### Parameters

| Parameter                          | Type                               |
| ---------------------------------- | ---------------------------------- |
| `__namedParameters`                | \{ `resolveToRoot?`: `boolean`; \} |
| `__namedParameters.resolveToRoot?` | `boolean`                          |

##### Returns

`Promise`\<`null` \| [`Navigation`](#navigation)\>

##### Link

https://www.w3.org/TR/epub-33/#sec-nav-landmarks

#### getLanguage()

> **getLanguage**(): `Promise`\<`null` \| `Locale`\>

Defined in:
[epub/index.ts:1352](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1352)

Retrieve the Epub's language as specified in its package document metadata.

If no language metadata is specified, returns null. Returns the language as an
Intl.Locale instance.

##### Returns

`Promise`\<`null` \| `Locale`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dclanguage

#### getLayout()

> **getLayout**(): `Promise`\<`"pre-paginated"` \| `"reflowable"`\>

Defined in:
[epub/index.ts:1168](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1168)

Retrieve the layout from the rendition:layout meta element in the EPUB metadata.

If there is no meta element, returns 'reflowable'.

##### Returns

`Promise`\<`"pre-paginated"` \| `"reflowable"`\>

##### Link

https://www.w3.org/TR/epub-33/#layout

#### getManifest()

> **getManifest**(): `Promise`\<`Record`\<`string`,
> [`ManifestItem`](#manifestitem)\>\>

Defined in:
[epub/index.ts:819](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L819)

Retrieve the manifest for the Epub.

This is represented as a map from each manifest items' id to the rest of its
properties.

##### Returns

`Promise`\<`Record`\<`string`, [`ManifestItem`](#manifestitem)\>\>

##### Link

https://www.w3.org/TR/epub-33/#sec-pkg-manifest

#### getMetadata()

> **getMetadata**(): `Promise`\<[`EpubMetadata`](#epubmetadata)\>

Defined in:
[epub/index.ts:970](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L970)

Retrieve the metadata entries for the Epub.

This is represented as an array of metadata entries, in the order that they're
presented in the Epub package document.

For more useful semantic representations of metadata, use specific methods such
as `getTitle()` and `getAuthors()`.

##### Returns

`Promise`\<[`EpubMetadata`](#epubmetadata)\>

##### Link

https://www.w3.org/TR/epub-33/#sec-pkg-metadata

#### getModifiedDate()

> **getModifiedDate**(): `Promise`\<`null` \| `Date`\>

Defined in:
[epub/index.ts:1151](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1151)

Retrieve the modified date from the dcterms:modified metadata in the EPUB
metadata as a Date object.

If there is no meta element with dcterms:modified, returns null.

##### Returns

`Promise`\<`null` \| `Date`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-metadata-last-modified

#### getNcxTableOfContents()

> **getNcxTableOfContents**(): `Promise`\<[`NavigationList`](#navigationlist)\>

Defined in:
[epub/index.ts:2827](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2827)

Parse the NCX table of contents, if one exists, and return a tree of TocEntry
nodes.

Useful for both EPUB 2 publications (where the NCX is the primary navigation)
and EPUB 3 publications that retain an NCX for backwards compatibility.

##### Returns

`Promise`\<[`NavigationList`](#navigationlist)\>

#### getPackageVocabularyPrefixes()

> **getPackageVocabularyPrefixes**(): `Promise`\<`Record`\<`string`,
> `string`\>\>

Defined in:
[epub/index.ts:1532](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1532)

Return the set of custom vocabulary prefixes set on this publication's root
package element.

Returns a map from prefix to URI

##### Returns

`Promise`\<`Record`\<`string`, `string`\>\>

##### Link

https://www.w3.org/TR/epub-33/#sec-prefix-attr

#### getPageList()

> **getPageList**(`__namedParameters`): `Promise`\<`null` \|
> [`Navigation`](#navigation)\>

Defined in:
[epub/index.ts:2291](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2291)

Returns the structured page list navigation document as a Navigation object

##### Parameters

| Parameter                          | Type                               |
| ---------------------------------- | ---------------------------------- |
| `__namedParameters`                | \{ `resolveToRoot?`: `boolean`; \} |
| `__namedParameters.resolveToRoot?` | `boolean`                          |

##### Returns

`Promise`\<`null` \| [`Navigation`](#navigation)\>

##### Link

https://www.w3.org/TR/epub-33/#sec-nav-landmarks

#### getPublicationDate()

> **getPublicationDate**(): `Promise`\<`null` \| `Date`\>

Defined in:
[epub/index.ts:1120](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1120)

Retrieve the publication date from the dc:date element in the EPUB metadata as a
Date object.

If there is no dc:date element, returns null.

##### Returns

`Promise`\<`null` \| `Date`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcdate

#### getRootfile()

> **getRootfile**(): `Promise`\<`string`\>

Defined in:
[epub/index.ts:691](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L691)

##### Returns

`Promise`\<`string`\>

#### getSpineItems()

> **getSpineItems**(): `Promise`\<[`ManifestItem`](#manifestitem)[]\>

Defined in:
[epub/index.ts:2081](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2081)

Retrieve the manifest items that make up the Epub's spine.

The spine specifies the order that the contents of the Epub should be displayed
to users by default.

##### Returns

`Promise`\<[`ManifestItem`](#manifestitem)[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-spine-elem

#### getSubjects()

> **getSubjects**(): `Promise`\<(`string` \| [`DcSubject`](#dcsubject))[]\>

Defined in:
[epub/index.ts:1307](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1307)

Retrieve the list of subjects for this EPUB.

Subjects without associated authority and term metadata will be returned as
strings. Otherwise, they will be represented as DcSubject objects, with a value,
authority, and term.

##### Returns

`Promise`\<(`string` \| [`DcSubject`](#dcsubject))[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcsubject

#### getSubtitle()

> **getSubtitle**(): `Promise`\<`null` \| `string`\>

Defined in:
[epub/index.ts:1422](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1422)

Retrieve the subtitle of the Epub, if it exists.

##### Returns

`Promise`\<`null` \| `string`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

#### getTableOfContents()

> **getTableOfContents**(`__namedParameters`): `Promise`\<`null` \|
> [`Navigation`](#navigation)\>

Defined in:
[epub/index.ts:2262](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2262)

Returns the structured table of contents navigation document as a Navigation
object.

##### Parameters

| Parameter                          | Type                               |
| ---------------------------------- | ---------------------------------- |
| `__namedParameters`                | \{ `resolveToRoot?`: `boolean`; \} |
| `__namedParameters.resolveToRoot?` | `boolean`                          |

##### Returns

`Promise`\<`null` \| [`Navigation`](#navigation)\>

##### Link

https://www.w3.org/TR/epub-33/#sec-nav-toc

#### getTitle()

> **getTitle**(`expanded`): `Promise`\<`null` \| `string`\>

Defined in:
[epub/index.ts:1398](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1398)

Retrieve the title of the Epub.

##### Parameters

| Parameter  | Type      | Default value |
| ---------- | --------- | ------------- |
| `expanded` | `boolean` | `false`       |

##### Returns

`Promise`\<`null` \| `string`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

#### getTitles()

> **getTitles**(): `Promise`\<`object`[]\>

Defined in:
[epub/index.ts:1434](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1434)

Retrieve all title entries of the Epub.

##### Returns

`Promise`\<`object`[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

#### getType()

> **getType**(): `Promise`\<`null` \| [`MetadataEntry`](#metadataentry)\>

Defined in:
[epub/index.ts:1220](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1220)

Retrieve the publication type from the dc:type element in the EPUB metadata.

If there is no dc:type element, returns null.

##### Returns

`Promise`\<`null` \| [`MetadataEntry`](#metadataentry)\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctype

#### getVersion()

> **getVersion**(): `Promise`\<`string`\>

Defined in:
[epub/index.ts:2814](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2814)

Returns the EPUB version declared on the package element.

##### Returns

`Promise`\<`string`\>

#### readFileContents()

##### Call Signature

> **readFileContents**(`href`, `relativeTo?`):
> `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in:
[epub/index.ts:2345](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2345)

Retrieve the contents of a file, given its href.

Optionally takes the href that this href should be resolved relative to, and an
encoding parameter.

###### Parameters

| Parameter     | Type     | Description                      |
| ------------- | -------- | -------------------------------- |
| `href`        | `string` | The href of the file to retrieve |
| `relativeTo?` | `string` | -                                |

###### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

##### Call Signature

> **readFileContents**(`href`, `relativeTo`, `encoding`): `Promise`\<`string`\>

Defined in:
[epub/index.ts:2346](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2346)

Retrieve the contents of a file, given its href.

Optionally takes the href that this href should be resolved relative to, and an
encoding parameter.

###### Parameters

| Parameter    | Type                    | Description                                                                                                                                                        |
| ------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `href`       | `string`                | The href of the file to retrieve                                                                                                                                   |
| `relativeTo` | `undefined` \| `string` | -                                                                                                                                                                  |
| `encoding`   | `"utf-8"`               | Optional - Must be the string "utf-8". If provided, the function will encode the data into a unicode string. Otherwise, the data will be returned as a byte array. |

###### Returns

`Promise`\<`string`\>

#### readItemContents()

##### Call Signature

> **readItemContents**(`id`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in:
[epub/index.ts:2378](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2378)

Retrieve the contents of a manifest item, given its id.

###### Parameters

| Parameter | Type     | Description                             |
| --------- | -------- | --------------------------------------- |
| `id`      | `string` | The id of the manifest item to retrieve |

###### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

###### Link

https://www.w3.org/TR/epub-33/#sec-contentdocs

##### Call Signature

> **readItemContents**(`id`, `encoding`): `Promise`\<`string`\>

Defined in:
[epub/index.ts:2379](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2379)

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

#### readXhtmlItemContents()

##### Call Signature

> **readXhtmlItemContents**(`id`, `as?`): `Promise`\<[`ParsedXml`](#parsedxml)\>

Defined in:
[epub/index.ts:2441](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2441)

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

##### Call Signature

> **readXhtmlItemContents**(`id`, `as`): `Promise`\<`string`\>

Defined in:
[epub/index.ts:2442](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2442)

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

#### removeCollection()

> **removeCollection**(`index`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1773](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1773)

Remove a collection from the EPUB metadata.

Removes the collection at the provided index. This index refers to the array
returned by `epub.getCollections()`.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `index`   | `number` |

##### Returns

`Promise`\<`void`\>

#### removeContributor()

> **removeContributor**(`index`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2030](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2030)

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

#### removeCreator()

> **removeCreator**(`index`, `type`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1978](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1978)

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

#### removeManifestItem()

> **removeManifestItem**(`id`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2537](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2537)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

##### Returns

`Promise`\<`void`\>

#### removeMetadata()

> **removeMetadata**(`predicate`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2786](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2786)

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

#### removeSpineItem()

> **removeSpineItem**(`index`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2136](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2136)

Remove the spine item at the specified index.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `index`   | `number` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-spine-elem

#### removeSubject()

> **removeSubject**(`index`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1270](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1270)

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

#### replaceMetadata()

> **replaceMetadata**(`predicate`, `entry`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2741](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2741)

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

#### resolveHref()

> **resolveHref**(`href`, `relativeTo?`, `__namedParameters?`):
> `Promise`\<`string`\>

Defined in:
[epub/index.ts:2317](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2317)

Returns a path-relative-scheme-less URL, relative to the container root.

##### Parameters

| Parameter                   | Type                        | Description                                                                                                                         |
| --------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `href`                      | `string`                    | The href to resolve                                                                                                                 |
| `relativeTo?`               | `string`                    | Optional - The href to resolve this href relative to. Use if resolving a relative href from a file other than the package document. |
| `__namedParameters?`        | \{ `toRoot?`: `boolean`; \} | -                                                                                                                                   |
| `__namedParameters.toRoot?` | `boolean`                   | -                                                                                                                                   |

##### Returns

`Promise`\<`string`\>

#### saveAndClose()

> **saveAndClose**(): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2961](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2961)

Write the current contents of the Epub to a new EPUB archive on disk.

When this method is called, the "dcterms:modified" meta tag is automatically
updated to the current UTC timestamp.

##### Returns

`Promise`\<`void`\>

#### setCoverImage()

> **setCoverImage**(`href`, `data`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1097](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1097)

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

#### setDescription()

> **setDescription**(`description`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1499](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1499)

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

#### setIdentifier()

> **setIdentifier**(`identifier`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1012](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1012)

Set the dc:identifier metadata element with the provided string.

Updates the existing dc:identifier element if one exists. Otherwise creates a
new element

##### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `identifier` | `string` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier

#### setLanguage()

> **setLanguage**(`locale`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1381](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1381)

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

#### setPackageVocabularyPrefix()

> **setPackageVocabularyPrefix**(`prefix`, `uri`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1550](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1550)

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

#### setPublicationDate()

> **setPublicationDate**(`date`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1135](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1135)

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

#### setTitle()

> **setTitle**(`title`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1574](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1574)

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

#### setTitles()

> **setTitles**(`entries`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1602](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1602)

##### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `entries` | `object`[] |

##### Returns

`Promise`\<`void`\>

#### setType()

> **setType**(`type`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1204](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1204)

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

#### updateManifestItem()

> **updateManifestItem**(`id`, `newItem`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2653](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2653)

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

#### writeItemContents()

##### Call Signature

> **writeItemContents**(`id`, `contents`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2489](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2489)

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

##### Call Signature

> **writeItemContents**(`id`, `contents`, `encoding`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2490](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2490)

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

#### writeXhtmlItemContents()

> **writeXhtmlItemContents**(`id`, `contents`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2529](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2529)

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

#### addLinkToXhtmlHead()

> `static` **addLinkToXhtmlHead**(`xml`, `link`): `void`

Defined in:
[epub/index.ts:313](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L313)

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

#### create()

> `static` **create**(`path`, `__namedParameters`, `additionalMetadata`):
> `Promise`\<[`Epub`](#epub)\>

Defined in:
[epub/index.ts:506](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L506)

Construct an Epub instance, optionally beginning with the provided metadata.

##### Parameters

| Parameter            | Type                            | Default value | Description                             |
| -------------------- | ------------------------------- | ------------- | --------------------------------------- |
| `path`               | `string`                        | `undefined`   | -                                       |
| `__namedParameters`  | [`DublinCore`](#dublincore)     | `undefined`   | -                                       |
| `additionalMetadata` | [`EpubMetadata`](#epubmetadata) | `[]`          | An array of additional metadata entries |

##### Returns

`Promise`\<[`Epub`](#epub)\>

#### createXmlElement()

> `static` **createXmlElement**\<`Name`\>(`name`, `properties`, `children`):
> [`XmlElement`](#xmlelement)\<`Name`\>

Defined in:
[epub/index.ts:348](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L348)

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

#### createXmlTextNode()

> `static` **createXmlTextNode**(`text`): [`XmlTextNode`](#xmltextnode)

Defined in:
[epub/index.ts:361](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L361)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `text`    | `string` |

##### Returns

[`XmlTextNode`](#xmltextnode)

#### findXmlChildByName()

> `static` **findXmlChildByName**\<`Name`\>(`name`, `xml`, `filter?`):
> `undefined` \| [`XmlElement`](#xmlelement)\<`Name`\>

Defined in:
[epub/index.ts:434](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L434)

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

#### findXmlDescendantByName()

> `static` **findXmlDescendantByName**\<`Name`\>(`name`, `xml`, `filter?`):
> `undefined` \| [`XmlElement`](#xmlelement)\<`Name`\>

Defined in:
[epub/index.ts:452](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L452)

Given an XML structure, find the first descendant matching the provided name and
optional filter.

Will perform a breadth first search for the element, returning the highest
element in the tree matching the name and filter.

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

#### formatSmilDuration()

> `static` **formatSmilDuration**(`duration`): `string`

Defined in:
[epub/index.ts:296](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L296)

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

#### from()

> `static` **from**(`pathOrData`): `Promise`\<[`Epub`](#epub)\>

Defined in:
[epub/index.ts:589](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L589)

Construct an Epub instance by reading an existing EPUB publication.

##### Parameters

| Parameter    | Type                                          | Description                                                                                                                           |
| ------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pathOrData` | `string` \| `Uint8Array`\<`ArrayBufferLike`\> | Must be either a string representing the path to an EPUB file on disk, or a Uint8Array representing the data of the EPUB publication. |

##### Returns

`Promise`\<[`Epub`](#epub)\>

#### getXhtmlBody()

> `static` **getXhtmlBody**(`xml`): [`ParsedXml`](#parsedxml)

Defined in:
[epub/index.ts:338](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L338)

Given an XML structure representing a complete XHTML document, return the
sub-structure representing the children of the document's body element.

##### Parameters

| Parameter | Type                      |
| --------- | ------------------------- |
| `xml`     | [`ParsedXml`](#parsedxml) |

##### Returns

[`ParsedXml`](#parsedxml)

#### getXhtmlTextContent()

> `static` **getXhtmlTextContent**(`xml`): `string`

Defined in:
[epub/index.ts:370](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L370)

Given an XML structure representing a complete XHTML document, return a string
representing the concatenation of all text nodes in the document.

##### Parameters

| Parameter | Type                      |
| --------- | ------------------------- |
| `xml`     | [`ParsedXml`](#parsedxml) |

##### Returns

`string`

#### getXmlAttributes()

> `static` **getXmlAttributes**(`element`): `Record`\<`string`, `string`\>

Defined in:
[epub/index.ts:387](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L387)

Given an XMLElement, return its attributes.

##### Parameters

| Parameter | Type                        |
| --------- | --------------------------- |
| `element` | [`XmlElement`](#xmlelement) |

##### Returns

`Record`\<`string`, `string`\>

#### getXmlChildren()

> `static` **getXmlChildren**\<`Name`\>(`element`): [`ParsedXml`](#parsedxml)

Defined in:
[epub/index.ts:414](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L414)

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

#### getXmlElementName()

> `static` **getXmlElementName**\<`Name`\>(`element`): `Name`

Defined in:
[epub/index.ts:399](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L399)

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

#### isXmlTextNode()

> `static` **isXmlTextNode**(`node`): `node is XmlTextNode`

Defined in:
[epub/index.ts:474](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L474)

Given an XMLNode, determine whether it represents a text node or an XML element.

##### Parameters

| Parameter | Type                  |
| --------- | --------------------- |
| `node`    | [`XmlNode`](#xmlnode) |

##### Returns

`node is XmlTextNode`

#### replaceXmlChildren()

> `static` **replaceXmlChildren**\<`Name`\>(`element`, `children`): `void`

Defined in:
[epub/index.ts:422](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L422)

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

#### upgrade()

> `static` **upgrade**(`path`, `options`): `Promise`\<[`Epub`](#epub)\>

Defined in:
[epub/index.ts:3032](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L3032)

Upgrade an EPUB 2 publication to EPUB 3 in place, returning a new, valid Epub 3
instance.

Performs the following transformations:

- upgrades OPF metadata to EPUB 3 conventions
- scans XHTML documents and adds manifest item properties
- parses the NCX into a TOC tree and generates a nav.xhtml
- removes the NCX file and the guide element (configurable)
- fixes common font MIME types
- bumps the package version to 3.0
- goes over each xhtml item and rewrites it using XMLParser to make sure the
  output is valid XHTML

##### Parameters

| Parameter | Type                                          |
| --------- | --------------------------------------------- |
| `path`    | `string`                                      |
| `options` | [`Epub2UpgradeOptions`](#epub2upgradeoptions) |

##### Returns

`Promise`\<[`Epub`](#epub)\>

---

## EpubVersionError

Defined in:
[epub/index.ts:206](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L206)

### Extends

- `Error`

### Constructors

#### Constructor

> **new EpubVersionError**(`message?`): [`EpubVersionError`](#epubversionerror)

Defined in: node_modules/typescript/lib/lib.es5.d.ts:1082

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `message?` | `string` |

##### Returns

[`EpubVersionError`](#epubversionerror)

##### Inherited from

`Error.constructor`

#### Constructor

> **new EpubVersionError**(`message?`, `options?`):
> [`EpubVersionError`](#epubversionerror)

Defined in: node_modules/typescript/lib/lib.es5.d.ts:1082

##### Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `message?` | `string`       |
| `options?` | `ErrorOptions` |

##### Returns

[`EpubVersionError`](#epubversionerror)

##### Inherited from

`Error.constructor`

### Properties

#### cause?

> `optional` **cause**: `unknown`

Defined in: node_modules/typescript/lib/lib.es2022.error.d.ts:26

##### Inherited from

`Error.cause`

#### message

> **message**: `string`

Defined in: node_modules/typescript/lib/lib.es5.d.ts:1077

##### Inherited from

`Error.message`

#### name

> **name**: `string`

Defined in: node_modules/typescript/lib/lib.es5.d.ts:1076

##### Inherited from

`Error.name`

#### stack?

> `optional` **stack**: `string`

Defined in: node_modules/typescript/lib/lib.es5.d.ts:1078

##### Inherited from

`Error.stack`

#### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node_modules/@types/node/globals.d.ts:68

The `Error.stackTraceLimit` property specifies the number of stack frames
collected by a stack trace (whether generated by `new Error().stack` or
`Error.captureStackTrace(obj)`).

The default value is `10` but may be set to any valid JavaScript number. Changes
will affect any stack trace captured _after_ the value has been changed.

If set to a non-number value, or set to a negative number, stack traces will not
capture any frames.

##### Inherited from

`Error.stackTraceLimit`

### Methods

#### captureStackTrace()

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Defined in: node_modules/@types/node/globals.d.ts:52

Creates a `.stack` property on `targetObject`, which when accessed returns a
string representing the location in the code at which
`Error.captureStackTrace()` was called.

```js
const myObject = {}
Error.captureStackTrace(myObject)
myObject.stack // Similar to `new Error().stack`
```

The first line of the trace will be prefixed with
`${myObject.name}: ${myObject.message}`.

The optional `constructorOpt` argument accepts a function. If given, all frames
above `constructorOpt`, including `constructorOpt`, will be omitted from the
generated stack trace.

The `constructorOpt` argument is useful for hiding implementation details of
error generation from the user. For instance:

```js
function a() {
  b()
}

function b() {
  c()
}

function c() {
  // Create an error without stack trace to avoid calculating the stack trace twice.
  const { stackTraceLimit } = Error
  Error.stackTraceLimit = 0
  const error = new Error()
  Error.stackTraceLimit = stackTraceLimit

  // Capture the stack trace above function b
  Error.captureStackTrace(error, b) // Neither function c, nor b is included in the stack trace
  throw error
}

a()
```

##### Parameters

| Parameter         | Type       |
| ----------------- | ---------- |
| `targetObject`    | `object`   |
| `constructorOpt?` | `Function` |

##### Returns

`void`

##### Inherited from

`Error.captureStackTrace`

#### isError()

> `static` **isError**(`error`): `error is Error`

Defined in: node_modules/typescript/lib/lib.esnext.error.d.ts:23

Indicates whether the argument provided is a built-in Error instance or not.

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `error`   | `unknown` |

##### Returns

`error is Error`

##### Inherited from

`Error.isError`

#### prepareStackTrace()

> `static` **prepareStackTrace**(`err`, `stackTraces`): `any`

Defined in: node_modules/@types/node/globals.d.ts:56

##### Parameters

| Parameter     | Type         |
| ------------- | ------------ |
| `err`         | `Error`      |
| `stackTraces` | `CallSite`[] |

##### Returns

`any`

##### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

##### Inherited from

`Error.prepareStackTrace`

---

## AlternateScript

Defined in:
[epub/index.ts:116](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L116)

### Properties

#### locale

> **locale**: `Locale`

Defined in:
[epub/index.ts:118](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L118)

#### name

> **name**: `string`

Defined in:
[epub/index.ts:117](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L117)

---

## Collection

Defined in:
[epub/index.ts:140](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L140)

### Properties

#### name

> **name**: `string`

Defined in:
[epub/index.ts:141](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L141)

#### position?

> `optional` **position**: `string`

Defined in:
[epub/index.ts:143](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L143)

#### type?

> `optional` **type**: `string`

Defined in:
[epub/index.ts:142](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L142)

---

## DcCreator

Defined in:
[epub/index.ts:121](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L121)

### Properties

#### alternateScripts?

> `optional` **alternateScripts**: [`AlternateScript`](#alternatescript)[]

Defined in:
[epub/index.ts:126](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L126)

#### fileAs?

> `optional` **fileAs**: `string`

Defined in:
[epub/index.ts:125](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L125)

#### name

> **name**: `string`

Defined in:
[epub/index.ts:122](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L122)

#### role?

> `optional` **role**: `string`

Defined in:
[epub/index.ts:123](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L123)

#### roleScheme?

> `optional` **roleScheme**: `string`

Defined in:
[epub/index.ts:124](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L124)

---

## DcSubject

Defined in:
[epub/index.ts:110](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L110)

### Properties

#### authority

> **authority**: `string`

Defined in:
[epub/index.ts:112](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L112)

#### term

> **term**: `string`

Defined in:
[epub/index.ts:113](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L113)

#### value

> **value**: `string`

Defined in:
[epub/index.ts:111](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L111)

---

## DublinCore

Defined in:
[epub/index.ts:129](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L129)

### Properties

#### contributors?

> `optional` **contributors**: [`DcCreator`](#dccreator)[]

Defined in:
[epub/index.ts:136](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L136)

#### creators?

> `optional` **creators**: [`DcCreator`](#dccreator)[]

Defined in:
[epub/index.ts:135](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L135)

#### date?

> `optional` **date**: `Date`

Defined in:
[epub/index.ts:133](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L133)

#### identifier

> **identifier**: `string`

Defined in:
[epub/index.ts:132](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L132)

#### language

> **language**: `Locale`

Defined in:
[epub/index.ts:131](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L131)

#### subjects?

> `optional` **subjects**: (`string` \| [`DcSubject`](#dcsubject))[]

Defined in:
[epub/index.ts:134](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L134)

#### title

> **title**: `string`

Defined in:
[epub/index.ts:130](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L130)

#### type?

> `optional` **type**: `string`

Defined in:
[epub/index.ts:137](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L137)

---

## Epub2UpgradeOptions

Defined in:
[epub/upgrade.ts:93](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/upgrade.ts#L93)

### Properties

#### outputPath?

> `optional` **outputPath**: `string`

Defined in:
[epub/upgrade.ts:97](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/upgrade.ts#L97)

The path to the output file. If provided, the input file will be copied to the
output path.

#### removeNcx?

> `optional` **removeNcx**: `boolean`

Defined in:
[epub/upgrade.ts:101](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/upgrade.ts#L101)

Whether to remove the NCX file, as it's technically optional in EPUB 3.

---

## Landmark

Defined in:
[epub/upgrade.ts:87](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/upgrade.ts#L87)

### Properties

#### href

> **href**: `string`

Defined in:
[epub/upgrade.ts:88](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/upgrade.ts#L88)

#### title

> **title**: `string`

Defined in:
[epub/upgrade.ts:89](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/upgrade.ts#L89)

#### type

> **type**: `string`

Defined in:
[epub/upgrade.ts:90](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/upgrade.ts#L90)

---

## Navigation

Defined in:
[epub/index.ts:154](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L154)

### Properties

#### children

> **children**: [`NavigationList`](#navigationlist)

Defined in:
[epub/index.ts:156](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L156)

#### title?

> `optional` **title**: `string`

Defined in:
[epub/index.ts:155](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L155)

---

## NavigationItem

Defined in:
[epub/index.ts:146](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L146)

### Properties

#### children?

> `optional` **children**: [`NavigationList`](#navigationlist)

Defined in:
[epub/index.ts:149](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L149)

#### href?

> `optional` **href**: `string`

Defined in:
[epub/index.ts:148](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L148)

#### title

> **title**: `string`

Defined in:
[epub/index.ts:147](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L147)

---

## ElementName

> **ElementName** =
> \`$\{Letter \| Uppercase\<Letter\> \| QuestionMark\}$\{string\}\`

Defined in:
[epub/index.ts:71](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L71)

A valid name for an XML element (must start with a letter)

---

## EpubMetadata

> **EpubMetadata** = [`MetadataEntry`](#metadataentry)[]

Defined in:
[epub/index.ts:108](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L108)

---

## ManifestItem

> **ManifestItem** = `object`

Defined in:
[epub/index.ts:92](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L92)

### Properties

#### fallback?

> `optional` **fallback**: `string`

Defined in:
[epub/index.ts:96](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L96)

#### href

> **href**: `string`

Defined in:
[epub/index.ts:94](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L94)

#### id

> **id**: `string`

Defined in:
[epub/index.ts:93](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L93)

#### mediaOverlay?

> `optional` **mediaOverlay**: `string`

Defined in:
[epub/index.ts:97](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L97)

#### mediaType?

> `optional` **mediaType**: `string`

Defined in:
[epub/index.ts:95](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L95)

#### properties?

> `optional` **properties**: `string`[]

Defined in:
[epub/index.ts:98](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L98)

---

## MetadataEntry

> **MetadataEntry** = `object`

Defined in:
[epub/index.ts:101](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L101)

### Properties

#### id?

> `optional` **id**: `string`

Defined in:
[epub/index.ts:102](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L102)

#### properties

> **properties**: `Record`\<`string`, `string`\>

Defined in:
[epub/index.ts:104](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L104)

#### type

> **type**: [`ElementName`](#elementname)

Defined in:
[epub/index.ts:103](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L103)

#### value

> **value**: `string` \| `undefined`

Defined in:
[epub/index.ts:105](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L105)

---

## NavigationList

> **NavigationList** = [`NavigationItem`](#navigationitem)[]

Defined in:
[epub/index.ts:152](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L152)

---

## PackageElement

> **PackageElement** = [`XmlElement`](#xmlelement)\<`"package"`\>

Defined in:
[epub/index.ts:165](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L165)

---

## ParsedXml

> **ParsedXml** = [`XmlNode`](#xmlnode)[]

Defined in:
[epub/index.ts:90](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L90)

An XML structure

---

## XmlElement\<Name\>

> **XmlElement**\<`Name`\> = `object` & `{ [key in Name]: ParsedXml }`

Defined in:
[epub/index.ts:77](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L77)

An XML element

### Type Declaration

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
[epub/index.ts:87](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L87)

A valid XML node. May be either an element or a text node.

---

## XmlTextNode

> **XmlTextNode** = `object`

Defined in:
[epub/index.ts:84](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L84)

A text node in an XML document

### Properties

#### #text

> **#text**: `string`

Defined in:
[epub/index.ts:84](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L84)
