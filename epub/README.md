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
[epub/index.ts:206](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L206)

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
[epub/index.ts:418](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L418)

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
[epub/index.ts:419](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L419)

#### inputPath

> `protected` **inputPath**: `undefined` \| `string`

Defined in:
[epub/index.ts:420](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L420)

#### xhtmlBuilder

> `static` **xhtmlBuilder**: `XMLBuilder`

Defined in:
[epub/index.ts:254](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L254)

#### xhtmlParser

> `static` **xhtmlParser**: `XMLParser`

Defined in:
[epub/index.ts:214](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L214)

#### xmlBuilder

> `static` **xmlBuilder**: `XMLBuilder`

Defined in:
[epub/index.ts:247](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L247)

#### xmlParser

> `static` **xmlParser**: `XMLParser`

Defined in:
[epub/index.ts:207](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L207)

### Methods

#### \[dispose\]()

> **\[dispose\]**(): `void`

Defined in:
[epub/index.ts:2545](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2545)

##### Returns

`void`

#### addCollection()

> **addCollection**(`collection`, `index?`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1572](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1572)

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
[epub/index.ts:1914](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1914)

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
[epub/index.ts:1759](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1759)

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
[epub/index.ts:2241](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2241)

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
[epub/index.ts:2246](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2246)

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
[epub/index.ts:2251](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2251)

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
[epub/index.ts:2363](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2363)

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
[epub/index.ts:1968](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1968)

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
[epub/index.ts:1101](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1101)

Add a subject to the EPUB metadata.

##### Parameters

| Parameter | Type                                  | Description                                                                         |
| --------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| `subject` | `string` \| [`DcSubject`](#dcsubject) | May be a string representing just a schema-less subject name, or a DcSubject object |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcsubject

#### createXhtmlDocument()

> **createXhtmlDocument**(`body`, `head?`, `language?`):
> `Promise`\<([`XmlElement`](#xmlelement)\<`"html"`\> \|
> [`XmlElement`](#xmlelement)\<`"?xml"`\>)[]\>

Defined in:
[epub/index.ts:2069](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2069)

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

#### discardAndClose()

> **discardAndClose**(): `void`

Defined in:
[epub/index.ts:2472](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2472)

##### Returns

`void`

#### findAllMetadataItems()

> **findAllMetadataItems**(`predicate`): `Promise`\<`object`[]\>

Defined in:
[epub/index.ts:824](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L824)

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
[epub/index.ts:815](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L815)

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

#### getCollections()

> **getCollections**(): `Promise`\<[`Collection`](#collection)[]\>

Defined in:
[epub/index.ts:1532](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1532)

Retrieve the list of collections.

##### Returns

`Promise`\<[`Collection`](#collection)[]\>

#### getContributors()

> **getContributors**(): `Promise`\<[`DcCreator`](#dccreator)[]\>

Defined in:
[epub/index.ts:1746](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1746)

Retrieve the list of contributors.

This is a convenience method for `epub.getCreators('contributor')`.

##### Returns

`Promise`\<[`DcCreator`](#dccreator)[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dccontributor

#### getCoverImage()

> **getCoverImage**(): `Promise`\<`null` \| `Uint8Array`\<`ArrayBufferLike`\>\>

Defined in:
[epub/index.ts:1004](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1004)

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
[epub/index.ts:985](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L985)

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
[epub/index.ts:1685](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1685)

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
[epub/index.ts:1383](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1383)

Retrieve the Epub's description as specified in its package document metadata.

If no description metadata is specified, returns null. Returns the description
as a string. Descriptions may include HTML markup.

##### Returns

`Promise`\<`null` \| `string`\>

#### getIdentifier()

> **getIdentifier**(): `Promise`\<`null` \| `string`\>

Defined in:
[epub/index.ts:919](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L919)

Retrieve the identifier from the dc:identifier element in the EPUB metadata.

If there is no dc:identifier element, returns null.

##### Returns

`Promise`\<`null` \| `string`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier

#### getLanguage()

> **getLanguage**(): `Promise`\<`null` \| `Locale`\>

Defined in:
[epub/index.ts:1220](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1220)

Retrieve the Epub's language as specified in its package document metadata.

If no language metadata is specified, returns null. Returns the language as an
Intl.Locale instance.

##### Returns

`Promise`\<`null` \| `Locale`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dclanguage

#### getManifest()

> **getManifest**(): `Promise`\<`Record`\<`string`,
> [`ManifestItem`](#manifestitem)\>\>

Defined in:
[epub/index.ts:740](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L740)

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
[epub/index.ts:891](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L891)

Retrieve the metadata entries for the Epub.

This is represented as an array of metadata entries, in the order that they're
presented in the Epub package document.

For more useful semantic representations of metadata, use specific methods such
as `getTitle()` and `getAuthors()`.

##### Returns

`Promise`\<[`EpubMetadata`](#epubmetadata)\>

##### Link

https://www.w3.org/TR/epub-33/#sec-pkg-metadata

#### getPackageVocabularyPrefixes()

> **getPackageVocabularyPrefixes**(): `Promise`\<`Record`\<`string`,
> `string`\>\>

Defined in:
[epub/index.ts:1400](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1400)

Return the set of custom vocabulary prefixes set on this publication's root
package element.

Returns a map from prefix to URI

##### Returns

`Promise`\<`Record`\<`string`, `string`\>\>

##### Link

https://www.w3.org/TR/epub-33/#sec-prefix-attr

#### getPublicationDate()

> **getPublicationDate**(): `Promise`\<`null` \| `Date`\>

Defined in:
[epub/index.ts:1041](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1041)

Retrieve the publication date from the dc:date element in the EPUB metadata as a
Date object.

If there is no dc:date element, returns null.

##### Returns

`Promise`\<`null` \| `Date`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcdate

#### getSpineItems()

> **getSpineItems**(): `Promise`\<[`ManifestItem`](#manifestitem)[]\>

Defined in:
[epub/index.ts:1949](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1949)

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
[epub/index.ts:1175](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1175)

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
[epub/index.ts:1290](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1290)

Retrieve the subtitle of the Epub, if it exists.

##### Returns

`Promise`\<`null` \| `string`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

#### getTitle()

> **getTitle**(`expanded`): `Promise`\<`null` \| `string`\>

Defined in:
[epub/index.ts:1266](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1266)

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
[epub/index.ts:1302](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1302)

Retrieve all title entries of the Epub.

##### Returns

`Promise`\<`object`[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

#### getType()

> **getType**(): `Promise`\<`null` \| [`MetadataEntry`](#metadataentry)\>

Defined in:
[epub/index.ts:1088](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1088)

Retrieve the publication type from the dc:type element in the EPUB metadata.

If there is no dc:type element, returns null.

##### Returns

`Promise`\<`null` \| [`MetadataEntry`](#metadataentry)\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctype

#### readItemContents()

##### Call Signature

> **readItemContents**(`id`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in:
[epub/index.ts:2041](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2041)

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
[epub/index.ts:2042](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2042)

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
[epub/index.ts:2102](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2102)

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
[epub/index.ts:2103](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2103)

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
[epub/index.ts:1641](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1641)

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
[epub/index.ts:1898](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1898)

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
[epub/index.ts:1846](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1846)

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
[epub/index.ts:2198](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2198)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

##### Returns

`Promise`\<`void`\>

#### removeMetadata()

> **removeMetadata**(`predicate`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2447](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2447)

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
[epub/index.ts:2004](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2004)

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
[epub/index.ts:1138](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1138)

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
[epub/index.ts:2402](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2402)

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

#### saveAndClose()

> **saveAndClose**(): `Promise`\<`void`\>

Defined in:
[epub/index.ts:2488](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2488)

Write the current contents of the Epub to a new EPUB archive on disk.

When this method is called, the "dcterms:modified" meta tag is automatically
updated to the current UTC timestamp.

##### Returns

`Promise`\<`void`\>

#### setCoverImage()

> **setCoverImage**(`href`, `data`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1018](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1018)

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
[epub/index.ts:1367](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1367)

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
[epub/index.ts:933](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L933)

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
[epub/index.ts:1249](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1249)

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
[epub/index.ts:1418](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1418)

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
[epub/index.ts:1056](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1056)

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
[epub/index.ts:1442](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1442)

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
[epub/index.ts:1470](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1470)

##### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `entries` | `object`[] |

##### Returns

`Promise`\<`void`\>

#### setType()

> **setType**(`type`): `Promise`\<`void`\>

Defined in:
[epub/index.ts:1072](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1072)

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
[epub/index.ts:2314](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2314)

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
[epub/index.ts:2150](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2150)

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
[epub/index.ts:2151](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2151)

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
[epub/index.ts:2190](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2190)

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
[epub/index.ts:284](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L284)

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
[epub/index.ts:438](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L438)

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
[epub/index.ts:319](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L319)

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
[epub/index.ts:332](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L332)

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
[epub/index.ts:393](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L393)

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

#### formatSmilDuration()

> `static` **formatSmilDuration**(`duration`): `string`

Defined in:
[epub/index.ts:267](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L267)

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
[epub/index.ts:522](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L522)

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
[epub/index.ts:309](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L309)

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
[epub/index.ts:341](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L341)

Given an XML structure representing a complete XHTML document, return a string
representing the concatenation of all text nodes in the document.

##### Parameters

| Parameter | Type                      |
| --------- | ------------------------- |
| `xml`     | [`ParsedXml`](#parsedxml) |

##### Returns

`string`

#### getXmlChildren()

> `static` **getXmlChildren**\<`Name`\>(`element`): [`ParsedXml`](#parsedxml)

Defined in:
[epub/index.ts:373](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L373)

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
[epub/index.ts:358](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L358)

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
[epub/index.ts:406](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L406)

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
[epub/index.ts:381](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L381)

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

---

## AlternateScript

Defined in:
[epub/index.ts:147](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L147)

### Properties

#### locale

> **locale**: `Locale`

Defined in:
[epub/index.ts:149](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L149)

#### name

> **name**: `string`

Defined in:
[epub/index.ts:148](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L148)

---

## Collection

Defined in:
[epub/index.ts:171](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L171)

### Properties

#### name

> **name**: `string`

Defined in:
[epub/index.ts:172](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L172)

#### position?

> `optional` **position**: `string`

Defined in:
[epub/index.ts:174](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L174)

#### type?

> `optional` **type**: `string`

Defined in:
[epub/index.ts:173](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L173)

---

## DcCreator

Defined in:
[epub/index.ts:152](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L152)

### Properties

#### alternateScripts?

> `optional` **alternateScripts**: [`AlternateScript`](#alternatescript)[]

Defined in:
[epub/index.ts:157](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L157)

#### fileAs?

> `optional` **fileAs**: `string`

Defined in:
[epub/index.ts:156](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L156)

#### name

> **name**: `string`

Defined in:
[epub/index.ts:153](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L153)

#### role?

> `optional` **role**: `string`

Defined in:
[epub/index.ts:154](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L154)

#### roleScheme?

> `optional` **roleScheme**: `string`

Defined in:
[epub/index.ts:155](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L155)

---

## DcSubject

Defined in:
[epub/index.ts:141](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L141)

### Properties

#### authority

> **authority**: `string`

Defined in:
[epub/index.ts:143](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L143)

#### term

> **term**: `string`

Defined in:
[epub/index.ts:144](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L144)

#### value

> **value**: `string`

Defined in:
[epub/index.ts:142](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L142)

---

## DublinCore

Defined in:
[epub/index.ts:160](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L160)

### Properties

#### contributors?

> `optional` **contributors**: [`DcCreator`](#dccreator)[]

Defined in:
[epub/index.ts:167](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L167)

#### creators?

> `optional` **creators**: [`DcCreator`](#dccreator)[]

Defined in:
[epub/index.ts:166](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L166)

#### date?

> `optional` **date**: `Date`

Defined in:
[epub/index.ts:164](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L164)

#### identifier

> **identifier**: `string`

Defined in:
[epub/index.ts:163](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L163)

#### language

> **language**: `Locale`

Defined in:
[epub/index.ts:162](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L162)

#### subjects?

> `optional` **subjects**: (`string` \| [`DcSubject`](#dcsubject))[]

Defined in:
[epub/index.ts:165](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L165)

#### title

> **title**: `string`

Defined in:
[epub/index.ts:161](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L161)

#### type?

> `optional` **type**: `string`

Defined in:
[epub/index.ts:168](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L168)

---

## ElementName

> **ElementName** =
> \`$\{Letter \| Uppercase\<Letter\> \| QuestionMark\}$\{string\}\`

Defined in:
[epub/index.ts:102](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L102)

A valid name for an XML element (must start with a letter)

---

## EpubMetadata

> **EpubMetadata** = [`MetadataEntry`](#metadataentry)[]

Defined in:
[epub/index.ts:139](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L139)

---

## ManifestItem

> **ManifestItem** = `object`

Defined in:
[epub/index.ts:123](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L123)

### Properties

#### fallback?

> `optional` **fallback**: `string`

Defined in:
[epub/index.ts:127](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L127)

#### href

> **href**: `string`

Defined in:
[epub/index.ts:125](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L125)

#### id

> **id**: `string`

Defined in:
[epub/index.ts:124](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L124)

#### mediaOverlay?

> `optional` **mediaOverlay**: `string`

Defined in:
[epub/index.ts:128](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L128)

#### mediaType?

> `optional` **mediaType**: `string`

Defined in:
[epub/index.ts:126](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L126)

#### properties?

> `optional` **properties**: `string`[]

Defined in:
[epub/index.ts:129](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L129)

---

## MetadataEntry

> **MetadataEntry** = `object`

Defined in:
[epub/index.ts:132](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L132)

### Properties

#### id?

> `optional` **id**: `string`

Defined in:
[epub/index.ts:133](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L133)

#### properties

> **properties**: `Record`\<`string`, `string`\>

Defined in:
[epub/index.ts:135](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L135)

#### type

> **type**: [`ElementName`](#elementname)

Defined in:
[epub/index.ts:134](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L134)

#### value

> **value**: `string` \| `undefined`

Defined in:
[epub/index.ts:136](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L136)

---

## PackageElement

> **PackageElement** = [`XmlElement`](#xmlelement)\<`"package"`\> \|
> [`XmlElement`](#xmlelement)\<`"opf:package"`\>

Defined in:
[epub/index.ts:177](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L177)

---

## ParsedXml

> **ParsedXml** = [`XmlNode`](#xmlnode)[]

Defined in:
[epub/index.ts:121](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L121)

An XML structure

---

## XmlElement\<Name\>

> **XmlElement**\<`Name`\> = `object` & `{ [key in Name]: ParsedXml }`

Defined in:
[epub/index.ts:108](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L108)

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
[epub/index.ts:118](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L118)

A valid XML node. May be either an element or a text node.

---

## XmlTextNode

> **XmlTextNode** = `object`

Defined in:
[epub/index.ts:115](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L115)

A text node in an XML document

### Properties

#### #text

> **#text**: `string`

Defined in:
[epub/index.ts:115](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L115)
