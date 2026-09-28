# @storyteller-platform/epub

A Node.js/browser library for inspecting, modifying, and creating EPUB 3
publications.

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
  - [Upgrading an EPUB 2 to EPUB 3](#upgrading-an-epub-2-to-epub-3)
  - [Browser support](#browser-support)
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

using epub = await Epub.from("path/to/book.epub")
// equivalent to
// using epub = await Epub.using(TmpFsAdapter).from("path/to/book.epub")
console.log(await epub.getTitle())
```

If you want to be a little more efficient and not unpack the entire EPUB file
into disk (which can take some time when dealing with EPUBs with Media
Overlays/audio contents), you can instead lazily read the contents of the EPUB
file into memory.

```ts
import { Epub, MemoryAdapter } from "@storyteller-platform/epub"

using epub = await Epub.using(MemoryAdapter).from("path/to/book.epub")
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

// Implicitly uses the TmpFsAdapter
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

### Upgrading an EPUB 2 to EPUB 3

This library only supports operations on EPUB 3 files and will throw an error if
you attempt to load an EPUB 2 file.

However, it does support upgrading an EPUB 2 file to EPUB 3, after which you can
use the library like normal.

```ts
import { Epub } from "@storyteller-platform/epub"

using epub = await Epub.upgrade("path/to/epub2.epub", {
  // optional. if omitted the Epub
  outputPath: "path/to/epub3.epub",
})

// if .saveAndClose() is not called and `outputPath` isn't provided, the Epub will return to it's unupgraded state
await epub.saveAndClose()

// Do Epub stuff
```

### Browser support

This library is designed to be used in both Node.js and browser environments.

In the browser, currently you can only use the `MemoryAdapter` to read EPUB
files.

```tsx
import { useState, useEffect } from "react"

import {
  Epub,
  type EpubReader,
  MemoryAdapter,
} from "@storyteller-platform/epub"

export function BookCover(file: File) {
  const [cover, setCover] = useState<string | null>(null)

  useEffect(() => {
    let epub: EpubReader | null = null
    let coverUrl: string | null = null

    async function loadCover() {
      // unfortunately Safari does not support `using` syntax yet
      try {
        epub = await Epub.using(MemoryAdapter).from(file)
        const cover = await epub.getCoverImage()
        if (cover) {
          coverUrl = URL.createObjectURL(new Blob([new Uint8Array(cover)]))
          setCover(coverUrl)
        }
      } finally {
        epub?.discardAndClose()
      }
    }

    loadCover()

    return () => {
      if (coverUrl) {
        URL.revokeObjectURL(coverUrl)
      }
    }
  }, [file])

  return cover ? <img src={cover} alt="Cover" /> : null
}
```

Note that doing a bare `Epub.from` will result in an error.

## Development

This package lives in the
[Storyteller monorepo](https://gitlab.com/storyteller-platform/storyteller), and
is developed alongside the
[Storyteller platform](https://storyteller-platform.dev).

To get started with developing in the Storyteller monorepo, check out the
[development guides in the docs](https://storyteller-platform.dev/docs/category/development).

## API Docs

## Epub

Defined in: [libraries/epub/index.ts:351](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L351)

A single EPUB instance.

The entire EPUB contents will be read into memory.

Example usage:

```ts
import {
  Epub,
  getBody,
  findByName,
  textContent,
} from "@storyteller-platform/epub";

const epub = await Epub.from("./path/to/book.epub");
const title = await epub.getTitle();
const spineItems = await epub.getSpineItems();
const chptOne = spineItems[0];
const chptOneXml = await epub.readXhtmlItemContents(chptOne.id);

const body = getBody(chptOneXml);
const h1 = Epub.findXmlChildByName("h1", body);
const headingText = textContent(h1);

await epub.setTitle(headingText);
await epub.writeToFile("./path/to/updated.epub");
await epub.close();
```

### Link

https://www.w3.org/TR/epub-33/

### Constructors

#### Constructor

> **new Epub**(`adapterClass`, `adapter`, `inputPath`, `readonlyOverride`): [`Epub`](#epub)

Defined in: [libraries/epub/index.ts:626](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L626)

Prefer the static factories ([Epub.using](#using), [Epub.from](#from),
[Epub.create](#create), [Epub.upgrade](#upgrade)) over calling this constructor
directly. It's public so [EpubFactory](#epubfactory) can construct instances; nothing
else should need to.

##### Parameters

| Parameter          | Type                                                  | Default value |
| ------------------ | ----------------------------------------------------- | ------------- |
| `adapterClass`     | [`EpubStorageAdapterClass`](#epubstorageadapterclass) | `undefined`   |
| `adapter`          | [`EpubStorageAdapter`](#epubstorageadapter)           | `undefined`   |
| `inputPath`        | `string` \| `undefined`                               | `undefined`   |
| `readonlyOverride` | `boolean`                                             | `false`       |

##### Returns

[`Epub`](#epub)

### Properties

#### adapter

> `protected` **adapter**: [`EpubStorageAdapter`](#epubstorageadapter)

Defined in: [libraries/epub/index.ts:628](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L628)

#### adapterClass

> `protected` **adapterClass**: [`EpubStorageAdapterClass`](#epubstorageadapterclass)

Defined in: [libraries/epub/index.ts:627](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L627)

#### inputPath

> `protected` **inputPath**: `string` \| `undefined`

Defined in: [libraries/epub/index.ts:629](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L629)

#### readonlyOverride

> `protected` **readonlyOverride**: `boolean` = `false`

Defined in: [libraries/epub/index.ts:630](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L630)

#### storage

> `readonly` **storage**: [`EpubStorageKind`](#epubstoragekind)

Defined in: [libraries/epub/index.ts:618](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L618)

Storage backend kind in use for this instance

Public so callers can declare type-level requirements via [InMemoryEpubReader](#inmemoryepubreader)
Orthogonal to the read-only / writable axis (controlled by `readonlyOverride`
and the adapter's capability bag)

#### xhtmlBuilder

> `static` **xhtmlBuilder**: `XMLBuilder`

Defined in: [libraries/epub/index.ts:407](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L407)

#### xhtmlParser

> `static` **xhtmlParser**: `XMLParser`

Defined in: [libraries/epub/index.ts:359](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L359)

#### xmlBuilder

> `static` **xmlBuilder**: `XMLBuilder`

Defined in: [libraries/epub/index.ts:400](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L400)

#### xmlParser

> `static` **xmlParser**: `XMLParser`

Defined in: [libraries/epub/index.ts:352](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L352)

### Methods

#### \[dispose\]()

> **\[dispose\]**(): `void`

Defined in: [libraries/epub/index.ts:3612](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3612)

##### Returns

`void`

#### addCollection()

> **addCollection**(`collection`, `index?`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:2241](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2241)

Add a collection to the EPUB metadata.

If index is provided, the collection will be placed at
that index in the list of collections. Otherwise, it
will be added to the end of the list.

##### Parameters

| Parameter    | Type                        |
| ------------ | --------------------------- |
| `collection` | [`Collection`](#collection) |
| `index?`     | `number`                    |

##### Returns

`Promise`\<`void`\>

#### addContributor()

> **addContributor**(`contributor`, `index?`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:2586](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2586)

Add a contributor to the EPUB metadata.

If index is provided, the creator will be placed at
that index in the list of creators. Otherwise, it
will be added to the end of the list.

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

Defined in: [libraries/epub/index.ts:2431](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2431)

Add a creator to the EPUB metadata.

If index is provided, the creator will be placed at
that index in the list of creators. Otherwise, it
will be added to the end of the list.

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

Defined in: [libraries/epub/index.ts:3199](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3199)

Create a new manifest item and write its contents to a
new entry.

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

Defined in: [libraries/epub/index.ts:3204](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3204)

Create a new manifest item and write its contents to a
new entry.

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

Defined in: [libraries/epub/index.ts:3209](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3209)

Create a new manifest item and write its contents to a
new entry.

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

Defined in: [libraries/epub/index.ts:3320](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3320)

Add a new metadata entry to the Epub.

This method, like `epub.getMetadata()`, operates on
metadata entries. For more useful semantic representations
of metadata, use specific methods such as `setTitle()` and
`setLanguage()`.

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

Defined in: [libraries/epub/index.ts:2659](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2659)

Add an item to the spine of the EPUB.

If `index` is undefined, the item will be added
to the end of the spine. Otherwise it will be
inserted at the specified index.

If the manifestId does not correspond to an item
in the manifest, this will throw an error.

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

Defined in: [libraries/epub/index.ts:1770](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1770)

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

Defined in: [libraries/epub/index.ts:723](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L723)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `path?`   | `string` |

##### Returns

`Promise`\<[`Epub`](#epub)\>

#### createXhtmlDocument()

> **createXhtmlDocument**(`body`, `head?`, `language?`): `Promise`\<([`XmlElement`](#xmlelement)\<`"?xml"`\> \| [`XmlElement`](#xmlelement)\<`"html"`\>)[]\>

Defined in: [libraries/epub/index.ts:3020](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3020)

Create a new XHTML document with the given body
and head.

##### Parameters

| Parameter   | Type                      | Description                                        |
| ----------- | ------------------------- | -------------------------------------------------- |
| `body`      | [`ParsedXml`](#parsedxml) | The XML nodes to place in the body of the document |
| `head?`     | [`ParsedXml`](#parsedxml) | Optional - the XMl nodes to place in the head      |
| `language?` | `Locale`                  | Optional - defaults to the EPUB's language         |

##### Returns

`Promise`\<([`XmlElement`](#xmlelement)\<`"?xml"`\> \| [`XmlElement`](#xmlelement)\<`"html"`\>)[]\>

#### discardAndClose()

> **discardAndClose**(): `void`

Defined in: [libraries/epub/index.ts:3562](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3562)

##### Returns

`void`

#### findAllMetadataItems()

> **findAllMetadataItems**(`predicate`): `Promise`\<`object`[]\>

Defined in: [libraries/epub/index.ts:977](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L977)

Returns the item in the metadata element's children array
that matches the provided predicate.

##### Parameters

| Parameter   | Type                   |
| ----------- | ---------------------- |
| `predicate` | (`entry`) => `boolean` |

##### Returns

`Promise`\<`object`[]\>

#### findMetadataItem()

> **findMetadataItem**(`predicate`): `Promise`\<\{ `id`: `string` \| `undefined`; `properties`: \{[`k`: `string`]: `string`; \}; `type`: `` `r${string}` `` \| `` `a${string}` `` \| `` `b${string}` `` \| `` `c${string}` `` \| `` `d${string}` `` \| `` `e${string}` `` \| `` `f${string}` `` \| `` `g${string}` `` \| `` `h${string}` `` \| `` `i${string}` `` \| `` `j${string}` `` \| `` `k${string}` `` \| `` `l${string}` `` \| `` `m${string}` `` \| `` `n${string}` `` \| `` `o${string}` `` \| `` `p${string}` `` \| `` `q${string}` `` \| `` `s${string}` `` \| `` `t${string}` `` \| `` `u${string}` `` \| `` `v${string}` `` \| `` `w${string}` `` \| `` `x${string}` `` \| `` `y${string}` `` \| `` `z${string}` `` \| `` `R${string}` `` \| `` `A${string}` `` \| `` `B${string}` `` \| `` `C${string}` `` \| `` `D${string}` `` \| `` `E${string}` `` \| `` `F${string}` `` \| `` `G${string}` `` \| `` `H${string}` `` \| `` `I${string}` `` \| `` `J${string}` `` \| `` `K${string}` `` \| `` `L${string}` `` \| `` `M${string}` `` \| `` `N${string}` `` \| `` `O${string}` `` \| `` `P${string}` `` \| `` `Q${string}` `` \| `` `S${string}` `` \| `` `T${string}` `` \| `` `U${string}` `` \| `` `V${string}` `` \| `` `W${string}` `` \| `` `X${string}` `` \| `` `Y${string}` `` \| `` `Z${string}` `` \| `` `?${string}` ``; `value`: `string` \| `undefined`; \} \| `null`\>

Defined in: [libraries/epub/index.ts:968](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L968)

Returns the item in the metadata element's children array
that matches the provided predicate.

##### Parameters

| Parameter   | Type                   |
| ----------- | ---------------------- |
| `predicate` | (`entry`) => `boolean` |

##### Returns

`Promise`\<\{ `id`: `string` \| `undefined`; `properties`: \{[`k`: `string`]: `string`; \}; `type`: `` `r${string}` `` \| `` `a${string}` `` \| `` `b${string}` `` \| `` `c${string}` `` \| `` `d${string}` `` \| `` `e${string}` `` \| `` `f${string}` `` \| `` `g${string}` `` \| `` `h${string}` `` \| `` `i${string}` `` \| `` `j${string}` `` \| `` `k${string}` `` \| `` `l${string}` `` \| `` `m${string}` `` \| `` `n${string}` `` \| `` `o${string}` `` \| `` `p${string}` `` \| `` `q${string}` `` \| `` `s${string}` `` \| `` `t${string}` `` \| `` `u${string}` `` \| `` `v${string}` `` \| `` `w${string}` `` \| `` `x${string}` `` \| `` `y${string}` `` \| `` `z${string}` `` \| `` `R${string}` `` \| `` `A${string}` `` \| `` `B${string}` `` \| `` `C${string}` `` \| `` `D${string}` `` \| `` `E${string}` `` \| `` `F${string}` `` \| `` `G${string}` `` \| `` `H${string}` `` \| `` `I${string}` `` \| `` `J${string}` `` \| `` `K${string}` `` \| `` `L${string}` `` \| `` `M${string}` `` \| `` `N${string}` `` \| `` `O${string}` `` \| `` `P${string}` `` \| `` `Q${string}` `` \| `` `S${string}` `` \| `` `T${string}` `` \| `` `U${string}` `` \| `` `V${string}` `` \| `` `W${string}` `` \| `` `X${string}` `` \| `` `Y${string}` `` \| `` `Z${string}` `` \| `` `?${string}` ``; `value`: `string` \| `undefined`; \} \| `null`\>

#### getBaseDirection()

> **getBaseDirection**(): `Promise`\<`"auto"` \| `"rtl"` \| `"ltr"`\>

Defined in: [libraries/epub/index.ts:1724](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1724)

Retrieve the base direction from the package element.

If there is no `dir` attribute on the package element,
returns 'auto'.

##### Returns

`Promise`\<`"auto"` \| `"rtl"` \| `"ltr"`\>

##### Link

https://www.w3.org/TR/epub-33/#attrdef-dir

#### getCollections()

> **getCollections**(): `Promise`\<[`Collection`](#collection)[]\>

Defined in: [libraries/epub/index.ts:2201](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2201)

Retrieve the list of collections.

##### Returns

`Promise`\<[`Collection`](#collection)[]\>

#### getContributors()

> **getContributors**(): `Promise`\<[`DcCreator`](#dccreator)[]\>

Defined in: [libraries/epub/index.ts:2418](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2418)

Retrieve the list of contributors.

This is a convenience method for
`epub.getCreators('contributor')`.

##### Returns

`Promise`\<[`DcCreator`](#dccreator)[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dccontributor

#### getCoverImage()

> **getCoverImage**(): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\> \| `null`\>

Defined in: [libraries/epub/index.ts:1620](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1620)

Retrieve the cover image data as a byte array.

This does not include, for example, the cover image's
filename or mime type. To retrieve the image manifest
item, use epub.getCoverImageItem().

##### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\> \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-cover-image

#### getCoverImageItem()

> **getCoverImageItem**(): `Promise`\<[`ManifestItem`](#manifestitem) \| `null`\>

Defined in: [libraries/epub/index.ts:1601](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1601)

Retrieve the cover image manifest item.

This does not return the actual image data. To
retrieve the image data, pass this item's id to
epub.readItemContents, or use epub.getCoverImage()
instead.

##### Returns

`Promise`\<[`ManifestItem`](#manifestitem) \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-cover-image

#### getCreators()

> **getCreators**(`type`): `Promise`\<[`DcCreator`](#dccreator)[]\>

Defined in: [libraries/epub/index.ts:2354](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2354)

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

> **getDescription**(): `Promise`\<`string` \| `null`\>

Defined in: [libraries/epub/index.ts:2052](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2052)

Retrieve the Epub's description as specified in its
package document metadata.

If no description metadata is specified, returns null.
Returns the description as a string. Descriptions may
include HTML markup.

##### Returns

`Promise`\<`string` \| `null`\>

#### getGuideEntries()

> **getGuideEntries**(): `Promise`\<[`GuideItem`](#guideitem)[]\>

Defined in: [libraries/epub/index.ts:3539](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3539)

Retrieve the guide entries from the package document.

The guide element is deprecated in EPUB 3 in favor of
the landmarks nav, but many publications still include it.

##### Returns

`Promise`\<[`GuideItem`](#guideitem)[]\>

#### ~~getIdentifier()~~

> **getIdentifier**(): `Promise`\<`string` \| `null`\>

Defined in: [libraries/epub/index.ts:1075](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1075)

Retrieve the first identifier from the dc:identifier element
in the EPUB metadata.

If there is no dc:identifier element, returns null.

##### Returns

`Promise`\<`string` \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier

##### Deprecated

Use [getUniqueIdentifier](#getuniqueidentifier) instead to get the unique identifier,
or [getIdentifiers](#getidentifiers) to get all identifiers.

#### getIdentifiers()

> **getIdentifiers**(): `Promise`\<[`EpubIdentifier`](#epubidentifier)[]\>

Defined in: [libraries/epub/index.ts:1250](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1250)

Retrieve every `dc:identifier` entry, returned as found.

Values are not interpreted. Any refining `identifier-type` meta (spec
D.3.8) or legacy `opf:scheme` attribute is surfaced on the entry, but no
parsing of the value itself is attempted. To read `dc:source` entries, use
[getSources](#getsources).

##### Returns

`Promise`\<[`EpubIdentifier`](#epubidentifier)[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier

#### getItemArchiveLength()

> **getItemArchiveLength**(`id`): `Promise`\<`number`\>

Defined in: [libraries/epub/index.ts:749](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L749)

Length of the underlying archive entry for a manifest item, in bytes
Necessary to compute the readium page count which is for COMPRESSED content

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

##### Returns

`Promise`\<`number`\>

##### See

[https://github.com/readium/architecture/issues/123](https://github.com/readium/architecture/issues/123)

#### getLandmarks()

> **getLandmarks**(`__namedParameters`): `Promise`\<[`Navigation`](#navigation) \| `null`\>

Defined in: [libraries/epub/index.ts:2840](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2840)

Returns the structured landmarks navigation document
as a Navigation object

##### Parameters

| Parameter                          | Type                               |
| ---------------------------------- | ---------------------------------- |
| `__namedParameters`                | \{ `resolveToRoot?`: `boolean`; \} |
| `__namedParameters.resolveToRoot?` | `boolean`                          |

##### Returns

`Promise`\<[`Navigation`](#navigation) \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-nav-landmarks

#### getLanguage()

> **getLanguage**(): `Promise`\<`Locale` \| `null`\>

Defined in: [libraries/epub/index.ts:1889](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1889)

Retrieve the Epub's language as specified in its
package document metadata.

If no language metadata is specified, returns null.
Returns the language as an Intl.Locale instance.

##### Returns

`Promise`\<`Locale` \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dclanguage

#### getLayout()

> **getLayout**(): `Promise`\<`"pre-paginated"` \| `"reflowable"`\>

Defined in: [libraries/epub/index.ts:1705](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1705)

Retrieve the layout from the rendition:layout meta element
in the EPUB metadata.

If there is no meta element, returns 'reflowable'.

##### Returns

`Promise`\<`"pre-paginated"` \| `"reflowable"`\>

##### Link

https://www.w3.org/TR/epub-33/#layout

#### getManifest()

> **getManifest**(): `Promise`\<`Record`\<`string`, [`ManifestItem`](#manifestitem)\>\>

Defined in: [libraries/epub/index.ts:893](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L893)

Retrieve the manifest for the Epub.

This is represented as a map from each manifest items'
id to the rest of its properties.

##### Returns

`Promise`\<`Record`\<`string`, [`ManifestItem`](#manifestitem)\>\>

##### Link

https://www.w3.org/TR/epub-33/#sec-pkg-manifest

#### getMetadata()

> **getMetadata**(): `Promise`\<[`EpubMetadata`](#epubmetadata)\>

Defined in: [libraries/epub/index.ts:1044](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1044)

Retrieve the metadata entries for the Epub.

This is represented as an array of metadata entries,
in the order that they're presented in the Epub package document.

For more useful semantic representations of metadata, use
specific methods such as `getTitle()` and `getAuthors()`.

##### Returns

`Promise`\<[`EpubMetadata`](#epubmetadata)\>

##### Link

https://www.w3.org/TR/epub-33/#sec-pkg-metadata

#### getModifiedDate()

> **getModifiedDate**(): `Promise`\<`Date` \| `null`\>

Defined in: [libraries/epub/index.ts:1688](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1688)

Retrieve the modified date from the dcterms:modified metadata
in the EPUB metadata as a Date object.

If there is no meta element with dcterms:modified, returns null.

##### Returns

`Promise`\<`Date` \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-metadata-last-modified

#### getNcxTableOfContents()

> **getNcxTableOfContents**(): `Promise`\<[`NavigationList`](#navigationlist)\>

Defined in: [libraries/epub/index.ts:3445](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3445)

Parse the NCX table of contents, if one exists, and return
a tree of TocEntry nodes.

Useful for both EPUB 2 publications (where the NCX is the
primary navigation) and EPUB 3 publications that retain an
NCX for backwards compatibility.

##### Returns

`Promise`\<[`NavigationList`](#navigationlist)\>

#### getPackageDocumentSource()

> **getPackageDocumentSource**(): `Promise`\<`string`\>

Defined in: [libraries/epub/index.ts:808](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L808)

##### Returns

`Promise`\<`string`\>

#### getPackageElement()

> **getPackageElement**(): `Promise`\<[`XmlElement`](#xmlelement)\<`"package"`\>\>

Defined in: [libraries/epub/index.ts:828](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L828)

##### Returns

`Promise`\<[`XmlElement`](#xmlelement)\<`"package"`\>\>

#### getPackageVocabularyPrefixes()

> **getPackageVocabularyPrefixes**(): `Promise`\<`Record`\<`string`, `string`\>\>

Defined in: [libraries/epub/index.ts:2069](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2069)

Return the set of custom vocabulary prefixes set on this publication's
root package element.

Returns a map from prefix to URI

##### Returns

`Promise`\<`Record`\<`string`, `string`\>\>

##### Link

https://www.w3.org/TR/epub-33/#sec-prefix-attr

#### getPageBreakSource()

> **getPageBreakSource**(): `Promise`\<[`EpubSource`](#epubsource) \| `null`\>

Defined in: [libraries/epub/index.ts:1287](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1287)

Retrieve the `pageBreakSource` property (EPUB 3.4, spec D.2.9), the
publication-level source for the source of its page break markers.

This property replaces the refining `source-of="pagination"` meta (spec
D.3.11), see EpubSource.sourceOf. If no `pageBreakSource` property is found,
we fall back to finding a `dc:source` with a `source-of="pagination"` refinement.

##### Returns

`Promise`\<[`EpubSource`](#epubsource) \| `null`\>

##### Link

https://www.w3.org/TR/epub/#pageBreakSource

#### getPageList()

> **getPageList**(`__namedParameters`): `Promise`\<[`Navigation`](#navigation) \| `null`\>

Defined in: [libraries/epub/index.ts:2852](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2852)

Returns the structured page list navigation document
as a Navigation object

##### Parameters

| Parameter                          | Type                               |
| ---------------------------------- | ---------------------------------- |
| `__namedParameters`                | \{ `resolveToRoot?`: `boolean`; \} |
| `__namedParameters.resolveToRoot?` | `boolean`                          |

##### Returns

`Promise`\<[`Navigation`](#navigation) \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-nav-landmarks

#### getPublicationDate()

> **getPublicationDate**(): `Promise`\<`Date` \| `null`\>

Defined in: [libraries/epub/index.ts:1657](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1657)

Retrieve the publication date from the dc:date element
in the EPUB metadata as a Date object.

If there is no dc:date element, returns null.

##### Returns

`Promise`\<`Date` \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcdate

#### getRootfile()

> **getRootfile**(): `Promise`\<`string`\>

Defined in: [libraries/epub/index.ts:760](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L760)

##### Returns

`Promise`\<`string`\>

#### getSources()

> **getSources**(): `Promise`\<[`EpubSource`](#epubsource)[]\>

Defined in: [libraries/epub/index.ts:1264](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1264)

Retrieve every `dc:source` entry, returned as found.

Like [getIdentifiers](#getidentifiers), values are not interpreted. In addition to a
refining `identifier-type`, a refining `source-of` meta (spec D.3.11) is
surfaced as `sourceOf`.

##### Returns

`Promise`\<[`EpubSource`](#epubsource)[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcsource

#### getSpineItems()

> **getSpineItems**(): `Promise`\<[`ManifestItem`](#manifestitem) & `object`[]\>

Defined in: [libraries/epub/index.ts:2632](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2632)

Retrieve the manifest items that make up the Epub's spine.

The spine specifies the order that the contents of the Epub
should be displayed to users by default.

##### Returns

`Promise`\<[`ManifestItem`](#manifestitem) & `object`[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-spine-elem

#### getSubjects()

> **getSubjects**(): `Promise`\<(`string` \| [`DcSubject`](#dcsubject))[]\>

Defined in: [libraries/epub/index.ts:1844](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1844)

Retrieve the list of subjects for this EPUB.

Subjects without associated authority and term metadata
will be returned as strings. Otherwise, they will
be represented as DcSubject objects, with a value,
authority, and term.

##### Returns

`Promise`\<(`string` \| [`DcSubject`](#dcsubject))[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcsubject

#### getSubtitle()

> **getSubtitle**(): `Promise`\<`string` \| `null`\>

Defined in: [libraries/epub/index.ts:1959](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1959)

Retrieve the subtitle of the Epub, if it exists.

##### Returns

`Promise`\<`string` \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

#### getTableOfContents()

> **getTableOfContents**(`__namedParameters`): `Promise`\<[`Navigation`](#navigation) \| `null`\>

Defined in: [libraries/epub/index.ts:2822](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2822)

Returns the structured table of contents navigation document
as a Navigation object.

##### Parameters

| Parameter                          | Type                               |
| ---------------------------------- | ---------------------------------- |
| `__namedParameters`                | \{ `resolveToRoot?`: `boolean`; \} |
| `__namedParameters.resolveToRoot?` | `boolean`                          |

##### Returns

`Promise`\<[`Navigation`](#navigation) \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-nav-toc

#### getTitle()

> **getTitle**(`expanded`): `Promise`\<`string` \| `null`\>

Defined in: [libraries/epub/index.ts:1935](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1935)

Retrieve the title of the Epub.

##### Parameters

| Parameter  | Type      | Default value |
| ---------- | --------- | ------------- |
| `expanded` | `boolean` | `false`       |

##### Returns

`Promise`\<`string` \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

#### getTitles()

> **getTitles**(): `Promise`\<`object`[]\>

Defined in: [libraries/epub/index.ts:1971](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1971)

Retrieve all title entries of the Epub.

##### Returns

`Promise`\<`object`[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

#### getType()

> **getType**(): `Promise`\<[`MetadataEntry`](#metadataentry) \| `null`\>

Defined in: [libraries/epub/index.ts:1757](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1757)

Retrieve the publication type from the dc:type element
in the EPUB metadata.

If there is no dc:type element, returns null.

##### Returns

`Promise`\<[`MetadataEntry`](#metadataentry) \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctype

#### getUniqueIdentifier()

> **getUniqueIdentifier**(): `Promise`\<`string` \| `null`\>

Defined in: [libraries/epub/index.ts:1107](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1107)

Retrieve the identifier with the unique identifier id
in the EPUB metadata.

If there is no unique identifier id, returns the first dc:identifier element.

##### Returns

`Promise`\<`string` \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier

#### getUniqueIdentifierId()

> **getUniqueIdentifierId**(): `Promise`\<`string` \| `null`\>

Defined in: [libraries/epub/index.ts:1188](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1188)

Retrieve the id of the publication's unique identifier, as declared by the
package element's `unique-identifier` attribute.

##### Returns

`Promise`\<`string` \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier

#### getVersion()

> **getVersion**(): `Promise`\<`string`\>

Defined in: [libraries/epub/index.ts:3432](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3432)

Returns the EPUB version declared on the package element.

##### Returns

`Promise`\<`string`\>

#### readFileContents()

##### Call Signature

> **readFileContents**(`href`, `relativeTo?`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [libraries/epub/index.ts:2959](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2959)

Retrieve the contents of a file, given its href.

Optionally takes the href that this href should be resolved relative to,
and an encoding parameter.

###### Parameters

| Parameter     | Type     | Description                      |
| ------------- | -------- | -------------------------------- |
| `href`        | `string` | The href of the file to retrieve |
| `relativeTo?` | `string` | -                                |

###### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

##### Call Signature

> **readFileContents**(`href`, `relativeTo`, `encoding`): `Promise`\<`string`\>

Defined in: [libraries/epub/index.ts:2960](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2960)

Retrieve the contents of a file, given its href.

Optionally takes the href that this href should be resolved relative to,
and an encoding parameter.

###### Parameters

| Parameter    | Type                    | Description                                                                                                                                                        |
| ------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `href`       | `string`                | The href of the file to retrieve                                                                                                                                   |
| `relativeTo` | `string` \| `undefined` | -                                                                                                                                                                  |
| `encoding`   | `"utf-8"`               | Optional - Must be the string "utf-8". If provided, the function will encode the data into a unicode string. Otherwise, the data will be returned as a byte array. |

###### Returns

`Promise`\<`string`\>

#### readItemContents()

##### Call Signature

> **readItemContents**(`id`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [libraries/epub/index.ts:2992](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2992)

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

Defined in: [libraries/epub/index.ts:2993](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2993)

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

Defined in: [libraries/epub/index.ts:3055](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3055)

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

Defined in: [libraries/epub/index.ts:3056](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3056)

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

Defined in: [libraries/epub/index.ts:2310](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2310)

Remove a collection from the EPUB metadata.

Removes the collection at the provided index. This index
refers to the array returned by `epub.getCollections()`.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `index`   | `number` |

##### Returns

`Promise`\<`void`\>

#### removeContributor()

> **removeContributor**(`index`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:2570](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2570)

Remove a contributor from the EPUB metadata.

Removes the contributor at the provided index. This index
refers to the array returned by `epub.getContributors()`.

This is a convenience method for
`epub.removeCreator(index, 'contributor')`.

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

Defined in: [libraries/epub/index.ts:2518](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2518)

Remove a creator from the EPUB metadata.

Removes the creator at the provided index. This index
refers to the array returned by `epub.getCreators()`.

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

Defined in: [libraries/epub/index.ts:3156](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3156)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

##### Returns

`Promise`\<`void`\>

#### removeMetadata()

> **removeMetadata**(`predicate`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:3404](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3404)

Remove one or more metadata entries.

The `predicate` argument will be used to determine which entries
to remove. The all metadata entries that match the
predicate will be removed.

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

Defined in: [libraries/epub/index.ts:2695](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2695)

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

Defined in: [libraries/epub/index.ts:1807](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1807)

Remove a subject from the EPUB metadata.

Removes the subject at the provided index. This index
refers to the array returned by `epub.getSubjects()`.

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

Defined in: [libraries/epub/index.ts:3359](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3359)

Replace a metadata entry with a new one.

The `predicate` argument will be used to determine which entry
to replace. The first metadata entry that matches the
predicate will be replaced.

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

> **resolveHref**(`href`, `relativeTo?`, `__namedParameters?`): `Promise`\<`string`\>

Defined in: [libraries/epub/index.ts:2915](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2915)

Returns a path-relative-scheme-less URL, relative to the
container root.

An href that points outside the publication, such as an external link in
a navigation document, is handed back unchanged.

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

Defined in: [libraries/epub/index.ts:3577](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3577)

Write the current contents of the Epub to a new
EPUB archive on disk.

When this method is called, the "dcterms:modified"
meta tag is automatically updated to the current UTC
timestamp.

##### Returns

`Promise`\<`void`\>

#### setCoverImage()

> **setCoverImage**(`href`, `data`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:1634](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1634)

Set the cover image for the EPUB.

Adds a manifest item with the `cover-image` property, per
the EPUB 3 spec, and then writes the provided image data to
the provided href within the publication.

##### Parameters

| Parameter | Type         |
| --------- | ------------ |
| `href`    | `string`     |
| `data`    | `Uint8Array` |

##### Returns

`Promise`\<`void`\>

#### setDescription()

> **setDescription**(`description`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:2036](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2036)

Update the Epub's description metadata entry.

Updates the existing dc:description element if one exists.
Otherwise creates a new element. Any non-ASCII symbols,
`&`, `<`, `>`, `"`, `'`, and ```` will be encoded as HTML entities.

##### Parameters

| Parameter     | Type     |
| ------------- | -------- |
| `description` | `string` |

##### Returns

`Promise`\<`void`\>

#### ~~setIdentifier()~~

> **setIdentifier**(`identifier`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:1091](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1091)

Set the dc:identifier metadata element with the provided string.

Updates the existing dc:identifier element if one exists.
Otherwise creates a new element

##### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `identifier` | `string` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier

##### Deprecated

Use [setUniqueIdentifier](#setuniqueidentifier) instead.

#### setIdentifiers()

> **setIdentifiers**(`identifiers`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:1356](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1356)

Replace the publication's `dc:identifier` entries.

This replaces ALL existing `dc:identifier` elements except the publication's
unique identifier (the one referenced by the package element's
`unique-identifier` attribute), which is always preserved and must not be
included in the provided list. If included anyway, it is ignored. See
[setUniqueIdentifier](#setuniqueidentifier) to change it.

Identifiers are placed in the order they are provided.

`dc:source` entries are not touched, use [setSources](#setsources) for those.

When an entry has an `identifierType`, it is written in the refining form
(a `meta` with `property="identifier-type"`, carrying the `scheme`
attribute when provided). An entry with only a `scheme` is written using
the legacy `opf:scheme` attribute.

##### Parameters

| Parameter     | Type                                  |
| ------------- | ------------------------------------- |
| `identifiers` | [`EpubIdentifier`](#epubidentifier)[] |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier

#### setLanguage()

> **setLanguage**(`locale`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:1918](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1918)

Update the Epub's language metadata entry.

Updates the existing dc:language element if one exists.
Otherwise creates a new element

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

Defined in: [libraries/epub/index.ts:2087](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2087)

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

#### setPageBreakSource()

> **setPageBreakSource**(`value`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:1323](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1323)

Set the `pageBreakSource` property (EPUB 3.4, spec D.2.9), or remove it when
passed null. Replaces an existing `pageBreakSource` meta if present.

Pass `none` to indicate the pagination is unique to this publication.

##### Parameters

| Parameter | Type               |
| --------- | ------------------ |
| `value`   | `string` \| `null` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub/#pageBreakSource

#### setPublicationDate()

> **setPublicationDate**(`date`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:1672](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1672)

Set the dc:date metadata element with the provided date.

Updates the existing dc:date element if one exists.
Otherwise creates a new element

##### Parameters

| Parameter | Type   |
| --------- | ------ |
| `date`    | `Date` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcdate

#### setSources()

> **setSources**(`sources`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:1474](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1474)

Replace the publication's `dc:source` entries.

This replaces ALL existing `dc:source` elements (and their refining
`identifier-type` / `source-of` metas). `dc:identifier` entries are not
touched; use [setIdentifiers](#setidentifiers) for those. Pass an empty array to
remove all sources.

When an entry has an `identifierType`, it is written in the refining form.
A `sourceOf` value is written as a refining `source-of` meta (spec D.3.11).
An entry with only a `scheme` uses the legacy `opf:scheme` attribute.

##### Parameters

| Parameter | Type                          |
| --------- | ----------------------------- |
| `sources` | [`EpubSource`](#epubsource)[] |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcsource

#### setTitle()

> **setTitle**(`title`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:2111](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2111)

Set the title of the Epub.

This will replace all existing dc:title elements with
this title. It will be given title-type "main".

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

Defined in: [libraries/epub/index.ts:2139](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L2139)

##### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `entries` | `object`[] |

##### Returns

`Promise`\<`void`\>

#### setType()

> **setType**(`type`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:1741](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1741)

Set the dc:type metadata element.

Updates the existing dc:type element if one exists.
Otherwise creates a new element.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `type`    | `string` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctype

#### setUniqueIdentifier()

> **setUniqueIdentifier**(`identifier`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:1132](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L1132)

Set the unique identifier id for the EPUB.

Updates the existing dc:identifier element referenced by the unique identifier id if one exists.
Otherwise creates a new element with the provided identifier, and sets the unique identifier id to the new element's id.

Note: you likely shouldn't change the unique identifier id unless you are producing a new EPUB.

##### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `identifier` | `string` |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier

#### updateManifestItem()

> **updateManifestItem**(`id`, `newItem`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:3271](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3271)

Update the manifest entry for an existing item.

To update the contents of an entry, use `epub.writeItemContents()`
or `epub.writeXhtmlItemContents()`

##### Parameters

| Parameter | Type                                              |
| --------- | ------------------------------------------------- |
| `id`      | `string`                                          |
| `newItem` | `Omit`\<[`ManifestItem`](#manifestitem), `"id"`\> |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-pkg-manifest

#### withPackage()

> **withPackage**(`producer`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:854](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L854)

Safely modify the package document, without race conditions.

Since the reading the package document is an async process,
multiple simultaneously dispatched function calls that all
attempt to modify it can clobber each other's changes. This
method uses a mutex to ensure that each update runs exclusively.

##### Parameters

| Parameter  | Type                                                                                                                                                                                                             | Description                                                                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `producer` | (`packageElement`) => `void` \| (`packageElement`) => [`PackageElement`](#packageelement) \| (`packageElement`) => `Promise`\<[`PackageElement`](#packageelement)\> \| (`packageElement`) => `Promise`\<`void`\> | The function to update the package document. If it returns a new package document, that will be persisted, otherwise it will be assumed that the package document was modified in place. |

##### Returns

`Promise`\<`void`\>

#### writeItemContents()

##### Call Signature

> **writeItemContents**(`id`, `contents`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:3112](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3112)

Write new contents for an existing manifest item,
specified by its id.

The id must reference an existing manifest item. If
creating a new item, use `epub.addManifestItem()` instead.

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

Defined in: [libraries/epub/index.ts:3113](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3113)

Write new contents for an existing manifest item,
specified by its id.

The id must reference an existing manifest item. If
creating a new item, use `epub.addManifestItem()` instead.

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

Defined in: [libraries/epub/index.ts:3152](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3152)

Write new contents for an existing XHTML item,
specified by its id.

The id must reference an existing manifest item. If
creating a new item, use `epub.addManifestItem()` instead.

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

Defined in: [libraries/epub/index.ts:438](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L438)

Given an XML structure representing a complete XHTML document,
add a `link` element to the `head` of the document.

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

#### assertEpub3()

> `static` **assertEpub3**(`epub`): `Promise`\<`void`\>

Defined in: [libraries/epub/index.ts:713](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L713)

##### Parameters

| Parameter | Type            |
| --------- | --------------- |
| `epub`    | [`Epub`](#epub) |

##### Returns

`Promise`\<`void`\>

#### create()

> `static` **create**(`path`, `dublinCore`, `additionalMetadata`): `Promise`\<[`Epub`](#epub)\>

Defined in: [libraries/epub/index.ts:661](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L661)

Construct a new EPUB on a writable backend, optionally seeded
with the provided metadata. Equivalent to
`Epub.using(TmpFsAdapter).create(...)`.

##### Parameters

| Parameter            | Type                            | Default value | Description                             |
| -------------------- | ------------------------------- | ------------- | --------------------------------------- |
| `path`               | `string`                        | `undefined`   | -                                       |
| `dublinCore`         | [`DublinCore`](#dublincore)     | `undefined`   | Core metadata terms                     |
| `additionalMetadata` | [`EpubMetadata`](#epubmetadata) | `[]`          | An array of additional metadata entries |

##### Returns

`Promise`\<[`Epub`](#epub)\>

#### createXmlElement()

> `static` **createXmlElement**\<`Name`\>(`name`, `properties`, `children`): [`XmlElement`](#xmlelement)\<`Name`\>

Defined in: [libraries/epub/index.ts:473](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L473)

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` _extends_ `` `r${string}` `` \| `` `a${string}` `` \| `` `b${string}` `` \| `` `c${string}` `` \| `` `d${string}` `` \| `` `e${string}` `` \| `` `f${string}` `` \| `` `g${string}` `` \| `` `h${string}` `` \| `` `i${string}` `` \| `` `j${string}` `` \| `` `k${string}` `` \| `` `l${string}` `` \| `` `m${string}` `` \| `` `n${string}` `` \| `` `o${string}` `` \| `` `p${string}` `` \| `` `q${string}` `` \| `` `s${string}` `` \| `` `t${string}` `` \| `` `u${string}` `` \| `` `v${string}` `` \| `` `w${string}` `` \| `` `x${string}` `` \| `` `y${string}` `` \| `` `z${string}` `` \| `` `R${string}` `` \| `` `A${string}` `` \| `` `B${string}` `` \| `` `C${string}` `` \| `` `D${string}` `` \| `` `E${string}` `` \| `` `F${string}` `` \| `` `G${string}` `` \| `` `H${string}` `` \| `` `I${string}` `` \| `` `J${string}` `` \| `` `K${string}` `` \| `` `L${string}` `` \| `` `M${string}` `` \| `` `N${string}` `` \| `` `O${string}` `` \| `` `P${string}` `` \| `` `Q${string}` `` \| `` `S${string}` `` \| `` `T${string}` `` \| `` `U${string}` `` \| `` `V${string}` `` \| `` `W${string}` `` \| `` `X${string}` `` \| `` `Y${string}` `` \| `` `Z${string}` `` \| `` `?${string}` `` |

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

Defined in: [libraries/epub/index.ts:486](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L486)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `text`    | `string` |

##### Returns

[`XmlTextNode`](#xmltextnode)

#### findXmlChildByName()

> `static` **findXmlChildByName**\<`Name`\>(`name`, `xml`, `filter?`): [`XmlElement`](#xmlelement)\<`Name`\> \| `undefined`

Defined in: [libraries/epub/index.ts:559](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L559)

Given an XML structure, find the first child matching
the provided name and optional filter.

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` _extends_ `` `r${string}` `` \| `` `a${string}` `` \| `` `b${string}` `` \| `` `c${string}` `` \| `` `d${string}` `` \| `` `e${string}` `` \| `` `f${string}` `` \| `` `g${string}` `` \| `` `h${string}` `` \| `` `i${string}` `` \| `` `j${string}` `` \| `` `k${string}` `` \| `` `l${string}` `` \| `` `m${string}` `` \| `` `n${string}` `` \| `` `o${string}` `` \| `` `p${string}` `` \| `` `q${string}` `` \| `` `s${string}` `` \| `` `t${string}` `` \| `` `u${string}` `` \| `` `v${string}` `` \| `` `w${string}` `` \| `` `x${string}` `` \| `` `y${string}` `` \| `` `z${string}` `` \| `` `R${string}` `` \| `` `A${string}` `` \| `` `B${string}` `` \| `` `C${string}` `` \| `` `D${string}` `` \| `` `E${string}` `` \| `` `F${string}` `` \| `` `G${string}` `` \| `` `H${string}` `` \| `` `I${string}` `` \| `` `J${string}` `` \| `` `K${string}` `` \| `` `L${string}` `` \| `` `M${string}` `` \| `` `N${string}` `` \| `` `O${string}` `` \| `` `P${string}` `` \| `` `Q${string}` `` \| `` `S${string}` `` \| `` `T${string}` `` \| `` `U${string}` `` \| `` `V${string}` `` \| `` `W${string}` `` \| `` `X${string}` `` \| `` `Y${string}` `` \| `` `Z${string}` `` \| `` `?${string}` `` |

##### Parameters

| Parameter | Type                      |
| --------- | ------------------------- |
| `name`    | `Name`                    |
| `xml`     | [`ParsedXml`](#parsedxml) |
| `filter?` | (`node`) => `boolean`     |

##### Returns

[`XmlElement`](#xmlelement)\<`Name`\> \| `undefined`

#### findXmlDescendantByName()

> `static` **findXmlDescendantByName**\<`Name`\>(`name`, `xml`, `filter?`): [`XmlElement`](#xmlelement)\<`Name`\> \| `undefined`

Defined in: [libraries/epub/index.ts:577](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L577)

Given an XML structure, find the first descendant matching
the provided name and optional filter.

Will perform a breadth first search for the element, returning
the highest element in the tree matching the name and filter.

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` _extends_ `` `r${string}` `` \| `` `a${string}` `` \| `` `b${string}` `` \| `` `c${string}` `` \| `` `d${string}` `` \| `` `e${string}` `` \| `` `f${string}` `` \| `` `g${string}` `` \| `` `h${string}` `` \| `` `i${string}` `` \| `` `j${string}` `` \| `` `k${string}` `` \| `` `l${string}` `` \| `` `m${string}` `` \| `` `n${string}` `` \| `` `o${string}` `` \| `` `p${string}` `` \| `` `q${string}` `` \| `` `s${string}` `` \| `` `t${string}` `` \| `` `u${string}` `` \| `` `v${string}` `` \| `` `w${string}` `` \| `` `x${string}` `` \| `` `y${string}` `` \| `` `z${string}` `` \| `` `R${string}` `` \| `` `A${string}` `` \| `` `B${string}` `` \| `` `C${string}` `` \| `` `D${string}` `` \| `` `E${string}` `` \| `` `F${string}` `` \| `` `G${string}` `` \| `` `H${string}` `` \| `` `I${string}` `` \| `` `J${string}` `` \| `` `K${string}` `` \| `` `L${string}` `` \| `` `M${string}` `` \| `` `N${string}` `` \| `` `O${string}` `` \| `` `P${string}` `` \| `` `Q${string}` `` \| `` `S${string}` `` \| `` `T${string}` `` \| `` `U${string}` `` \| `` `V${string}` `` \| `` `W${string}` `` \| `` `X${string}` `` \| `` `Y${string}` `` \| `` `Z${string}` `` \| `` `?${string}` `` |

##### Parameters

| Parameter | Type                      |
| --------- | ------------------------- |
| `name`    | `Name`                    |
| `xml`     | [`ParsedXml`](#parsedxml) |
| `filter?` | (`node`) => `boolean`     |

##### Returns

[`XmlElement`](#xmlelement)\<`Name`\> \| `undefined`

#### formatSmilDuration()

> `static` **formatSmilDuration**(`duration`): `string`

Defined in: [libraries/epub/index.ts:421](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L421)

Format a duration, provided as a number of seconds, as
a SMIL clock value, to be used for Media Overlays.

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `duration` | `number` |

##### Returns

`string`

##### Link

https://www.w3.org/TR/epub-33/#sec-duration

#### from()

##### Call Signature

> `static` **from**(`pathOrData`): `Promise`\<[`Epub`](#epub)\>

Defined in: [libraries/epub/index.ts:697](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L697)

Open an existing EPUB publication, extracting it to a temp directory
so writes can mutate the unpacked tree and rezip with `saveAndClose`.

Pass `{ readonly: true }` to gate mutations at runtime.

prefer `Epub.using(TmpFsAdapter).from(path)` (or
`Epub.using(MemoryAdapter).from(path)` for read-only, in-memory access)

###### Parameters

| Parameter    | Type                              |
| ------------ | --------------------------------- |
| `pathOrData` | [`ArchiveSource`](#archivesource) |

###### Returns

`Promise`\<[`Epub`](#epub)\>

###### Throws

when the archive is not a valid EPUB 3

##### Call Signature

> `static` **from**(`pathOrData`, `options`): `Promise`\<[`EpubReader`](#epubreader)\>

Defined in: [libraries/epub/index.ts:698](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L698)

Open an existing EPUB publication, extracting it to a temp directory
so writes can mutate the unpacked tree and rezip with `saveAndClose`.

Pass `{ readonly: true }` to gate mutations at runtime.

prefer `Epub.using(TmpFsAdapter).from(path)` (or
`Epub.using(MemoryAdapter).from(path)` for read-only, in-memory access)

###### Parameters

| Parameter    | Type                                     |
| ------------ | ---------------------------------------- |
| `pathOrData` | [`ArchiveSource`](#archivesource)        |
| `options`    | [`FromOptions`](#fromoptions) & `object` |

###### Returns

`Promise`\<[`EpubReader`](#epubreader)\>

###### Throws

when the archive is not a valid EPUB 3

##### Call Signature

> `static` **from**(`pathOrData`, `options?`): `Promise`\<[`Epub`](#epub) \| [`EpubReader`](#epubreader)\>

Defined in: [libraries/epub/index.ts:702](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L702)

Open an existing EPUB publication, extracting it to a temp directory
so writes can mutate the unpacked tree and rezip with `saveAndClose`.

Pass `{ readonly: true }` to gate mutations at runtime.

prefer `Epub.using(TmpFsAdapter).from(path)` (or
`Epub.using(MemoryAdapter).from(path)` for read-only, in-memory access)

###### Parameters

| Parameter    | Type                              |
| ------------ | --------------------------------- |
| `pathOrData` | [`ArchiveSource`](#archivesource) |
| `options?`   | [`FromOptions`](#fromoptions)     |

###### Returns

`Promise`\<[`Epub`](#epub) \| [`EpubReader`](#epubreader)\>

###### Throws

when the archive is not a valid EPUB 3

#### getXhtmlBody()

> `static` **getXhtmlBody**(`xml`): [`ParsedXml`](#parsedxml)

Defined in: [libraries/epub/index.ts:463](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L463)

Given an XML structure representing a complete XHTML document,
return the sub-structure representing the children of the
document's body element.

##### Parameters

| Parameter | Type                      |
| --------- | ------------------------- |
| `xml`     | [`ParsedXml`](#parsedxml) |

##### Returns

[`ParsedXml`](#parsedxml)

#### getXhtmlTextContent()

> `static` **getXhtmlTextContent**(`xml`): `string`

Defined in: [libraries/epub/index.ts:495](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L495)

Given an XML structure representing a complete XHTML document,
return a string representing the concatenation of all text nodes
in the document.

##### Parameters

| Parameter | Type                      |
| --------- | ------------------------- |
| `xml`     | [`ParsedXml`](#parsedxml) |

##### Returns

`string`

#### getXmlAttributes()

> `static` **getXmlAttributes**(`element`): `Record`\<`string`, `string`\>

Defined in: [libraries/epub/index.ts:512](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L512)

Given an XMLElement, return its attributes.

##### Parameters

| Parameter | Type                        |
| --------- | --------------------------- |
| `element` | [`XmlElement`](#xmlelement) |

##### Returns

`Record`\<`string`, `string`\>

#### getXmlChildren()

> `static` **getXmlChildren**\<`Name`\>(`element`): [`ParsedXml`](#parsedxml)

Defined in: [libraries/epub/index.ts:539](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L539)

Given an XMLElement, return a list of its children

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` _extends_ `` `r${string}` `` \| `` `a${string}` `` \| `` `b${string}` `` \| `` `c${string}` `` \| `` `d${string}` `` \| `` `e${string}` `` \| `` `f${string}` `` \| `` `g${string}` `` \| `` `h${string}` `` \| `` `i${string}` `` \| `` `j${string}` `` \| `` `k${string}` `` \| `` `l${string}` `` \| `` `m${string}` `` \| `` `n${string}` `` \| `` `o${string}` `` \| `` `p${string}` `` \| `` `q${string}` `` \| `` `s${string}` `` \| `` `t${string}` `` \| `` `u${string}` `` \| `` `v${string}` `` \| `` `w${string}` `` \| `` `x${string}` `` \| `` `y${string}` `` \| `` `z${string}` `` \| `` `R${string}` `` \| `` `A${string}` `` \| `` `B${string}` `` \| `` `C${string}` `` \| `` `D${string}` `` \| `` `E${string}` `` \| `` `F${string}` `` \| `` `G${string}` `` \| `` `H${string}` `` \| `` `I${string}` `` \| `` `J${string}` `` \| `` `K${string}` `` \| `` `L${string}` `` \| `` `M${string}` `` \| `` `N${string}` `` \| `` `O${string}` `` \| `` `P${string}` `` \| `` `Q${string}` `` \| `` `S${string}` `` \| `` `T${string}` `` \| `` `U${string}` `` \| `` `V${string}` `` \| `` `W${string}` `` \| `` `X${string}` `` \| `` `Y${string}` `` \| `` `Z${string}` `` \| `` `?${string}` `` |

##### Parameters

| Parameter | Type                                  |
| --------- | ------------------------------------- |
| `element` | [`XmlElement`](#xmlelement)\<`Name`\> |

##### Returns

[`ParsedXml`](#parsedxml)

#### getXmlElementName()

> `static` **getXmlElementName**\<`Name`\>(`element`): `Name`

Defined in: [libraries/epub/index.ts:524](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L524)

Given an XMLElement, return its tag name.

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` _extends_ `` `r${string}` `` \| `` `a${string}` `` \| `` `b${string}` `` \| `` `c${string}` `` \| `` `d${string}` `` \| `` `e${string}` `` \| `` `f${string}` `` \| `` `g${string}` `` \| `` `h${string}` `` \| `` `i${string}` `` \| `` `j${string}` `` \| `` `k${string}` `` \| `` `l${string}` `` \| `` `m${string}` `` \| `` `n${string}` `` \| `` `o${string}` `` \| `` `p${string}` `` \| `` `q${string}` `` \| `` `s${string}` `` \| `` `t${string}` `` \| `` `u${string}` `` \| `` `v${string}` `` \| `` `w${string}` `` \| `` `x${string}` `` \| `` `y${string}` `` \| `` `z${string}` `` \| `` `R${string}` `` \| `` `A${string}` `` \| `` `B${string}` `` \| `` `C${string}` `` \| `` `D${string}` `` \| `` `E${string}` `` \| `` `F${string}` `` \| `` `G${string}` `` \| `` `H${string}` `` \| `` `I${string}` `` \| `` `J${string}` `` \| `` `K${string}` `` \| `` `L${string}` `` \| `` `M${string}` `` \| `` `N${string}` `` \| `` `O${string}` `` \| `` `P${string}` `` \| `` `Q${string}` `` \| `` `S${string}` `` \| `` `T${string}` `` \| `` `U${string}` `` \| `` `V${string}` `` \| `` `W${string}` `` \| `` `X${string}` `` \| `` `Y${string}` `` \| `` `Z${string}` `` \| `` `?${string}` `` |

##### Parameters

| Parameter | Type                                  |
| --------- | ------------------------------------- |
| `element` | [`XmlElement`](#xmlelement)\<`Name`\> |

##### Returns

`Name`

#### isXmlTextNode()

> `static` **isXmlTextNode**(`node`): `node is XmlTextNode`

Defined in: [libraries/epub/index.ts:599](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L599)

Given an XMLNode, determine whether it represents
a text node or an XML element.

##### Parameters

| Parameter | Type                  |
| --------- | --------------------- |
| `node`    | [`XmlNode`](#xmlnode) |

##### Returns

`node is XmlTextNode`

#### replaceXmlChildren()

> `static` **replaceXmlChildren**\<`Name`\>(`element`, `children`): `void`

Defined in: [libraries/epub/index.ts:547](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L547)

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` _extends_ `` `r${string}` `` \| `` `a${string}` `` \| `` `b${string}` `` \| `` `c${string}` `` \| `` `d${string}` `` \| `` `e${string}` `` \| `` `f${string}` `` \| `` `g${string}` `` \| `` `h${string}` `` \| `` `i${string}` `` \| `` `j${string}` `` \| `` `k${string}` `` \| `` `l${string}` `` \| `` `m${string}` `` \| `` `n${string}` `` \| `` `o${string}` `` \| `` `p${string}` `` \| `` `q${string}` `` \| `` `s${string}` `` \| `` `t${string}` `` \| `` `u${string}` `` \| `` `v${string}` `` \| `` `w${string}` `` \| `` `x${string}` `` \| `` `y${string}` `` \| `` `z${string}` `` \| `` `R${string}` `` \| `` `A${string}` `` \| `` `B${string}` `` \| `` `C${string}` `` \| `` `D${string}` `` \| `` `E${string}` `` \| `` `F${string}` `` \| `` `G${string}` `` \| `` `H${string}` `` \| `` `I${string}` `` \| `` `J${string}` `` \| `` `K${string}` `` \| `` `L${string}` `` \| `` `M${string}` `` \| `` `N${string}` `` \| `` `O${string}` `` \| `` `P${string}` `` \| `` `Q${string}` `` \| `` `S${string}` `` \| `` `T${string}` `` \| `` `U${string}` `` \| `` `V${string}` `` \| `` `W${string}` `` \| `` `X${string}` `` \| `` `Y${string}` `` \| `` `Z${string}` `` \| `` `?${string}` `` |

##### Parameters

| Parameter  | Type                                  |
| ---------- | ------------------------------------- |
| `element`  | [`XmlElement`](#xmlelement)\<`Name`\> |
| `children` | [`XmlNode`](#xmlnode)[]               |

##### Returns

`void`

#### upgrade()

> `static` **upgrade**(`path`, `options`): `Promise`\<[`Epub`](#epub)\>

Defined in: [libraries/epub/index.ts:3605](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3605)

Upgrade an EPUB 2 publication to EPUB 3 in place, returning a new,
valid Epub 3 instance. Equivalent to
`Epub.using(TmpFsAdapter).upgrade(...)`.

##### Parameters

| Parameter | Type                                          |
| --------- | --------------------------------------------- |
| `path`    | `string`                                      |
| `options` | [`Epub2UpgradeOptions`](#epub2upgradeoptions) |

##### Returns

`Promise`\<[`Epub`](#epub)\>

#### using()

> `static` **using**\<`A`\>(`adapterClass`): [`EpubFactory`](#epubfactory)\<`A`\>

Defined in: [libraries/epub/index.ts:681](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L681)

Specify the storage backend to use for the EPUB

The returned factory exposes `from`, `create`, and `upgrade`,
which route through the supplied adapter.

##### Type Parameters

| Type Parameter                                                                  |
| ------------------------------------------------------------------------------- |
| `A` _extends_ [`EpubStorageAdapterClass`](#epubstorageadapterclass)\<`object`\> |

##### Parameters

| Parameter      | Type |
| -------------- | ---- |
| `adapterClass` | `A`  |

##### Returns

[`EpubFactory`](#epubfactory)\<`A`\>

##### Example

```ts
using epub = await Epub.using(TmpFsAdapter).from(path);
using reader = await Epub.using(MemoryAdapter).from(buffer, { cache: false });
```

---

## EpubFactory\<A\>

Defined in: [libraries/epub/index.ts:3634](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3634)

Adapter-bound factory returned by [Epub.using](#using).

Mirrors the static factory surface (`from`, `create`, `upgrade`) but routes
all I/O through the supplied adapter. Each method's signature degrades
gracefully when the adapter doesn't support the operation: `create` and
`upgrade` throw at runtime if the adapter is read-only or lacks `initEmpty`.

### Type Parameters

| Type Parameter                                                      |
| ------------------------------------------------------------------- |
| `A` _extends_ [`EpubStorageAdapterClass`](#epubstorageadapterclass) |

### Constructors

#### Constructor

> **new EpubFactory**\<`A`\>(`adapterClass`): [`EpubFactory`](#epubfactory)\<`A`\>

Defined in: [libraries/epub/index.ts:3635](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3635)

##### Parameters

| Parameter      | Type |
| -------------- | ---- |
| `adapterClass` | `A`  |

##### Returns

[`EpubFactory`](#epubfactory)\<`A`\>

### Properties

#### adapterClass

> `readonly` **adapterClass**: `A`

Defined in: [libraries/epub/index.ts:3635](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3635)

### Methods

#### create()

> **create**(`path`, `__namedParameters`, `additionalMetadata`): `Promise`\<[`EpubInstanceFor`](#epubinstancefor)\<`A`\>\>

Defined in: [libraries/epub/index.ts:3715](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3715)

Construct a new EPUB on this factory's adapter, optionally seeded
with the provided metadata. Requires a writable adapter that
implements `initEmpty` (today: [TmpFsAdapter](#tmpfsadapter)).

##### Parameters

| Parameter            | Type                            | Default value |
| -------------------- | ------------------------------- | ------------- |
| `path`               | `string`                        | `undefined`   |
| `__namedParameters`  | [`DublinCore`](#dublincore)     | `undefined`   |
| `additionalMetadata` | [`EpubMetadata`](#epubmetadata) | `[]`          |

##### Returns

`Promise`\<[`EpubInstanceFor`](#epubinstancefor)\<`A`\>\>

##### Throws

when the adapter is read-only or does not implement initEmpty

#### from()

##### Call Signature

> **from**(`source`, `options`): `Promise`\<`Pick`\<[`Epub`](#epub), `"storage"` \| `"getItemArchiveLength"` \| `"getRootfile"` \| `"getPackageDocumentSource"` \| `"getPackageElement"` \| `"getManifest"` \| `"findMetadataItem"` \| `"findAllMetadataItems"` \| `"getMetadata"` \| `"getIdentifier"` \| `"getUniqueIdentifier"` \| `"getUniqueIdentifierId"` \| `"getIdentifiers"` \| `"getSources"` \| `"getPageBreakSource"` \| `"getCoverImageItem"` \| `"getCoverImage"` \| `"getPublicationDate"` \| `"getModifiedDate"` \| `"getLayout"` \| `"getBaseDirection"` \| `"getType"` \| `"getSubjects"` \| `"getLanguage"` \| `"getTitle"` \| `"getSubtitle"` \| `"getTitles"` \| `"getDescription"` \| `"getPackageVocabularyPrefixes"` \| `"getCollections"` \| `"getCreators"` \| `"getContributors"` \| `"getSpineItems"` \| `"getTableOfContents"` \| `"getLandmarks"` \| `"getPageList"` \| `"resolveHref"` \| `"readFileContents"` \| `"readItemContents"` \| `"readXhtmlItemContents"` \| `"getVersion"` \| `"getNcxTableOfContents"` \| `"getGuideEntries"` \| `"discardAndClose"`\> & `Disposable` & `object`\>

Defined in: [libraries/epub/index.ts:3642](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3642)

Open an existing EPUB through this factory's adapter

###### Parameters

| Parameter | Type                                                                                  |
| --------- | ------------------------------------------------------------------------------------- |
| `source`  | [`ArchiveSource`](#archivesource)                                                     |
| `options` | [`FromOptions`](#fromoptions) & `object` & [`AdapterOptions`](#adapteroptions)\<`A`\> |

###### Returns

`Promise`\<`Pick`\<[`Epub`](#epub), `"storage"` \| `"getItemArchiveLength"` \| `"getRootfile"` \| `"getPackageDocumentSource"` \| `"getPackageElement"` \| `"getManifest"` \| `"findMetadataItem"` \| `"findAllMetadataItems"` \| `"getMetadata"` \| `"getIdentifier"` \| `"getUniqueIdentifier"` \| `"getUniqueIdentifierId"` \| `"getIdentifiers"` \| `"getSources"` \| `"getPageBreakSource"` \| `"getCoverImageItem"` \| `"getCoverImage"` \| `"getPublicationDate"` \| `"getModifiedDate"` \| `"getLayout"` \| `"getBaseDirection"` \| `"getType"` \| `"getSubjects"` \| `"getLanguage"` \| `"getTitle"` \| `"getSubtitle"` \| `"getTitles"` \| `"getDescription"` \| `"getPackageVocabularyPrefixes"` \| `"getCollections"` \| `"getCreators"` \| `"getContributors"` \| `"getSpineItems"` \| `"getTableOfContents"` \| `"getLandmarks"` \| `"getPageList"` \| `"resolveHref"` \| `"readFileContents"` \| `"readItemContents"` \| `"readXhtmlItemContents"` \| `"getVersion"` \| `"getNcxTableOfContents"` \| `"getGuideEntries"` \| `"discardAndClose"`\> & `Disposable` & `object`\>

###### Throws

when the archive is not a valid EPUB 3

##### Call Signature

> **from**(`source`, `options?`): `Promise`\<[`EpubInstanceFor`](#epubinstancefor)\<`A`\> & `object`\>

Defined in: [libraries/epub/index.ts:3646](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3646)

Open an existing EPUB through this factory's adapter

###### Parameters

| Parameter  | Type                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| `source`   | [`ArchiveSource`](#archivesource)                                          |
| `options?` | [`FromOptions`](#fromoptions) & [`AdapterOptions`](#adapteroptions)\<`A`\> |

###### Returns

`Promise`\<[`EpubInstanceFor`](#epubinstancefor)\<`A`\> & `object`\>

###### Throws

when the archive is not a valid EPUB 3

#### readPackageDocumentSource()

> **readPackageDocumentSource**(`source`, `options`): `Promise`\<`string`\>

Defined in: [libraries/epub/index.ts:3689](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3689)

##### Parameters

| Parameter | Type                                       |
| --------- | ------------------------------------------ |
| `source`  | [`ArchiveSource`](#archivesource)          |
| `options` | [`AdapterOptions`](#adapteroptions)\<`A`\> |

##### Returns

`Promise`\<`string`\>

#### upgrade()

> **upgrade**(`path`, `options`): `Promise`\<[`EpubInstanceFor`](#epubinstancefor)\<`A`\>\>

Defined in: [libraries/epub/index.ts:3826](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3826)

Upgrade an EPUB 2 publication to EPUB 3 in place using this
factory's adapter, returning a new, valid Epub 3 instance.

Performs the following transformations:

- upgrades OPF metadata to EPUB 3 conventions
- scans XHTML documents and adds manifest item properties
- parses the NCX into a TOC tree and generates a nav.xhtml
- removes the NCX file and the guide element (configurable)
- fixes common font MIME types
- bumps the package version to 3.0
- goes over each xhtml item and rewrites it using XMLParser to make sure the output is valid XHTML

Requires a writable adapter. When [Upgrade.Epub2UpgradeOptions.outputPath](#outputpath)
is set, the source file is copied to that path on disk first; this
only makes sense for adapters whose `source` is a real fs path.

##### Parameters

| Parameter | Type                                          |
| --------- | --------------------------------------------- |
| `path`    | `string`                                      |
| `options` | [`Epub2UpgradeOptions`](#epub2upgradeoptions) |

##### Returns

`Promise`\<[`EpubInstanceFor`](#epubinstancefor)\<`A`\>\>

##### Throws

when the adapter is read-only

---

## EpubReadOnlyError

Defined in: [libraries/epub/index.ts:238](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L238)

### Extends

- `Error`

### Constructors

#### Constructor

> **new EpubReadOnlyError**(`message?`): [`EpubReadOnlyError`](#epubreadonlyerror)

Defined in: node_modules/@typescript/old/lib/lib.es5.d.ts:1080

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `message?` | `string` |

##### Returns

[`EpubReadOnlyError`](#epubreadonlyerror)

##### Inherited from

`Error.constructor`

#### Constructor

> **new EpubReadOnlyError**(`message?`, `options?`): [`EpubReadOnlyError`](#epubreadonlyerror)

Defined in: node_modules/@typescript/old/lib/lib.es5.d.ts:1080

##### Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `message?` | `string`       |
| `options?` | `ErrorOptions` |

##### Returns

[`EpubReadOnlyError`](#epubreadonlyerror)

##### Inherited from

`Error.constructor`

### Properties

#### cause?

> `optional` **cause**: `unknown`

Defined in: node_modules/@typescript/old/lib/lib.es2022.error.d.ts:24

##### Inherited from

`Error.cause`

#### message

> **message**: `string`

Defined in: node_modules/@typescript/old/lib/lib.es5.d.ts:1075

##### Inherited from

`Error.message`

#### name

> **name**: `string`

Defined in: node_modules/@typescript/old/lib/lib.es5.d.ts:1074

##### Inherited from

`Error.name`

#### stack?

> `optional` **stack**: `string`

Defined in: node_modules/@typescript/old/lib/lib.es5.d.ts:1076

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

If set to a non-number value, or set to a negative number, stack traces will
not capture any frames.

##### Inherited from

`Error.stackTraceLimit`

### Methods

#### captureStackTrace()

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Defined in: node_modules/@types/node/globals.d.ts:52

Creates a `.stack` property on `targetObject`, which when accessed returns
a string representing the location in the code at which
`Error.captureStackTrace()` was called.

```js
const myObject = {};
Error.captureStackTrace(myObject);
myObject.stack; // Similar to `new Error().stack`
```

The first line of the trace will be prefixed with
`${myObject.name}: ${myObject.message}`.

The optional `constructorOpt` argument accepts a function. If given, all frames
above `constructorOpt`, including `constructorOpt`, will be omitted from the
generated stack trace.

The `constructorOpt` argument is useful for hiding implementation
details of error generation from the user. For instance:

```js
function a() {
  b();
}

function b() {
  c();
}

function c() {
  // Create an error without stack trace to avoid calculating the stack trace twice.
  const { stackTraceLimit } = Error;
  Error.stackTraceLimit = 0;
  const error = new Error();
  Error.stackTraceLimit = stackTraceLimit;

  // Capture the stack trace above function b
  Error.captureStackTrace(error, b); // Neither function c, nor b is included in the stack trace
  throw error;
}

a();
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

Defined in: node_modules/@typescript/old/lib/lib.esnext.error.d.ts:21

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

## EpubVersionError

Defined in: [libraries/epub/index.ts:237](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L237)

### Extends

- `Error`

### Constructors

#### Constructor

> **new EpubVersionError**(`message?`): [`EpubVersionError`](#epubversionerror)

Defined in: node_modules/@typescript/old/lib/lib.es5.d.ts:1080

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `message?` | `string` |

##### Returns

[`EpubVersionError`](#epubversionerror)

##### Inherited from

`Error.constructor`

#### Constructor

> **new EpubVersionError**(`message?`, `options?`): [`EpubVersionError`](#epubversionerror)

Defined in: node_modules/@typescript/old/lib/lib.es5.d.ts:1080

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

Defined in: node_modules/@typescript/old/lib/lib.es2022.error.d.ts:24

##### Inherited from

`Error.cause`

#### message

> **message**: `string`

Defined in: node_modules/@typescript/old/lib/lib.es5.d.ts:1075

##### Inherited from

`Error.message`

#### name

> **name**: `string`

Defined in: node_modules/@typescript/old/lib/lib.es5.d.ts:1074

##### Inherited from

`Error.name`

#### stack?

> `optional` **stack**: `string`

Defined in: node_modules/@typescript/old/lib/lib.es5.d.ts:1076

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

If set to a non-number value, or set to a negative number, stack traces will
not capture any frames.

##### Inherited from

`Error.stackTraceLimit`

### Methods

#### captureStackTrace()

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Defined in: node_modules/@types/node/globals.d.ts:52

Creates a `.stack` property on `targetObject`, which when accessed returns
a string representing the location in the code at which
`Error.captureStackTrace()` was called.

```js
const myObject = {};
Error.captureStackTrace(myObject);
myObject.stack; // Similar to `new Error().stack`
```

The first line of the trace will be prefixed with
`${myObject.name}: ${myObject.message}`.

The optional `constructorOpt` argument accepts a function. If given, all frames
above `constructorOpt`, including `constructorOpt`, will be omitted from the
generated stack trace.

The `constructorOpt` argument is useful for hiding implementation
details of error generation from the user. For instance:

```js
function a() {
  b();
}

function b() {
  c();
}

function c() {
  // Create an error without stack trace to avoid calculating the stack trace twice.
  const { stackTraceLimit } = Error;
  Error.stackTraceLimit = 0;
  const error = new Error();
  Error.stackTraceLimit = stackTraceLimit;

  // Capture the stack trace above function b
  Error.captureStackTrace(error, b); // Neither function c, nor b is included in the stack trace
  throw error;
}

a();
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

Defined in: node_modules/@typescript/old/lib/lib.esnext.error.d.ts:21

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

## MemoryAdapter

Defined in: [libraries/epub/adapters/memory.ts:30](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/memory.ts#L30)

Loads an EPUB archive into memory and serves all I/O off the in-memory zip handle.

read only

### Implements

- [`EpubStorageAdapter`](#epubstorageadapter)

### Properties

#### capabilities

> `readonly` `static` **capabilities**: `object`

Defined in: [libraries/epub/adapters/memory.ts:32](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/memory.ts#L32)

##### writable

> `readonly` **writable**: `false` = `false`

#### kind

> `readonly` `static` **kind**: `"in-memory"`

Defined in: [libraries/epub/adapters/memory.ts:31](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/memory.ts#L31)

### Methods

#### archiveLength()

> **archiveLength**(`entry`): `Promise`\<`number`\>

Defined in: [libraries/epub/adapters/memory.ts:85](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/memory.ts#L85)

Length of an entry in bytes, for the readium page-count heuristic
which expects compressed size when available

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `entry`   | `string` |

##### Returns

`Promise`\<`number`\>

##### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`archiveLength`](#archivelength-4)

#### dispose()

> **dispose**(): `void`

Defined in: [libraries/epub/adapters/memory.ts:91](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/memory.ts#L91)

Always called on close or error

##### Returns

`void`

##### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`dispose`](#dispose-6)

#### exists()

> **exists**(`entry`): `Promise`\<`boolean`\>

Defined in: [libraries/epub/adapters/memory.ts:80](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/memory.ts#L80)

Whether the archive holds an entry under exactly this name.
Used to choose between different canditates for an href
so should be exact

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `entry`   | `string` |

##### Returns

`Promise`\<`boolean`\>

##### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`exists`](#exists-4)

#### read()

##### Call Signature

> **read**(`entry`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [libraries/epub/adapters/memory.ts:60](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/memory.ts#L60)

###### Parameters

| Parameter | Type     |
| --------- | -------- |
| `entry`   | `string` |

###### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

###### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`read`](#read-6)

##### Call Signature

> **read**(`entry`, `encoding`): `Promise`\<`string`\>

Defined in: [libraries/epub/adapters/memory.ts:61](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/memory.ts#L61)

###### Parameters

| Parameter  | Type      |
| ---------- | --------- |
| `entry`    | `string`  |
| `encoding` | `"utf-8"` |

###### Returns

`Promise`\<`string`\>

###### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`read`](#read-6)

#### init()

> `static` **init**(`source`, `opts`): `Promise`\<[`MemoryAdapter`](#memoryadapter)\>

Defined in: [libraries/epub/adapters/memory.ts:34](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/memory.ts#L34)

##### Parameters

| Parameter | Type                                            |
| --------- | ----------------------------------------------- |
| `source`  | [`ArchiveSource`](#archivesource)               |
| `opts`    | [`MemoryAdapterOptions`](#memoryadapteroptions) |

##### Returns

`Promise`\<[`MemoryAdapter`](#memoryadapter)\>

---

## TmpFsAdapter

Defined in: [libraries/epub/adapters/tmpfs.ts:57](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L57)

Extracts an EPUB archive to a temp directory and serves all I/O off
the real filesystem.
`Epub.using(TmpFsAdapter).from(...)` returns a writable [Epub](#epub).

### Implements

- [`EpubStorageAdapter`](#epubstorageadapter)

### Properties

#### capabilities

> `readonly` `static` **capabilities**: `object`

Defined in: [libraries/epub/adapters/tmpfs.ts:59](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L59)

##### writable

> `readonly` **writable**: `true` = `true`

#### kind

> `readonly` `static` **kind**: `"extracted-dir"`

Defined in: [libraries/epub/adapters/tmpfs.ts:58](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L58)

### Methods

#### archiveLength()

> **archiveLength**(`entry`): `Promise`\<`number`\>

Defined in: [libraries/epub/adapters/tmpfs.ts:127](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L127)

Length of an entry in bytes, for the readium page-count heuristic
which expects compressed size when available

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `entry`   | `string` |

##### Returns

`Promise`\<`number`\>

##### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`archiveLength`](#archivelength-4)

#### dispose()

> **dispose**(): `void`

Defined in: [libraries/epub/adapters/tmpfs.ts:204](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L204)

Always called on close or error

##### Returns

`void`

##### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`dispose`](#dispose-6)

#### duplicate()

> **duplicate**(): `Promise`\<[`TmpFsAdapter`](#tmpfsadapter)\>

Defined in: [libraries/epub/adapters/tmpfs.ts:154](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L154)

Required for Epub.copy

##### Returns

`Promise`\<[`TmpFsAdapter`](#tmpfsadapter)\>

##### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`duplicate`](#duplicate-2)

#### exists()

> **exists**(`entry`): `Promise`\<`boolean`\>

Defined in: [libraries/epub/adapters/tmpfs.ts:118](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L118)

Whether the archive holds an entry under exactly this name.
Used to choose between different canditates for an href
so should be exact

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `entry`   | `string` |

##### Returns

`Promise`\<`boolean`\>

##### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`exists`](#exists-4)

#### list()

> **list**(): `AsyncIterable`\<[`EpubListEntry`](#epublistentry)\>

Defined in: [libraries/epub/adapters/tmpfs.ts:136](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L136)

Required for Epub.saveAndClose to walk the contents

##### Returns

`AsyncIterable`\<[`EpubListEntry`](#epublistentry)\>

##### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`list`](#list-2)

#### read()

##### Call Signature

> **read**(`entry`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [libraries/epub/adapters/tmpfs.ts:96](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L96)

###### Parameters

| Parameter | Type     |
| --------- | -------- |
| `entry`   | `string` |

###### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

###### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`read`](#read-6)

##### Call Signature

> **read**(`entry`, `encoding`): `Promise`\<`string`\>

Defined in: [libraries/epub/adapters/tmpfs.ts:97](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L97)

###### Parameters

| Parameter  | Type      |
| ---------- | --------- |
| `entry`    | `string`  |
| `encoding` | `"utf-8"` |

###### Returns

`Promise`\<`string`\>

###### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`read`](#read-6)

#### remove()

> **remove**(`entry`): `Promise`\<`void`\>

Defined in: [libraries/epub/adapters/tmpfs.ts:114](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L114)

Required for removeManifestItem / setCoverImage replacement

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `entry`   | `string` |

##### Returns

`Promise`\<`void`\>

##### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`remove`](#remove-2)

#### serialize()

> **serialize**(`targetPath`): `Promise`\<`void`\>

Defined in: [libraries/epub/adapters/tmpfs.ts:165](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L165)

Required for Epub.saveAndClose

##### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `targetPath` | `string` |

##### Returns

`Promise`\<`void`\>

##### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`serialize`](#serialize-2)

#### write()

##### Call Signature

> **write**(`entry`, `data`): `Promise`\<`void`\>

Defined in: [libraries/epub/adapters/tmpfs.ts:102](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L102)

Required for any mutation method on Epub

###### Parameters

| Parameter | Type         |
| --------- | ------------ |
| `entry`   | `string`     |
| `data`    | `Uint8Array` |

###### Returns

`Promise`\<`void`\>

###### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`write`](#write-3)

##### Call Signature

> **write**(`entry`, `data`, `encoding`): `Promise`\<`void`\>

Defined in: [libraries/epub/adapters/tmpfs.ts:103](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L103)

###### Parameters

| Parameter  | Type      |
| ---------- | --------- |
| `entry`    | `string`  |
| `data`     | `string`  |
| `encoding` | `"utf-8"` |

###### Returns

`Promise`\<`void`\>

###### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`write`](#write-3)

#### init()

> `static` **init**(`source`): `Promise`\<[`TmpFsAdapter`](#tmpfsadapter)\>

Defined in: [libraries/epub/adapters/tmpfs.ts:61](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L61)

##### Parameters

| Parameter | Type                              |
| --------- | --------------------------------- |
| `source`  | [`ArchiveSource`](#archivesource) |

##### Returns

`Promise`\<[`TmpFsAdapter`](#tmpfsadapter)\>

#### initEmpty()

> `static` **initEmpty**(): `Promise`\<[`TmpFsAdapter`](#tmpfsadapter)\>

Defined in: [libraries/epub/adapters/tmpfs.ts:79](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/tmpfs.ts#L79)

##### Returns

`Promise`\<[`TmpFsAdapter`](#tmpfsadapter)\>

---

## AlternateScript

Defined in: [libraries/epub/index.ts:152](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L152)

### Properties

#### locale

> **locale**: `Locale`

Defined in: [libraries/epub/index.ts:154](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L154)

#### name

> **name**: `string`

Defined in: [libraries/epub/index.ts:153](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L153)

---

## Collection

Defined in: [libraries/epub/index.ts:176](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L176)

### Properties

#### name

> **name**: `string`

Defined in: [libraries/epub/index.ts:177](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L177)

#### position?

> `optional` **position**: `string`

Defined in: [libraries/epub/index.ts:179](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L179)

#### type?

> `optional` **type**: `string`

Defined in: [libraries/epub/index.ts:178](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L178)

---

## DcCreator

Defined in: [libraries/epub/index.ts:157](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L157)

### Properties

#### alternateScripts?

> `optional` **alternateScripts**: [`AlternateScript`](#alternatescript)[]

Defined in: [libraries/epub/index.ts:162](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L162)

#### fileAs?

> `optional` **fileAs**: `string`

Defined in: [libraries/epub/index.ts:161](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L161)

#### name

> **name**: `string`

Defined in: [libraries/epub/index.ts:158](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L158)

#### role?

> `optional` **role**: `string`

Defined in: [libraries/epub/index.ts:159](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L159)

#### roleScheme?

> `optional` **roleScheme**: `string`

Defined in: [libraries/epub/index.ts:160](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L160)

---

## DcSubject

Defined in: [libraries/epub/index.ts:119](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L119)

### Properties

#### authority

> **authority**: `string`

Defined in: [libraries/epub/index.ts:121](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L121)

#### term

> **term**: `string`

Defined in: [libraries/epub/index.ts:122](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L122)

#### value

> **value**: `string`

Defined in: [libraries/epub/index.ts:120](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L120)

---

## DublinCore

Defined in: [libraries/epub/index.ts:165](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L165)

### Properties

#### contributors?

> `optional` **contributors**: [`DcCreator`](#dccreator)[]

Defined in: [libraries/epub/index.ts:172](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L172)

#### creators?

> `optional` **creators**: [`DcCreator`](#dccreator)[]

Defined in: [libraries/epub/index.ts:171](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L171)

#### date?

> `optional` **date**: `Date`

Defined in: [libraries/epub/index.ts:169](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L169)

#### identifier

> **identifier**: `string`

Defined in: [libraries/epub/index.ts:168](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L168)

#### language

> **language**: `Locale`

Defined in: [libraries/epub/index.ts:167](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L167)

#### subjects?

> `optional` **subjects**: (`string` \| [`DcSubject`](#dcsubject))[]

Defined in: [libraries/epub/index.ts:170](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L170)

#### title

> **title**: `string`

Defined in: [libraries/epub/index.ts:166](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L166)

#### type?

> `optional` **type**: `string`

Defined in: [libraries/epub/index.ts:173](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L173)

---

## Epub2UpgradeOptions

Defined in: [libraries/epub/upgrade.ts:69](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/upgrade.ts#L69)

### Properties

#### outputPath?

> `optional` **outputPath**: `string`

Defined in: [libraries/epub/upgrade.ts:73](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/upgrade.ts#L73)

The path to the output file. If provided, the input file will be copied to the output path.

#### removeNcx?

> `optional` **removeNcx**: `boolean`

Defined in: [libraries/epub/upgrade.ts:77](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/upgrade.ts#L77)

Whether to remove the NCX file, as it's technically optional in EPUB 3.

---

## EpubIdentifier

Defined in: [libraries/epub/index.ts:125](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L125)

### Properties

#### id?

> `optional` **id**: `string`

Defined in: [libraries/epub/index.ts:127](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L127)

#### identifierType?

> `optional` **identifierType**: `string`

Defined in: [libraries/epub/index.ts:129](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L129)

the value of a refining `identifier-type` meta, if present

#### scheme?

> `optional` **scheme**: `string`

Defined in: [libraries/epub/index.ts:131](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L131)

the `scheme` of a refining `identifier-type` meta, or a legacy `opf:scheme` attribute

#### value

> **value**: `string`

Defined in: [libraries/epub/index.ts:126](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L126)

---

## EpubListEntry

Defined in: [libraries/epub/adapters/interface.ts:39](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L39)

### Properties

#### absolutePath

> **absolutePath**: `string`

Defined in: [libraries/epub/adapters/interface.ts:41](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L41)

location the adapter can read the entry back from, in whatever form it stores

#### relativePath

> **relativePath**: `string`

Defined in: [libraries/epub/adapters/interface.ts:43](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L43)

the entry name, as it appears in the archive

---

## EpubSource

Defined in: [libraries/epub/index.ts:134](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L134)

### Properties

#### id?

> `optional` **id**: `string`

Defined in: [libraries/epub/index.ts:136](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L136)

#### identifierType?

> `optional` **identifierType**: `string`

Defined in: [libraries/epub/index.ts:138](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L138)

the value of a refining `identifier-type` meta, if present

#### isPageBreakSource?

> `optional` **isPageBreakSource**: `boolean`

Defined in: [libraries/epub/index.ts:149](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L149)

whether this source has a `source-of="pagination"` refinement
or of a `<meta property="pageBreakSource">` element

as of EPUB 3.4 `source-of` is advised-deprecated in favour of the
publication-level `pageBreakSource` property. if you want to
be sure to get the source of pagination, use [Epub.getPageBreakSource](#getpagebreaksource)

#### scheme?

> `optional` **scheme**: `string`

Defined in: [libraries/epub/index.ts:140](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L140)

the `scheme` of a refining `identifier-type` meta, or a legacy `opf:scheme` attribute

#### value

> **value**: `string`

Defined in: [libraries/epub/index.ts:135](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L135)

---

## EpubStorageAdapter

Defined in: [libraries/epub/adapters/interface.ts:56](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L56)

Adapters only receive entry names, which is:

- the name a file has in the archive itself
- relative to the container root, slash-separated,
- already percent-decoded (eg `OEBPS/a b.xhtml`, not `OEBPS/a%20b.xhtml`)

Adapter decides where to store files under what name
In previous versions of the EPUB lib, this was a little bit more muddled, leading to
eg the TmpFsAdapter trying to read `OEBPS/a%20b.xhtml`, whereas it was stored as `OEBPS/a b.xhtml`

### Methods

#### archiveLength()

> **archiveLength**(`entry`): `Promise`\<`number`\>

Defined in: [libraries/epub/adapters/interface.ts:71](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L71)

Length of an entry in bytes, for the readium page-count heuristic
which expects compressed size when available

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `entry`   | `string` |

##### Returns

`Promise`\<`number`\>

#### dispose()

> **dispose**(): `void` \| `Promise`\<`void`\>

Defined in: [libraries/epub/adapters/interface.ts:90](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L90)

Always called on close or error

##### Returns

`void` \| `Promise`\<`void`\>

#### duplicate()?

> `optional` **duplicate**(): `Promise`\<[`EpubStorageAdapter`](#epubstorageadapter)\>

Defined in: [libraries/epub/adapters/interface.ts:84](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L84)

Required for Epub.copy

##### Returns

`Promise`\<[`EpubStorageAdapter`](#epubstorageadapter)\>

#### exists()

> **exists**(`entry`): `Promise`\<`boolean`\>

Defined in: [libraries/epub/adapters/interface.ts:65](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L65)

Whether the archive holds an entry under exactly this name.
Used to choose between different canditates for an href
so should be exact

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `entry`   | `string` |

##### Returns

`Promise`\<`boolean`\>

#### list()?

> `optional` **list**(): `AsyncIterable`\<[`EpubListEntry`](#epublistentry)\>

Defined in: [libraries/epub/adapters/interface.ts:81](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L81)

Required for Epub.saveAndClose to walk the contents

##### Returns

`AsyncIterable`\<[`EpubListEntry`](#epublistentry)\>

#### read()

##### Call Signature

> **read**(`entry`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [libraries/epub/adapters/interface.ts:57](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L57)

###### Parameters

| Parameter | Type     |
| --------- | -------- |
| `entry`   | `string` |

###### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

##### Call Signature

> **read**(`entry`, `encoding`): `Promise`\<`string`\>

Defined in: [libraries/epub/adapters/interface.ts:58](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L58)

###### Parameters

| Parameter  | Type      |
| ---------- | --------- |
| `entry`    | `string`  |
| `encoding` | `"utf-8"` |

###### Returns

`Promise`\<`string`\>

#### remove()?

> `optional` **remove**(`entry`): `Promise`\<`void`\>

Defined in: [libraries/epub/adapters/interface.ts:78](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L78)

Required for removeManifestItem / setCoverImage replacement

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `entry`   | `string` |

##### Returns

`Promise`\<`void`\>

#### serialize()?

> `optional` **serialize**(`targetPath`): `Promise`\<`void`\>

Defined in: [libraries/epub/adapters/interface.ts:87](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L87)

Required for Epub.saveAndClose

##### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `targetPath` | `string` |

##### Returns

`Promise`\<`void`\>

#### write()?

##### Call Signature

> `optional` **write**(`entry`, `data`): `Promise`\<`void`\>

Defined in: [libraries/epub/adapters/interface.ts:74](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L74)

Required for any mutation method on Epub

###### Parameters

| Parameter | Type         |
| --------- | ------------ |
| `entry`   | `string`     |
| `data`    | `Uint8Array` |

###### Returns

`Promise`\<`void`\>

##### Call Signature

> `optional` **write**(`entry`, `data`, `encoding`): `Promise`\<`void`\>

Defined in: [libraries/epub/adapters/interface.ts:75](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L75)

###### Parameters

| Parameter  | Type      |
| ---------- | --------- |
| `entry`    | `string`  |
| `data`     | `string`  |
| `encoding` | `"utf-8"` |

###### Returns

`Promise`\<`void`\>

---

## EpubStorageAdapterClass\<Opts\>

Defined in: [libraries/epub/adapters/interface.ts:93](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L93)

### Type Parameters

| Type Parameter            | Default type |
| ------------------------- | ------------ |
| `Opts` _extends_ `object` | `object`     |

### Properties

#### capabilities

> `readonly` **capabilities**: [`EpubStorageCapabilities`](#epubstoragecapabilities)

Defined in: [libraries/epub/adapters/interface.ts:95](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L95)

#### kind

> `readonly` **kind**: [`EpubStorageKind`](#epubstoragekind)

Defined in: [libraries/epub/adapters/interface.ts:94](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L94)

### Methods

#### init()

> **init**(`source`, `opts?`): `Promise`\<[`EpubStorageAdapter`](#epubstorageadapter)\>

Defined in: [libraries/epub/adapters/interface.ts:101](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L101)

Open an archive from a path or buffer.
Will throw if the archive is not a valid EPUB 3

##### Parameters

| Parameter | Type                              |
| --------- | --------------------------------- |
| `source`  | [`ArchiveSource`](#archivesource) |
| `opts?`   | `Opts`                            |

##### Returns

`Promise`\<[`EpubStorageAdapter`](#epubstorageadapter)\>

#### initEmpty()?

> `optional` **initEmpty**(`opts?`): `Promise`\<[`EpubStorageAdapter`](#epubstorageadapter)\>

Defined in: [libraries/epub/adapters/interface.ts:107](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L107)

Initialize an empty extract root for [Epub.create](#create).
Only necessary for adapters that can write

##### Parameters

| Parameter | Type   |
| --------- | ------ |
| `opts?`   | `Opts` |

##### Returns

`Promise`\<[`EpubStorageAdapter`](#epubstorageadapter)\>

---

## EpubStorageCapabilities

Defined in: [libraries/epub/adapters/interface.ts:34](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L34)

### Properties

#### writable

> `readonly` **writable**: `boolean`

Defined in: [libraries/epub/adapters/interface.ts:36](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L36)

when false, the Epub class refuses every mutation method at runtime

---

## FromOptions

Defined in: [libraries/epub/index.ts:205](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L205)

### Properties

#### readonly?

> `optional` **readonly**: `boolean`

Defined in: [libraries/epub/index.ts:210](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L210)

when true, mutation methods throw [EpubReadOnlyError](#epubreadonlyerror) at runtime

##### Default

```ts
false;
```

---

## GuideItem

Defined in: [libraries/epub/index.ts:197](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L197)

### Properties

#### href

> **href**: `string`

Defined in: [libraries/epub/index.ts:198](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L198)

#### title

> **title**: `string`

Defined in: [libraries/epub/index.ts:199](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L199)

#### type

> **type**: `string`

Defined in: [libraries/epub/index.ts:200](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L200)

---

## Landmark

Defined in: [libraries/epub/upgrade.ts:63](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/upgrade.ts#L63)

### Properties

#### href

> **href**: `string`

Defined in: [libraries/epub/upgrade.ts:64](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/upgrade.ts#L64)

#### title

> **title**: `string`

Defined in: [libraries/epub/upgrade.ts:65](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/upgrade.ts#L65)

#### type

> **type**: `string`

Defined in: [libraries/epub/upgrade.ts:66](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/upgrade.ts#L66)

---

## MemoryAdapterOptions

Defined in: [libraries/epub/adapters/memory.ts:13](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/memory.ts#L13)

### Properties

#### cache?

> `optional` **cache**: `boolean`

Defined in: [libraries/epub/adapters/memory.ts:20](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/memory.ts#L20)

per-entry decompressed buffer cache
turn it off when opening many EPUBs and reading each entry at most once
keeps resident size bounded by the entry index, not the decompressed payload sum

##### Default

```ts
true;
```

#### signal?

> `optional` **signal**: `AbortSignal`

Defined in: [libraries/epub/adapters/memory.ts:21](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/memory.ts#L21)

---

## Navigation

Defined in: [libraries/epub/index.ts:191](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L191)

### Properties

#### children

> **children**: [`NavigationList`](#navigationlist)

Defined in: [libraries/epub/index.ts:194](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L194)

#### role

> **role**: `string`

Defined in: [libraries/epub/index.ts:193](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L193)

#### title?

> `optional` **title**: `string`

Defined in: [libraries/epub/index.ts:192](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L192)

---

## NavigationItem

Defined in: [libraries/epub/index.ts:182](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L182)

### Properties

#### children?

> `optional` **children**: [`NavigationList`](#navigationlist)

Defined in: [libraries/epub/index.ts:186](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L186)

#### href?

> `optional` **href**: `string`

Defined in: [libraries/epub/index.ts:184](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L184)

#### role?

> `optional` **role**: `string`

Defined in: [libraries/epub/index.ts:185](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L185)

#### title

> **title**: `string`

Defined in: [libraries/epub/index.ts:183](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L183)

---

## AdapterOptions\<A\>

> **AdapterOptions**\<`A`\> = `A` _extends_ [`EpubStorageAdapterClass`](#epubstorageadapterclass)\<infer Opts\> ? `Opts` : `object`

Defined in: [libraries/epub/adapters/interface.ts:110](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L110)

### Type Parameters

| Type Parameter |
| -------------- |
| `A`            |

---

## ArchiveSource

> **ArchiveSource** = `string` \| `Uint8Array` \| `Blob`

Defined in: [libraries/epub/adapters/interface.ts:12](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L12)

---

## ElementName

> **ElementName** = \`$\{Letter \| Uppercase\<Letter\> \| QuestionMark\}$\{string\}\`

Defined in: [libraries/epub/index.ts:79](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L79)

A valid name for an XML element (must start with a letter)

---

## EpubInstanceFor\<A\>

> **EpubInstanceFor**\<`A`\> = `A`\[`"capabilities"`\]\[`"writable"`\] _extends_ `true` ? [`Epub`](#epub) : [`EpubReader`](#epubreader)

Defined in: [libraries/epub/index.ts:3623](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L3623)

Resolves to [Epub](#epub) for writable adapters, [EpubReader](#epubreader) for read-only ones.

The conditional pivots on `capabilities.writable`, which must be a literal
`true`/`false` on the adapter class (use `as const`) for inference to work.

### Type Parameters

| Type Parameter                                                      |
| ------------------------------------------------------------------- |
| `A` _extends_ [`EpubStorageAdapterClass`](#epubstorageadapterclass) |

---

## EpubMetadata

> **EpubMetadata** = [`MetadataEntry`](#metadataentry)[]

Defined in: [libraries/epub/index.ts:117](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L117)

---

## EpubReader

> **EpubReader** = `Pick`\<[`Epub`](#epub), `"storage"` \| `"findMetadataItem"` \| `"findAllMetadataItems"` \| `"resolveHref"` \| `"readFileContents"` \| `"readItemContents"` \| `"readXhtmlItemContents"` \| `"discardAndClose"` \| `Extract`\<keyof [`Epub`](#epub), `` `get${string}` ``\>\> & `Disposable`

Defined in: [libraries/epub/index.ts:217](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L217)

Read-only view of an EPUB
Returned by Epub.using(MemoryAdapter).from(...) and by Epub.from(path, { readonly: true })

---

## EpubStorageKind

> **EpubStorageKind** = `"tmp-dir"` \| `"in-memory"` \| `string` & `object`

Defined in: [libraries/epub/adapters/interface.ts:10](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/adapters/interface.ts#L10)

Pluggable storage backend for an Epub instance

Built-in adapters:

- [TmpFsAdapter](#tmpfsadapter) extracts the archive to a tmp directory and
  supports the full read/write/save/upgrade
- [MemoryAdapter](#memoryadapter) keeps an in-memory zip handle and supports
  reads only

---

## InMemoryEpubReader

> **InMemoryEpubReader** = [`EpubReader`](#epubreader) & `object`

Defined in: [libraries/epub/index.ts:235](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L235)

Readonly Epub-instance backed by an in-memory zip handle
Returned by `Epub.using(MemoryAdapter).from(...)`

### Type Declaration

#### storage

> `readonly` **storage**: `"in-memory"`

---

## ManifestItem

> **ManifestItem** = `object`

Defined in: [libraries/epub/index.ts:100](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L100)

### Properties

#### fallback?

> `optional` **fallback**: `string`

Defined in: [libraries/epub/index.ts:105](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L105)

#### href

> **href**: `string`

Defined in: [libraries/epub/index.ts:102](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L102)

#### id

> **id**: `string`

Defined in: [libraries/epub/index.ts:101](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L101)

#### mediaOverlay?

> `optional` **mediaOverlay**: `string`

Defined in: [libraries/epub/index.ts:106](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L106)

#### mediaType?

> `optional` **mediaType**: `string`

Defined in: [libraries/epub/index.ts:104](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L104)

#### properties?

> `optional` **properties**: `string`[]

Defined in: [libraries/epub/index.ts:107](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L107)

#### title?

> `optional` **title**: `string`

Defined in: [libraries/epub/index.ts:103](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L103)

---

## MetadataEntry

> **MetadataEntry** = `object`

Defined in: [libraries/epub/index.ts:110](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L110)

### Properties

#### id?

> `optional` **id**: `string`

Defined in: [libraries/epub/index.ts:111](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L111)

#### properties

> **properties**: `Record`\<`string`, `string`\>

Defined in: [libraries/epub/index.ts:113](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L113)

#### type

> **type**: [`ElementName`](#elementname)

Defined in: [libraries/epub/index.ts:112](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L112)

#### value

> **value**: `string` \| `undefined`

Defined in: [libraries/epub/index.ts:114](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L114)

---

## NavigationList

> **NavigationList** = [`NavigationItem`](#navigationitem)[]

Defined in: [libraries/epub/index.ts:189](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L189)

---

## PackageElement

> **PackageElement** = [`XmlElement`](#xmlelement)\<`"package"`\>

Defined in: [libraries/epub/index.ts:203](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L203)

---

## ParsedXml

> **ParsedXml** = [`XmlNode`](#xmlnode)[]

Defined in: [libraries/epub/index.ts:98](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L98)

An XML structure

---

## XmlElement\<Name\>

> **XmlElement**\<`Name`\> = `object` & `{ [key in Name]: ParsedXml }`

Defined in: [libraries/epub/index.ts:85](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L85)

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

Defined in: [libraries/epub/index.ts:95](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L95)

A valid XML node. May be either an element or a text node.

---

## XmlTextNode

> **XmlTextNode** = `object`

Defined in: [libraries/epub/index.ts:92](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L92)

A text node in an XML document

### Properties

#### #text

> **#text**: `string`

Defined in: [libraries/epub/index.ts:92](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/index.ts#L92)
