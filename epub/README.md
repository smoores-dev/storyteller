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
[epub/index.ts:229](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L229)

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
[epub/index.ts:510](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L510)

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
[epub/index.ts:511](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L511)

#### inputPath

> `protected` **inputPath**: `undefined` \| `string`

Defined in:
[epub/index.ts:512](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L512)

#### xhtmlBuilder

> `static` **xhtmlBuilder**: `XMLBuilder`

Defined in:
[epub/index.ts:277](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L277)

#### xhtmlParser

> `static` **xhtmlParser**: `XMLParser`

Defined in:
[epub/index.ts:237](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L237)

#### xmlBuilder

> `static` **xmlBuilder**: `XMLBuilder`

Defined in:
[epub/index.ts:270](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L270)

#### xmlParser

> `static` **xmlParser**: `XMLParser`

Defined in:
[epub/index.ts:230](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L230)

### Methods

#### \[dispose\]()

> **\[dispose\]**(): `void`

Defined in:
[epub/index.ts:3128](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L3128)

##### Returns

`void`

#### addCollection()

> **addCollection**(`collection`, `index?`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1728](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1728)

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
[epub/index.ts:2070](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2070)

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
[epub/index.ts:1915](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1915)

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
[epub/index.ts:2600](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2600)

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
[epub/index.ts:2605](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2605)

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
[epub/index.ts:2610](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2610)

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
[epub/index.ts:2722](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2722)

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
[epub/index.ts:2124](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2124)

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
[epub/index.ts:1257](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1257)

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
[epub/index.ts:682](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L682)

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
[epub/index.ts:2426](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2426)

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
[epub/index.ts:2965](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2965)

##### Returns

`void`

#### findAllMetadataItems()

> **findAllMetadataItems**(`predicate`): `Promise`\<`object`[]\>

Defined in:
[epub/index.ts:927](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L927)

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
[epub/index.ts:918](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L918)

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
[epub/index.ts:1211](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1211)

Retrieve the base direction from the package element.

If there is no `dir` attribute on the package element, returns 'auto'.

##### Returns

`Promise`\<`"auto"` \| `"rtl"` \| `"ltr"`\>

##### Link

https://www.w3.org/TR/epub-33/#attrdef-dir

#### getCollections()

> **getCollections**(): `Promise`\<[`Collection`](#collection)[]\>

Defined in:
[epub/index.ts:1688](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1688)

Retrieve the list of collections.

##### Returns

`Promise`\<[`Collection`](#collection)[]\>

#### getContributors()

> **getContributors**(): `Promise`\<[`DcCreator`](#dccreator)[]\>

Defined in:
[epub/index.ts:1902](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1902)

Retrieve the list of contributors.

This is a convenience method for `epub.getCreators('contributor')`.

##### Returns

`Promise`\<[`DcCreator`](#dccreator)[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dccontributor

#### getCoverImage()

> **getCoverImage**(): `Promise`\<`null` \| `Uint8Array`\<`ArrayBufferLike`\>\>

Defined in:
[epub/index.ts:1107](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1107)

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
[epub/index.ts:1088](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1088)

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
[epub/index.ts:1841](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1841)

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
[epub/index.ts:1539](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1539)

Retrieve the Epub's description as specified in its package document metadata.

If no description metadata is specified, returns null. Returns the description
as a string. Descriptions may include HTML markup.

##### Returns

`Promise`\<`null` \| `string`\>

#### getGuideEntries()

> **getGuideEntries**(): `Promise`\<`GuideItem`[]\>

Defined in:
[epub/index.ts:2942](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2942)

Retrieve the guide entries from the package document.

The guide element is deprecated in EPUB 3 in favor of the landmarks nav, but
many publications still include it.

##### Returns

`Promise`\<`GuideItem`[]\>

#### getIdentifier()

> **getIdentifier**(): `Promise`\<`null` \| `string`\>

Defined in:
[epub/index.ts:1022](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1022)

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
[epub/index.ts:2303](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2303)

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
[epub/index.ts:1376](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1376)

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
[epub/index.ts:1192](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1192)

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
[epub/index.ts:843](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L843)

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
[epub/index.ts:994](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L994)

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
[epub/index.ts:1175](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1175)

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
[epub/index.ts:2847](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2847)

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
[epub/index.ts:1556](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1556)

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
[epub/index.ts:2315](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2315)

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
[epub/index.ts:1144](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1144)

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
[epub/index.ts:715](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L715)

##### Returns

`Promise`\<`string`\>

#### getSpineItems()

> **getSpineItems**(): `Promise`\<[`ManifestItem`](#manifestitem)[]\>

Defined in:
[epub/index.ts:2105](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2105)

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
[epub/index.ts:1331](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1331)

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
[epub/index.ts:1446](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1446)

Retrieve the subtitle of the Epub, if it exists.

##### Returns

`Promise`\<`null` \| `string`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

#### getTableOfContents()

> **getTableOfContents**(`__namedParameters`): `Promise`\<`null` \|
> [`Navigation`](#navigation)\>

Defined in:
[epub/index.ts:2286](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2286)

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
[epub/index.ts:1422](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1422)

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
[epub/index.ts:1458](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1458)

Retrieve all title entries of the Epub.

##### Returns

`Promise`\<`object`[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

#### getType()

> **getType**(): `Promise`\<`null` \| [`MetadataEntry`](#metadataentry)\>

Defined in:
[epub/index.ts:1244](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1244)

Retrieve the publication type from the dc:type element in the EPUB metadata.

If there is no dc:type element, returns null.

##### Returns

`Promise`\<`null` \| [`MetadataEntry`](#metadataentry)\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctype

#### getVersion()

> **getVersion**(): `Promise`\<`string`\>

Defined in:
[epub/index.ts:2834](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2834)

Returns the EPUB version declared on the package element.

##### Returns

`Promise`\<`string`\>

#### readFileContents()

##### Call Signature

> **readFileContents**(`href`, `relativeTo?`):
> `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in:
[epub/index.ts:2365](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2365)

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
[epub/index.ts:2366](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2366)

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
[epub/index.ts:2398](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2398)

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
[epub/index.ts:2399](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2399)

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
[epub/index.ts:2461](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2461)

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
[epub/index.ts:2462](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2462)

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
[epub/index.ts:1797](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1797)

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
[epub/index.ts:2054](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2054)

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
[epub/index.ts:2002](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2002)

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
[epub/index.ts:2557](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2557)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

##### Returns

`Promise`\<`void`\>

#### removeMetadata()

> **removeMetadata**(`predicate`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2806](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2806)

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
[epub/index.ts:2160](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2160)

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
[epub/index.ts:1294](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1294)

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
[epub/index.ts:2761](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2761)

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
[epub/index.ts:2337](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2337)

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
[epub/index.ts:2981](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2981)

Write the current contents of the Epub to a new EPUB archive on disk.

When this method is called, the "dcterms:modified" meta tag is automatically
updated to the current UTC timestamp.

##### Returns

`Promise`\<`void`\>

#### setCoverImage()

> **setCoverImage**(`href`, `data`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1121](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1121)

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
[epub/index.ts:1523](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1523)

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
[epub/index.ts:1036](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1036)

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
[epub/index.ts:1405](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1405)

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
[epub/index.ts:1574](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1574)

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
[epub/index.ts:1159](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1159)

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
[epub/index.ts:1598](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1598)

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
[epub/index.ts:1626](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1626)

##### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `entries` | `object`[] |

##### Returns

`Promise`\<`void`\>

#### setType()

> **setType**(`type`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1228](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1228)

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
[epub/index.ts:2673](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2673)

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
[epub/index.ts:2509](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2509)

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
[epub/index.ts:2510](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2510)

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
[epub/index.ts:2549](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2549)

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
[epub/index.ts:307](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L307)

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
[epub/index.ts:530](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L530)

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
[epub/index.ts:342](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L342)

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
[epub/index.ts:355](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L355)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `text`    | `string` |

##### Returns

[`XmlTextNode`](#xmltextnode)

#### findAllXmlDescendantsByName()

> `static` **findAllXmlDescendantsByName**\<`Name`\>(`name`, `xml`, `filter?`):
> [`XmlElement`](#xmlelement)\<`Name`\>[]

Defined in:
[epub/index.ts:471](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L471)

Given an XML structure, find all descendants matching the provided name and
optional filter.

Will perform a breadth first search for the elements, returning the elements in
the order found.

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

[`XmlElement`](#xmlelement)\<`Name`\>[]

#### findXmlChildByName()

> `static` **findXmlChildByName**\<`Name`\>(`name`, `xml`, `filter?`):
> `undefined` \| [`XmlElement`](#xmlelement)\<`Name`\>

Defined in:
[epub/index.ts:428](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L428)

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
[epub/index.ts:446](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L446)

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
[epub/index.ts:290](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L290)

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
[epub/index.ts:613](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L613)

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
[epub/index.ts:332](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L332)

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
[epub/index.ts:364](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L364)

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
[epub/index.ts:381](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L381)

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
[epub/index.ts:408](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L408)

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
[epub/index.ts:393](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L393)

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
[epub/index.ts:498](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L498)

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
[epub/index.ts:416](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L416)

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
[epub/index.ts:3052](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L3052)

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
[epub/index.ts:200](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L200)

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
[epub/index.ts:110](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L110)

### Properties

#### locale

> **locale**: `Locale`

Defined in:
[epub/index.ts:112](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L112)

#### name

> **name**: `string`

Defined in:
[epub/index.ts:111](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L111)

---

## Collection

Defined in:
[epub/index.ts:134](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L134)

### Properties

#### name

> **name**: `string`

Defined in:
[epub/index.ts:135](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L135)

#### position?

> `optional` **position**: `string`

Defined in:
[epub/index.ts:137](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L137)

#### type?

> `optional` **type**: `string`

Defined in:
[epub/index.ts:136](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L136)

---

## DcCreator

Defined in:
[epub/index.ts:115](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L115)

### Properties

#### alternateScripts?

> `optional` **alternateScripts**: [`AlternateScript`](#alternatescript)[]

Defined in:
[epub/index.ts:120](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L120)

#### fileAs?

> `optional` **fileAs**: `string`

Defined in:
[epub/index.ts:119](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L119)

#### name

> **name**: `string`

Defined in:
[epub/index.ts:116](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L116)

#### role?

> `optional` **role**: `string`

Defined in:
[epub/index.ts:117](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L117)

#### roleScheme?

> `optional` **roleScheme**: `string`

Defined in:
[epub/index.ts:118](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L118)

---

## DcSubject

Defined in:
[epub/index.ts:104](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L104)

### Properties

#### authority

> **authority**: `string`

Defined in:
[epub/index.ts:106](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L106)

#### term

> **term**: `string`

Defined in:
[epub/index.ts:107](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L107)

#### value

> **value**: `string`

Defined in:
[epub/index.ts:105](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L105)

---

## DublinCore

Defined in:
[epub/index.ts:123](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L123)

### Properties

#### contributors?

> `optional` **contributors**: [`DcCreator`](#dccreator)[]

Defined in:
[epub/index.ts:130](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L130)

#### creators?

> `optional` **creators**: [`DcCreator`](#dccreator)[]

Defined in:
[epub/index.ts:129](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L129)

#### date?

> `optional` **date**: `Date`

Defined in:
[epub/index.ts:127](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L127)

#### identifier

> **identifier**: `string`

Defined in:
[epub/index.ts:126](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L126)

#### language

> **language**: `Locale`

Defined in:
[epub/index.ts:125](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L125)

#### subjects?

> `optional` **subjects**: (`string` \| [`DcSubject`](#dcsubject))[]

Defined in:
[epub/index.ts:128](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L128)

#### title

> **title**: `string`

Defined in:
[epub/index.ts:124](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L124)

#### type?

> `optional` **type**: `string`

Defined in:
[epub/index.ts:131](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L131)

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
[epub/index.ts:148](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L148)

### Properties

#### children

> **children**: [`NavigationList`](#navigationlist)

Defined in:
[epub/index.ts:150](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L150)

#### title?

> `optional` **title**: `string`

Defined in:
[epub/index.ts:149](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L149)

---

## NavigationItem

Defined in:
[epub/index.ts:140](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L140)

### Properties

#### children?

> `optional` **children**: [`NavigationList`](#navigationlist)

Defined in:
[epub/index.ts:143](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L143)

#### href?

> `optional` **href**: `string`

Defined in:
[epub/index.ts:142](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L142)

#### title

> **title**: `string`

Defined in:
[epub/index.ts:141](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L141)

---

## ElementName

> **ElementName** =
> \`$\{Letter \| Uppercase\<Letter\> \| QuestionMark\}$\{string\}\`

Defined in:
[epub/index.ts:65](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L65)

A valid name for an XML element (must start with a letter)

---

## EpubMetadata

> **EpubMetadata** = [`MetadataEntry`](#metadataentry)[]

Defined in:
[epub/index.ts:102](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L102)

---

## ManifestItem

> **ManifestItem** = `object`

Defined in:
[epub/index.ts:86](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L86)

### Properties

#### fallback?

> `optional` **fallback**: `string`

Defined in:
[epub/index.ts:90](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L90)

#### href

> **href**: `string`

Defined in:
[epub/index.ts:88](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L88)

#### id

> **id**: `string`

Defined in:
[epub/index.ts:87](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L87)

#### mediaOverlay?

> `optional` **mediaOverlay**: `string`

Defined in:
[epub/index.ts:91](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L91)

#### mediaType?

> `optional` **mediaType**: `string`

Defined in:
[epub/index.ts:89](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L89)

#### properties?

> `optional` **properties**: `string`[]

Defined in:
[epub/index.ts:92](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L92)

---

## MetadataEntry

> **MetadataEntry** = `object`

Defined in:
[epub/index.ts:95](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L95)

### Properties

#### id?

> `optional` **id**: `string`

Defined in:
[epub/index.ts:96](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L96)

#### properties

> **properties**: `Record`\<`string`, `string`\>

Defined in:
[epub/index.ts:98](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L98)

#### type

> **type**: [`ElementName`](#elementname)

Defined in:
[epub/index.ts:97](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L97)

#### value

> **value**: `string` \| `undefined`

Defined in:
[epub/index.ts:99](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L99)

---

## NavigationList

> **NavigationList** = [`NavigationItem`](#navigationitem)[]

Defined in:
[epub/index.ts:146](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L146)

---

## PackageElement

> **PackageElement** = [`XmlElement`](#xmlelement)\<`"package"`\>

Defined in:
[epub/index.ts:159](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L159)

---

## ParsedXml

> **ParsedXml** = [`XmlNode`](#xmlnode)[]

Defined in:
[epub/index.ts:84](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L84)

An XML structure

---

## XmlElement\<Name\>

> **XmlElement**\<`Name`\> = `object` & `{ [key in Name]: ParsedXml }`

Defined in:
[epub/index.ts:71](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L71)

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
[epub/index.ts:81](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L81)

A valid XML node. May be either an element or a text node.

---

## XmlTextNode

> **XmlTextNode** = `object`

Defined in:
[epub/index.ts:78](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L78)

A text node in an XML document

### Properties

#### #text

> **#text**: `string`

Defined in:
[epub/index.ts:78](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L78)
