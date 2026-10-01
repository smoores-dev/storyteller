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

Defined in: [libraries/epub/src/index.tsx:352](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L352)

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
const h1 = findXmlChildByName("h1", body);
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

Defined in: [libraries/epub/src/index.tsx:393](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L393)

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

Defined in: [libraries/epub/src/index.tsx:395](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L395)

#### adapterClass

> `protected` **adapterClass**: [`EpubStorageAdapterClass`](#epubstorageadapterclass)

Defined in: [libraries/epub/src/index.tsx:394](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L394)

#### inputPath

> `protected` **inputPath**: `string` \| `undefined`

Defined in: [libraries/epub/src/index.tsx:396](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L396)

#### readonlyOverride

> `protected` **readonlyOverride**: `boolean` = `false`

Defined in: [libraries/epub/src/index.tsx:397](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L397)

#### storage

> `readonly` **storage**: [`EpubStorageKind`](#epubstoragekind)

Defined in: [libraries/epub/src/index.tsx:385](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L385)

Storage backend kind in use for this instance

Public so callers can declare type-level requirements via [InMemoryEpubReader](#inmemoryepubreader)
Orthogonal to the read-only / writable axis (controlled by `readonlyOverride`
and the adapter's capability bag)

### Methods

#### \[dispose\]()

> **\[dispose\]**(): `void`

Defined in: [libraries/epub/src/index.tsx:3317](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3317)

##### Returns

`void`

#### addCollection()

> **addCollection**(`collection`, `index?`): `Promise`\<`void`\>

Defined in: [libraries/epub/src/index.tsx:1942](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1942)

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

Defined in: [libraries/epub/src/index.tsx:2251](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2251)

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

Defined in: [libraries/epub/src/index.tsx:2116](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2116)

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

Defined in: [libraries/epub/src/index.tsx:2916](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2916)

Create a new manifest item and write its contents to a
new entry.

###### Parameters

| Parameter  | Type                            | Description                                                                                                                 |
| ---------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `item`     | [`ManifestItem`](#manifestitem) | -                                                                                                                           |
| `contents` | [`Document`](#document-1)       | The new contents. May be either a parsed XML tree or a unicode string, as determined by the `as` argument.                  |
| `encoding` | `"xml"`                         | Optional - whether to interpret contents as a parsed XML tree, a unicode string, or a byte array. Defaults to a byte array. |

###### Returns

`Promise`\<`void`\>

###### Link

https://www.w3.org/TR/epub-33/#sec-pkg-manifest

###### Link

https://www.w3.org/TR/epub-33/#sec-contentdocs

##### Call Signature

> **addManifestItem**(`item`, `contents`, `encoding`): `Promise`\<`void`\>

Defined in: [libraries/epub/src/index.tsx:2921](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2921)

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

Defined in: [libraries/epub/src/index.tsx:2926](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2926)

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

Defined in: [libraries/epub/src/index.tsx:3050](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3050)

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

Defined in: [libraries/epub/src/index.tsx:2317](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2317)

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

Defined in: [libraries/epub/src/index.tsx:1497](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1497)

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

Defined in: [libraries/epub/src/index.tsx:490](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L490)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `path?`   | `string` |

##### Returns

`Promise`\<[`Epub`](#epub)\>

#### createXhtmlDocument()

> **createXhtmlDocument**(`body`, `head?`, `language?`): `Promise`\<[`Document`](#document-1)\>

Defined in: [libraries/epub/src/index.tsx:2716](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2716)

Create a new XHTML document with the given body
and head.

##### Parameters

| Parameter   | Type                | Description                                        |
| ----------- | ------------------- | -------------------------------------------------- |
| `body`      | [`Node`](#node-1)[] | The XML nodes to place in the body of the document |
| `head?`     | [`Node`](#node-1)[] | Optional - the XMl nodes to place in the head      |
| `language?` | `Locale`            | Optional - defaults to the EPUB's language         |

##### Returns

`Promise`\<[`Document`](#document-1)\>

#### createXmlDocument()

> **createXmlDocument**(`root`): [`Document`](#document-1)

Defined in: [libraries/epub/src/index.tsx:2680](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2680)

Create a new XML document with the given root node.

##### Parameters

| Parameter | Type                    | Description                                 |
| --------- | ----------------------- | ------------------------------------------- |
| `root`    | [`Element`](#element-1) | The XML node to use as the document element |

##### Returns

[`Document`](#document-1)

#### discardAndClose()

> **discardAndClose**(): `void`

Defined in: [libraries/epub/src/index.tsx:3267](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3267)

##### Returns

`void`

#### findAllMetadataItems()

> **findAllMetadataItems**(`predicate`): `Promise`\<[`MetadataEntry`](#metadataentry)[]\>

Defined in: [libraries/epub/src/index.tsx:744](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L744)

Returns the item in the metadata element's children array
that matches the provided predicate.

##### Parameters

| Parameter   | Type                   |
| ----------- | ---------------------- |
| `predicate` | (`entry`) => `boolean` |

##### Returns

`Promise`\<[`MetadataEntry`](#metadataentry)[]\>

#### findMetadataItem()

> **findMetadataItem**(`predicate`): `Promise`\<[`MetadataEntry`](#metadataentry) \| `null`\>

Defined in: [libraries/epub/src/index.tsx:735](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L735)

Returns the item in the metadata element's children array
that matches the provided predicate.

##### Parameters

| Parameter   | Type                   |
| ----------- | ---------------------- |
| `predicate` | (`entry`) => `boolean` |

##### Returns

`Promise`\<[`MetadataEntry`](#metadataentry) \| `null`\>

#### getBaseDirection()

> **getBaseDirection**(): `Promise`\<`"auto"` \| `"rtl"` \| `"ltr"`\>

Defined in: [libraries/epub/src/index.tsx:1451](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1451)

Retrieve the base direction from the package element.

If there is no `dir` attribute on the package element,
returns 'auto'.

##### Returns

`Promise`\<`"auto"` \| `"rtl"` \| `"ltr"`\>

##### Link

https://www.w3.org/TR/epub-33/#attrdef-dir

#### getCollections()

> **getCollections**(): `Promise`\<[`Collection`](#collection)[]\>

Defined in: [libraries/epub/src/index.tsx:1902](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1902)

Retrieve the list of collections.

##### Returns

`Promise`\<[`Collection`](#collection)[]\>

#### getContributors()

> **getContributors**(): `Promise`\<[`DcCreator`](#dccreator)[]\>

Defined in: [libraries/epub/src/index.tsx:2103](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2103)

Retrieve the list of contributors.

This is a convenience method for
`epub.getCreators('contributor')`.

##### Returns

`Promise`\<[`DcCreator`](#dccreator)[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dccontributor

#### getCoverImage()

> **getCoverImage**(): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\> \| `null`\>

Defined in: [libraries/epub/src/index.tsx:1347](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1347)

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

Defined in: [libraries/epub/src/index.tsx:1328](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1328)

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

Defined in: [libraries/epub/src/index.tsx:2039](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2039)

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

Defined in: [libraries/epub/src/index.tsx:1770](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1770)

Retrieve the Epub's description as specified in its
package document metadata.

If no description metadata is specified, returns null.
Returns the description as a string. Descriptions may
include HTML markup.

##### Returns

`Promise`\<`string` \| `null`\>

#### getGuideEntries()

> **getGuideEntries**(): `Promise`\<[`GuideItem`](#guideitem)[]\>

Defined in: [libraries/epub/src/index.tsx:3250](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3250)

Retrieve the guide entries from the package document.

The guide element is deprecated in EPUB 3 in favor of
the landmarks nav, but many publications still include it.

##### Returns

`Promise`\<[`GuideItem`](#guideitem)[]\>

#### ~~getIdentifier()~~

> **getIdentifier**(): `Promise`\<`string` \| `null`\>

Defined in: [libraries/epub/src/index.tsx:836](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L836)

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

Defined in: [libraries/epub/src/index.tsx:1002](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1002)

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

Defined in: [libraries/epub/src/index.tsx:516](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L516)

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

Defined in: [libraries/epub/src/index.tsx:2502](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2502)

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

Defined in: [libraries/epub/src/index.tsx:1607](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1607)

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

Defined in: [libraries/epub/src/index.tsx:1432](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1432)

Retrieve the layout from the rendition:layout meta element
in the EPUB metadata.

If there is no meta element, returns 'reflowable'.

##### Returns

`Promise`\<`"pre-paginated"` \| `"reflowable"`\>

##### Link

https://www.w3.org/TR/epub-33/#layout

#### getManifest()

> **getManifest**(): `Promise`\<`Record`\<`string`, [`ManifestItem`](#manifestitem)\>\>

Defined in: [libraries/epub/src/index.tsx:662](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L662)

Retrieve the manifest for the Epub.

This is represented as a map from each manifest items'
id to the rest of its properties.

##### Returns

`Promise`\<`Record`\<`string`, [`ManifestItem`](#manifestitem)\>\>

##### Link

https://www.w3.org/TR/epub-33/#sec-pkg-manifest

#### getMetadata()

> **getMetadata**(): `Promise`\<[`EpubMetadata`](#epubmetadata)\>

Defined in: [libraries/epub/src/index.tsx:804](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L804)

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

Defined in: [libraries/epub/src/index.tsx:1415](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1415)

Retrieve the modified date from the dcterms:modified metadata
in the EPUB metadata as a Date object.

If there is no meta element with dcterms:modified, returns null.

##### Returns

`Promise`\<`Date` \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-metadata-last-modified

#### getNcxTableOfContents()

> **getNcxTableOfContents**(): `Promise`\<[`NavigationList`](#navigationlist)\>

Defined in: [libraries/epub/src/index.tsx:3174](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3174)

Parse the NCX table of contents, if one exists, and return
a tree of TocEntry nodes.

Useful for both EPUB 2 publications (where the NCX is the
primary navigation) and EPUB 3 publications that retain an
NCX for backwards compatibility.

##### Returns

`Promise`\<[`NavigationList`](#navigationlist)\>

#### getPackageDocumentSource()

> **getPackageDocumentSource**(): `Promise`\<`string`\>

Defined in: [libraries/epub/src/index.tsx:570](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L570)

##### Returns

`Promise`\<`string`\>

#### getPackageElement()

> **getPackageElement**(): `Promise`\<[`Element`](#element-1)\>

Defined in: [libraries/epub/src/index.tsx:593](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L593)

##### Returns

`Promise`\<[`Element`](#element-1)\>

#### getPackageVocabularyPrefixes()

> **getPackageVocabularyPrefixes**(): `Promise`\<`Record`\<`string`, `string`\>\>

Defined in: [libraries/epub/src/index.tsx:1787](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1787)

Return the set of custom vocabulary prefixes set on this publication's
root package element.

Returns a map from prefix to URI

##### Returns

`Promise`\<`Record`\<`string`, `string`\>\>

##### Link

https://www.w3.org/TR/epub-33/#sec-prefix-attr

#### getPageBreakSource()

> **getPageBreakSource**(): `Promise`\<[`EpubSource`](#epubsource) \| `null`\>

Defined in: [libraries/epub/src/index.tsx:1039](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1039)

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

Defined in: [libraries/epub/src/index.tsx:2514](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2514)

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

Defined in: [libraries/epub/src/index.tsx:1384](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1384)

Retrieve the publication date from the dc:date element
in the EPUB metadata as a Date object.

If there is no dc:date element, returns null.

##### Returns

`Promise`\<`Date` \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcdate

#### getRootfile()

> **getRootfile**(): `Promise`\<`string`\>

Defined in: [libraries/epub/src/index.tsx:527](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L527)

##### Returns

`Promise`\<`string`\>

#### getSources()

> **getSources**(): `Promise`\<[`EpubSource`](#epubsource)[]\>

Defined in: [libraries/epub/src/index.tsx:1016](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1016)

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

Defined in: [libraries/epub/src/index.tsx:2290](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2290)

Retrieve the manifest items that make up the Epub's spine.

The spine specifies the order that the contents of the Epub
should be displayed to users by default.

##### Returns

`Promise`\<[`ManifestItem`](#manifestitem) & `object`[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-spine-elem

#### getSubjects()

> **getSubjects**(): `Promise`\<(`string` \| [`DcSubject`](#dcsubject))[]\>

Defined in: [libraries/epub/src/index.tsx:1562](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1562)

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

Defined in: [libraries/epub/src/index.tsx:1677](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1677)

Retrieve the subtitle of the Epub, if it exists.

##### Returns

`Promise`\<`string` \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

#### getTableOfContents()

> **getTableOfContents**(`__namedParameters`): `Promise`\<[`Navigation`](#navigation) \| `null`\>

Defined in: [libraries/epub/src/index.tsx:2484](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2484)

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

Defined in: [libraries/epub/src/index.tsx:1653](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1653)

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

Defined in: [libraries/epub/src/index.tsx:1689](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1689)

Retrieve all title entries of the Epub.

##### Returns

`Promise`\<`object`[]\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctitle

#### getType()

> **getType**(): `Promise`\<[`MetadataEntry`](#metadataentry) \| `null`\>

Defined in: [libraries/epub/src/index.tsx:1484](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1484)

Retrieve the publication type from the dc:type element
in the EPUB metadata.

If there is no dc:type element, returns null.

##### Returns

`Promise`\<[`MetadataEntry`](#metadataentry) \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dctype

#### getUniqueIdentifier()

> **getUniqueIdentifier**(): `Promise`\<`string` \| `null`\>

Defined in: [libraries/epub/src/index.tsx:868](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L868)

Retrieve the identifier with the unique identifier id
in the EPUB metadata.

If there is no unique identifier id, returns the first dc:identifier element.

##### Returns

`Promise`\<`string` \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier

#### getUniqueIdentifierId()

> **getUniqueIdentifierId**(): `Promise`\<`string` \| `null`\>

Defined in: [libraries/epub/src/index.tsx:940](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L940)

Retrieve the id of the publication's unique identifier, as declared by the
package element's `unique-identifier` attribute.

##### Returns

`Promise`\<`string` \| `null`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier

#### getVersion()

> **getVersion**(): `Promise`\<`string`\>

Defined in: [libraries/epub/src/index.tsx:3161](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3161)

Returns the EPUB version declared on the package element.

##### Returns

`Promise`\<`string`\>

#### readFileContents()

##### Call Signature

> **readFileContents**(`href`, `relativeTo?`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [libraries/epub/src/index.tsx:2621](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2621)

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

Defined in: [libraries/epub/src/index.tsx:2622](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2622)

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

Defined in: [libraries/epub/src/index.tsx:2654](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2654)

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

Defined in: [libraries/epub/src/index.tsx:2655](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2655)

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

> **readXhtmlItemContents**(`id`, `as?`): `Promise`\<[`Document`](#document-1)\>

Defined in: [libraries/epub/src/index.tsx:2766](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2766)

Retrieves the contents of an XHTML item, given its manifest id.

###### Parameters

| Parameter | Type      | Description                                                                                                                           |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | `string`  | The id of the manifest item to retrieve                                                                                               |
| `as?`     | `"xhtml"` | Optional - whether to return the parsed XML document tree, or the concatenated text of the document. Defaults to the parsed XML tree. |

###### Returns

`Promise`\<[`Document`](#document-1)\>

###### Link

https://www.w3.org/TR/epub-33/#sec-xhtml

##### Call Signature

> **readXhtmlItemContents**(`id`, `as`): `Promise`\<`string`\>

Defined in: [libraries/epub/src/index.tsx:2767](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2767)

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

Defined in: [libraries/epub/src/index.tsx:2006](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2006)

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

Defined in: [libraries/epub/src/index.tsx:2235](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2235)

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

Defined in: [libraries/epub/src/index.tsx:2198](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2198)

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

Defined in: [libraries/epub/src/index.tsx:2866](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2866)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

##### Returns

`Promise`\<`void`\>

#### removeMetadata()

> **removeMetadata**(`predicate`): `Promise`\<`void`\>

Defined in: [libraries/epub/src/index.tsx:3136](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3136)

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

Defined in: [libraries/epub/src/index.tsx:2363](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2363)

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

Defined in: [libraries/epub/src/index.tsx:1534](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1534)

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

Defined in: [libraries/epub/src/index.tsx:3085](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3085)

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

Defined in: [libraries/epub/src/index.tsx:2577](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2577)

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

Defined in: [libraries/epub/src/index.tsx:3282](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3282)

Write the current contents of the Epub to a new
EPUB archive on disk.

When this method is called, the "dcterms:modified"
meta tag is automatically updated to the current UTC
timestamp.

##### Returns

`Promise`\<`void`\>

#### setCoverImage()

> **setCoverImage**(`href`, `data`): `Promise`\<`void`\>

Defined in: [libraries/epub/src/index.tsx:1361](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1361)

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

Defined in: [libraries/epub/src/index.tsx:1754](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1754)

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

Defined in: [libraries/epub/src/index.tsx:852](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L852)

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

Defined in: [libraries/epub/src/index.tsx:1108](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1108)

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

Defined in: [libraries/epub/src/index.tsx:1636](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1636)

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

Defined in: [libraries/epub/src/index.tsx:1805](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1805)

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

Defined in: [libraries/epub/src/index.tsx:1075](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1075)

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

Defined in: [libraries/epub/src/index.tsx:1399](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1399)

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

Defined in: [libraries/epub/src/index.tsx:1213](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1213)

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

Defined in: [libraries/epub/src/index.tsx:1831](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1831)

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

Defined in: [libraries/epub/src/index.tsx:1853](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1853)

##### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `entries` | `object`[] |

##### Returns

`Promise`\<`void`\>

#### setType()

> **setType**(`type`): `Promise`\<`void`\>

Defined in: [libraries/epub/src/index.tsx:1468](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L1468)

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

Defined in: [libraries/epub/src/index.tsx:893](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L893)

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

Defined in: [libraries/epub/src/index.tsx:3002](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3002)

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

Defined in: [libraries/epub/src/index.tsx:622](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L622)

Safely modify the package document, without race conditions.

Since the reading the package document is an async process,
multiple simultaneously dispatched function calls that all
attempt to modify it can clobber each other's changes. This
method uses a mutex to ensure that each update runs exclusively.

##### Parameters

| Parameter  | Type                                                                                                                                                                                     | Description                                                                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `producer` | (`packageElement`) => `void` \| (`packageElement`) => [`Element`](#element-1) \| (`packageElement`) => `Promise`\<[`Element`](#element-1)\> \| (`packageElement`) => `Promise`\<`void`\> | The function to update the package document. If it returns a new package document, that will be persisted, otherwise it will be assumed that the package document was modified in place. |

##### Returns

`Promise`\<`void`\>

#### writeItemContents()

##### Call Signature

> **writeItemContents**(`id`, `contents`): `Promise`\<`void`\>

Defined in: [libraries/epub/src/index.tsx:2822](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2822)

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

Defined in: [libraries/epub/src/index.tsx:2823](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2823)

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

Defined in: [libraries/epub/src/index.tsx:2862](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L2862)

Write new contents for an existing XHTML item,
specified by its id.

The id must reference an existing manifest item. If
creating a new item, use `epub.addManifestItem()` instead.

##### Parameters

| Parameter  | Type                      | Description                                           |
| ---------- | ------------------------- | ----------------------------------------------------- |
| `id`       | `string`                  | The id of the manifest item to write new contents for |
| `contents` | [`Document`](#document-1) | The new contents. Must be a parsed XML tree.          |

##### Returns

`Promise`\<`void`\>

##### Link

https://www.w3.org/TR/epub-33/#sec-xhtml

#### assertEpub3()

> `static` **assertEpub3**(`epub`): `Promise`\<`void`\>

Defined in: [libraries/epub/src/index.tsx:480](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L480)

##### Parameters

| Parameter | Type            |
| --------- | --------------- |
| `epub`    | [`Epub`](#epub) |

##### Returns

`Promise`\<`void`\>

#### create()

> `static` **create**(`path`, `dublinCore`, `additionalMetadata`): `Promise`\<[`Epub`](#epub)\>

Defined in: [libraries/epub/src/index.tsx:428](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L428)

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

#### formatSmilDuration()

> `static` **formatSmilDuration**(`duration`): `string`

Defined in: [libraries/epub/src/index.tsx:359](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L359)

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

Defined in: [libraries/epub/src/index.tsx:464](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L464)

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

Defined in: [libraries/epub/src/index.tsx:465](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L465)

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

Defined in: [libraries/epub/src/index.tsx:469](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L469)

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

#### upgrade()

> `static` **upgrade**(`path`, `options`): `Promise`\<[`Epub`](#epub)\>

Defined in: [libraries/epub/src/index.tsx:3310](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3310)

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

Defined in: [libraries/epub/src/index.tsx:448](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L448)

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

Defined in: [libraries/epub/src/index.tsx:3339](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3339)

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

Defined in: [libraries/epub/src/index.tsx:3340](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3340)

##### Parameters

| Parameter      | Type |
| -------------- | ---- |
| `adapterClass` | `A`  |

##### Returns

[`EpubFactory`](#epubfactory)\<`A`\>

### Properties

#### adapterClass

> `readonly` **adapterClass**: `A`

Defined in: [libraries/epub/src/index.tsx:3340](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3340)

### Methods

#### create()

> **create**(`path`, `__namedParameters`, `additionalMetadata`): `Promise`\<[`EpubInstanceFor`](#epubinstancefor)\<`A`\>\>

Defined in: [libraries/epub/src/index.tsx:3420](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3420)

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

Defined in: [libraries/epub/src/index.tsx:3347](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3347)

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

Defined in: [libraries/epub/src/index.tsx:3351](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3351)

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

Defined in: [libraries/epub/src/index.tsx:3394](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3394)

##### Parameters

| Parameter | Type                                       |
| --------- | ------------------------------------------ |
| `source`  | [`ArchiveSource`](#archivesource)          |
| `options` | [`AdapterOptions`](#adapteroptions)\<`A`\> |

##### Returns

`Promise`\<`string`\>

#### upgrade()

> **upgrade**(`path`, `options`): `Promise`\<[`EpubInstanceFor`](#epubinstancefor)\<`A`\>\>

Defined in: [libraries/epub/src/index.tsx:3547](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3547)

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

Defined in: [libraries/epub/src/index.tsx:243](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L243)

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

Defined in: [libraries/epub/src/index.tsx:242](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L242)

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

Defined in: [libraries/epub/src/adapters/memory.ts:30](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/memory.ts#L30)

Loads an EPUB archive into memory and serves all I/O off the in-memory zip handle.

read only

### Implements

- [`EpubStorageAdapter`](#epubstorageadapter)

### Properties

#### capabilities

> `readonly` `static` **capabilities**: `object`

Defined in: [libraries/epub/src/adapters/memory.ts:32](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/memory.ts#L32)

##### writable

> `readonly` **writable**: `false` = `false`

#### kind

> `readonly` `static` **kind**: `"in-memory"`

Defined in: [libraries/epub/src/adapters/memory.ts:31](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/memory.ts#L31)

### Methods

#### archiveLength()

> **archiveLength**(`entry`): `Promise`\<`number`\>

Defined in: [libraries/epub/src/adapters/memory.ts:85](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/memory.ts#L85)

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

Defined in: [libraries/epub/src/adapters/memory.ts:91](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/memory.ts#L91)

Always called on close or error

##### Returns

`void`

##### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`dispose`](#dispose-6)

#### exists()

> **exists**(`entry`): `Promise`\<`boolean`\>

Defined in: [libraries/epub/src/adapters/memory.ts:80](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/memory.ts#L80)

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

Defined in: [libraries/epub/src/adapters/memory.ts:60](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/memory.ts#L60)

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

Defined in: [libraries/epub/src/adapters/memory.ts:61](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/memory.ts#L61)

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

Defined in: [libraries/epub/src/adapters/memory.ts:34](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/memory.ts#L34)

##### Parameters

| Parameter | Type                                            |
| --------- | ----------------------------------------------- |
| `source`  | [`ArchiveSource`](#archivesource)               |
| `opts`    | [`MemoryAdapterOptions`](#memoryadapteroptions) |

##### Returns

`Promise`\<[`MemoryAdapter`](#memoryadapter)\>

---

## TmpFsAdapter

Defined in: [libraries/epub/src/adapters/tmpfs.ts:57](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L57)

Extracts an EPUB archive to a temp directory and serves all I/O off
the real filesystem.
`Epub.using(TmpFsAdapter).from(...)` returns a writable [Epub](#epub).

### Implements

- [`EpubStorageAdapter`](#epubstorageadapter)

### Properties

#### capabilities

> `readonly` `static` **capabilities**: `object`

Defined in: [libraries/epub/src/adapters/tmpfs.ts:59](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L59)

##### writable

> `readonly` **writable**: `true` = `true`

#### kind

> `readonly` `static` **kind**: `"extracted-dir"`

Defined in: [libraries/epub/src/adapters/tmpfs.ts:58](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L58)

### Methods

#### archiveLength()

> **archiveLength**(`entry`): `Promise`\<`number`\>

Defined in: [libraries/epub/src/adapters/tmpfs.ts:127](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L127)

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

Defined in: [libraries/epub/src/adapters/tmpfs.ts:204](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L204)

Always called on close or error

##### Returns

`void`

##### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`dispose`](#dispose-6)

#### duplicate()

> **duplicate**(): `Promise`\<[`TmpFsAdapter`](#tmpfsadapter)\>

Defined in: [libraries/epub/src/adapters/tmpfs.ts:154](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L154)

Required for Epub.copy

##### Returns

`Promise`\<[`TmpFsAdapter`](#tmpfsadapter)\>

##### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`duplicate`](#duplicate-2)

#### exists()

> **exists**(`entry`): `Promise`\<`boolean`\>

Defined in: [libraries/epub/src/adapters/tmpfs.ts:118](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L118)

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

Defined in: [libraries/epub/src/adapters/tmpfs.ts:136](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L136)

Required for Epub.saveAndClose to walk the contents

##### Returns

`AsyncIterable`\<[`EpubListEntry`](#epublistentry)\>

##### Implementation of

[`EpubStorageAdapter`](#epubstorageadapter).[`list`](#list-2)

#### read()

##### Call Signature

> **read**(`entry`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [libraries/epub/src/adapters/tmpfs.ts:96](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L96)

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

Defined in: [libraries/epub/src/adapters/tmpfs.ts:97](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L97)

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

Defined in: [libraries/epub/src/adapters/tmpfs.ts:114](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L114)

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

Defined in: [libraries/epub/src/adapters/tmpfs.ts:165](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L165)

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

Defined in: [libraries/epub/src/adapters/tmpfs.ts:102](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L102)

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

Defined in: [libraries/epub/src/adapters/tmpfs.ts:103](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L103)

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

Defined in: [libraries/epub/src/adapters/tmpfs.ts:61](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L61)

##### Parameters

| Parameter | Type                              |
| --------- | --------------------------------- |
| `source`  | [`ArchiveSource`](#archivesource) |

##### Returns

`Promise`\<[`TmpFsAdapter`](#tmpfsadapter)\>

#### initEmpty()

> `static` **initEmpty**(): `Promise`\<[`TmpFsAdapter`](#tmpfsadapter)\>

Defined in: [libraries/epub/src/adapters/tmpfs.ts:79](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/tmpfs.ts#L79)

##### Returns

`Promise`\<[`TmpFsAdapter`](#tmpfsadapter)\>

---

## AlternateScript

Defined in: [libraries/epub/src/index.tsx:159](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L159)

### Properties

#### locale

> **locale**: `Locale`

Defined in: [libraries/epub/src/index.tsx:161](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L161)

#### name

> **name**: `string`

Defined in: [libraries/epub/src/index.tsx:160](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L160)

---

## Attr

Defined in: node_modules/@xmldom/xmldom/index.d.ts:664

A DOM element's attribute as an object. In most DOM methods, you will probably directly
retrieve the attribute as a string (e.g., Element.getAttribute(), but certain functions (e.g.,
Element.getAttributeNode()) or means of iterating give Attr types.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Attr)

### Extends

- [`Node`](#node-1)

### Properties

#### ATTRIBUTE_NODE

> `readonly` **ATTRIBUTE_NODE**: `2`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:592

##### Inherited from

`Node.ATTRIBUTE_NODE`

#### baseURI

> `readonly` **baseURI**: `"about:blank"`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:396

Always returns `about:blank` currently.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/baseURI)

##### Inherited from

`Node.baseURI`

#### CDATA_SECTION_NODE

> `readonly` **CDATA_SECTION_NODE**: `4`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:596

node is a CDATASection node.

##### Inherited from

`Node.CDATA_SECTION_NODE`

#### childNodes

> `readonly` **childNodes**: `NodeList`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:374

Returns the children.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/childNodes)

##### Inherited from

`Node.childNodes`

#### columnNumber?

> `optional` **columnNumber**: `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:479

One based column position inside the parsed source,
if the `locator` was not disabled.

##### Inherited from

`Node.columnNumber`

#### COMMENT_NODE

> `readonly` **COMMENT_NODE**: `8`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:602

node is a Comment node.

##### Inherited from

`Node.COMMENT_NODE`

#### DOCUMENT_FRAGMENT_NODE

> `readonly` **DOCUMENT_FRAGMENT_NODE**: `11`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:608

node is a DocumentFragment node.

##### Inherited from

`Node.DOCUMENT_FRAGMENT_NODE`

#### DOCUMENT_NODE

> `readonly` **DOCUMENT_NODE**: `9`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:604

node is a document.

##### Inherited from

`Node.DOCUMENT_NODE`

#### DOCUMENT_POSITION_CONTAINED_BY

> `readonly` **DOCUMENT_POSITION_CONTAINED_BY**: `16`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:619

Set when other is a descendant of node.

##### Inherited from

`Node.DOCUMENT_POSITION_CONTAINED_BY`

#### DOCUMENT_POSITION_CONTAINS

> `readonly` **DOCUMENT_POSITION_CONTAINS**: `8`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:617

Set when other is an ancestor of node.

##### Inherited from

`Node.DOCUMENT_POSITION_CONTAINS`

#### DOCUMENT_POSITION_DISCONNECTED

> `readonly` **DOCUMENT_POSITION_DISCONNECTED**: `1`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:611

Set when node and other are not in the same tree.

##### Inherited from

`Node.DOCUMENT_POSITION_DISCONNECTED`

#### DOCUMENT_POSITION_FOLLOWING

> `readonly` **DOCUMENT_POSITION_FOLLOWING**: `4`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:615

Set when other is following node.

##### Inherited from

`Node.DOCUMENT_POSITION_FOLLOWING`

#### DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC

> `readonly` **DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC**: `32`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:620

##### Inherited from

`Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC`

#### DOCUMENT_POSITION_PRECEDING

> `readonly` **DOCUMENT_POSITION_PRECEDING**: `2`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:613

Set when other is preceding node.

##### Inherited from

`Node.DOCUMENT_POSITION_PRECEDING`

#### DOCUMENT_TYPE_NODE

> `readonly` **DOCUMENT_TYPE_NODE**: `10`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:606

node is a doctype.

##### Inherited from

`Node.DOCUMENT_TYPE_NODE`

#### ELEMENT_NODE

> `readonly` **ELEMENT_NODE**: `1`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:591

node is an element.

##### Inherited from

`Node.ELEMENT_NODE`

#### ENTITY_NODE

> `readonly` **ENTITY_NODE**: `6`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:598

##### Inherited from

`Node.ENTITY_NODE`

#### ENTITY_REFERENCE_NODE

> `readonly` **ENTITY_REFERENCE_NODE**: `5`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:597

##### Inherited from

`Node.ENTITY_REFERENCE_NODE`

#### firstChild

> `readonly` **firstChild**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:380

Returns the first child.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/firstChild)

##### Inherited from

`Node.firstChild`

#### isConnected

> `readonly` **isConnected**: `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:402

Returns true if this node is inside of a document or is the document node itself.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/isConnected)

##### Inherited from

`Node.isConnected`

#### lastChild

> `readonly` **lastChild**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:386

Returns the last child.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lastChild)

##### Inherited from

`Node.lastChild`

#### lineNumber?

> `optional` **lineNumber**: `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:474

Zero based line position inside the parsed source,
if the `locator` was not disabled.

##### Inherited from

`Node.lineNumber`

#### localName

> **localName**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:390

The local part of the qualified name of this node.

##### Inherited from

`Node.localName`

#### name

> `readonly` **name**: `string`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:667

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Attr/name)

#### namespaceURI

> `readonly` **namespaceURI**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:669

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Attr/namespaceURI)

##### Overrides

`Node.namespaceURI`

#### nextSibling

> `readonly` **nextSibling**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:412

Returns the next sibling.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nextSibling)

##### Inherited from

`Node.nextSibling`

#### nodeName

> `readonly` **nodeName**: `string`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:418

Returns a string appropriate for the type of node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeName)

##### Inherited from

`Node.nodeName`

#### nodeType

> `readonly` **nodeType**: `2`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:665

Returns the type of node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeType)

##### Overrides

`Node.nodeType`

#### nodeValue

> **nodeValue**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:426

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeValue)

##### Inherited from

`Node.nodeValue`

#### NOTATION_NODE

> `readonly` **NOTATION_NODE**: `12`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:609

##### Inherited from

`Node.NOTATION_NODE`

#### ownerDocument

> `readonly` **ownerDocument**: [`Document`](#document-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:670

Returns the node document. Returns null for documents.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/ownerDocument)

##### Overrides

`Node.ownerDocument`

#### ownerElement

> `readonly` **ownerElement**: [`Element`](#element-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:672

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Attr/ownerElement)

#### parentElement

> `readonly` **parentElement**: [`Element`](#element-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:444

Returns the parent `Node` if it is of type `Element`, otherwise `null`.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/parentElement)

##### Inherited from

`Node.parentElement`

#### parentNode

> `readonly` **parentNode**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:438

Returns the parent.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/parentNode)

##### Inherited from

`Node.parentNode`

#### prefix

> `readonly` **prefix**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:674

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Attr/prefix)

##### Overrides

`Node.prefix`

#### previousSibling

> `readonly` **previousSibling**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:454

Returns the previous sibling.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/previousSibling)

##### Inherited from

`Node.previousSibling`

#### PROCESSING_INSTRUCTION_NODE

> `readonly` **PROCESSING_INSTRUCTION_NODE**: `7`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:600

node is a ProcessingInstruction node.

##### Inherited from

`Node.PROCESSING_INSTRUCTION_NODE`

#### ~~specified~~

> `readonly` **specified**: `true`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:679

##### Deprecated

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Attr/specified)

#### TEXT_NODE

> `readonly` **TEXT_NODE**: `3`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:594

node is a Text node.

##### Inherited from

`Node.TEXT_NODE`

#### textContent

> **textContent**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:468

The text content of this node and its descendants.

For [Element](#element-1) and DocumentFragment nodes, returns the concatenation of the
`nodeValue` of every descendant text node, excluding processing instruction and comment
nodes. For all other node types, returns `nodeValue`.

Setting `textContent` on an element or document fragment replaces all child nodes with a
single text node; on other nodes it sets `data`, `value`, and `nodeValue` directly.
[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/textContent)

##### See

[https://dom.spec.whatwg.org/#dom-node-textcontent](https://dom.spec.whatwg.org/#dom-node-textcontent)

##### Inherited from

`Node.textContent`

#### value

> **value**: `string`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:681

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Attr/value)

### Methods

#### appendChild()

> **appendChild**(`node`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:482

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/appendChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `node`    | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.appendChild`

#### cloneNode()

> **cloneNode**(`deep?`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:533

Returns a copy of node. If deep is true, the copy also includes the node's descendants.

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `deep?`   | `boolean` |

##### Returns

[`Node`](#node-1)

##### Throws

May throw a DOMException if operations within [Element#setAttributeNode](#setattributenode) or
[Node#appendChild](#appendchild-8) (which are potentially invoked in this method) do not meet their
specific constraints.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/cloneNode)

##### Inherited from

`Node.cloneNode`

#### compareDocumentPosition()

> **compareDocumentPosition**(`other`): `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:540

Returns a bitmask indicating the position of other relative to node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/compareDocumentPosition)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`number`

##### Inherited from

`Node.compareDocumentPosition`

#### contains()

> **contains**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:489

Checks whether `other` is an inclusive descendant of this node.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/contains)

##### Parameters

| Parameter | Type                                       |
| --------- | ------------------------------------------ |
| `other`   | [`Node`](#node-1) \| `null` \| `undefined` |

##### Returns

`boolean`

##### Inherited from

`Node.contains`

#### getRootNode()

> **getRootNode**(`options`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:502

Searches for the root node of this node.

**This behavior is slightly different from the one in the specs**:

- ignores `options.composed`, since `ShadowRoot`s are unsupported, therefore always
  returning root.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/getRootNode)

##### Parameters

| Parameter | Type                 |
| --------- | -------------------- |
| `options` | `GetRootNodeOptions` |

##### Returns

[`Node`](#node-1)

##### See

- https://dom.spec.whatwg.org/#dom-node-getrootnode
- https://dom.spec.whatwg.org/#concept-shadow-including-root

##### Inherited from

`Node.getRootNode`

#### hasChildNodes()

> **hasChildNodes**(): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:547

Returns whether node has children.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/hasChildNodes)

##### Returns

`boolean`

##### Inherited from

`Node.hasChildNodes`

#### insertBefore()

> **insertBefore**(`node`, `child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:550

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/insertBefore)

##### Parameters

| Parameter | Type                        |
| --------- | --------------------------- |
| `node`    | [`Node`](#node-1)           |
| `child`   | [`Node`](#node-1) \| `null` |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.insertBefore`

#### isDefaultNamespace()

> **isDefaultNamespace**(`namespace`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:553

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/isDefaultNamespace)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |

##### Returns

`boolean`

##### Inherited from

`Node.isDefaultNamespace`

#### isEqualNode()

> **isEqualNode**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:514

Checks whether the given node is equal to this node.

Two nodes are equal when they have the same type, defining characteristics (for the type),
and the same `childNodes`. The comparison is iterative to avoid stack overflows on deeply
nested trees. `Attribute` nodes of each `Element` pair are also compared iteratively.

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`boolean`

##### See

- [https://dom.spec.whatwg.org/#concept-node-equals](https://dom.spec.whatwg.org/#concept-node-equals)
- [https://developer.mozilla.org/en-US/docs/Web/API/Node/isEqualNode](https://developer.mozilla.org/en-US/docs/Web/API/Node/isEqualNode)

##### Inherited from

`Node.isEqualNode`

#### isSameNode()

> **isSameNode**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:521

Checks whether the given node is this node.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/isSameNode)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`boolean`

##### Inherited from

`Node.isSameNode`

#### ~~isSupported()~~

> **isSupported**(`feature`, `version`): `true`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:568

Checks whether the DOM implementation implements a specific feature and its version.

##### Parameters

| Parameter | Type     | Description                                                                                                                          |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `feature` | `string` | The package name of the feature to test. This is the same name that can be passed to the method `hasFeature` on `DOMImplementation`. |
| `version` | `string` | This is the version number of the package name to test.                                                                              |

##### Returns

`true`

##### Deprecated

Since `DOMImplementation.hasFeature` is deprecated and always returns true.

##### Since

Introduced in DOM Level 2

##### See

DOMImplementation.hasFeature

##### Inherited from

`Node.isSupported`

#### lookupNamespaceURI()

> **lookupNamespaceURI**(`prefix`): `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:571

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lookupNamespaceURI)

##### Parameters

| Parameter | Type               |
| --------- | ------------------ |
| `prefix`  | `string` \| `null` |

##### Returns

`string` \| `null`

##### Inherited from

`Node.lookupNamespaceURI`

#### lookupPrefix()

> **lookupPrefix**(`namespace`): `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:574

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lookupPrefix)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |

##### Returns

`string` \| `null`

##### Inherited from

`Node.lookupPrefix`

#### normalize()

> **normalize**(): `void`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:582

Removes empty exclusive Text nodes and concatenates the data of remaining contiguous
exclusive Text nodes into the first of their nodes.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/normalize)

##### Returns

`void`

##### Inherited from

`Node.normalize`

#### removeChild()

> **removeChild**(`child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:585

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/removeChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `child`   | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.removeChild`

#### replaceChild()

> **replaceChild**(`node`, `child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:588

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/replaceChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `node`    | [`Node`](#node-1) |
| `child`   | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.replaceChild`

---

## Collection

Defined in: [libraries/epub/src/index.tsx:183](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L183)

### Properties

#### name

> **name**: `string`

Defined in: [libraries/epub/src/index.tsx:184](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L184)

#### position?

> `optional` **position**: `string`

Defined in: [libraries/epub/src/index.tsx:186](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L186)

#### type?

> `optional` **type**: `string`

Defined in: [libraries/epub/src/index.tsx:185](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L185)

---

## DcCreator

Defined in: [libraries/epub/src/index.tsx:164](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L164)

### Properties

#### alternateScripts?

> `optional` **alternateScripts**: [`AlternateScript`](#alternatescript)[]

Defined in: [libraries/epub/src/index.tsx:169](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L169)

#### fileAs?

> `optional` **fileAs**: `string`

Defined in: [libraries/epub/src/index.tsx:168](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L168)

#### name

> **name**: `string`

Defined in: [libraries/epub/src/index.tsx:165](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L165)

#### role?

> `optional` **role**: `string`

Defined in: [libraries/epub/src/index.tsx:166](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L166)

#### roleScheme?

> `optional` **roleScheme**: `string`

Defined in: [libraries/epub/src/index.tsx:167](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L167)

---

## DcSubject

Defined in: [libraries/epub/src/index.tsx:126](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L126)

### Properties

#### authority

> **authority**: `string`

Defined in: [libraries/epub/src/index.tsx:128](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L128)

#### term

> **term**: `string`

Defined in: [libraries/epub/src/index.tsx:129](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L129)

#### value

> **value**: `string`

Defined in: [libraries/epub/src/index.tsx:127](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L127)

---

## Document

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1188

### Extends

- [`Node`](#node-1)

### Properties

#### ATTRIBUTE_NODE

> `readonly` **ATTRIBUTE_NODE**: `2`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:592

##### Inherited from

`Node.ATTRIBUTE_NODE`

#### baseURI

> `readonly` **baseURI**: `"about:blank"`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:396

Always returns `about:blank` currently.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/baseURI)

##### Inherited from

`Node.baseURI`

#### CDATA_SECTION_NODE

> `readonly` **CDATA_SECTION_NODE**: `4`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:596

node is a CDATASection node.

##### Inherited from

`Node.CDATA_SECTION_NODE`

#### childNodes

> `readonly` **childNodes**: `NodeList`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:374

Returns the children.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/childNodes)

##### Inherited from

`Node.childNodes`

#### children

> `readonly` **children**: `LiveNodeList`\<[`Element`](#element-1)\>

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1226

Returns a live collection of the direct child elements of this document.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Document/children)

##### See

https://dom.spec.whatwg.org/#dom-parentnode-children

#### columnNumber?

> `optional` **columnNumber**: `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:479

One based column position inside the parsed source,
if the `locator` was not disabled.

##### Inherited from

`Node.columnNumber`

#### COMMENT_NODE

> `readonly` **COMMENT_NODE**: `8`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:602

node is a Comment node.

##### Inherited from

`Node.COMMENT_NODE`

#### contentType

> `readonly` **contentType**: `MIME_TYPE`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1196

The mime type of the document is determined at creation time and can not be modified.

##### See

- https://dom.spec.whatwg.org/#concept-document-content-type
- DOMImplementation
- MIME_TYPE

#### doctype

> `readonly` **doctype**: [`DocumentType`](#documenttype-2) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1211

#### DOCUMENT_FRAGMENT_NODE

> `readonly` **DOCUMENT_FRAGMENT_NODE**: `11`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:608

node is a DocumentFragment node.

##### Inherited from

`Node.DOCUMENT_FRAGMENT_NODE`

#### DOCUMENT_NODE

> `readonly` **DOCUMENT_NODE**: `9`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:604

node is a document.

##### Inherited from

`Node.DOCUMENT_NODE`

#### DOCUMENT_POSITION_CONTAINED_BY

> `readonly` **DOCUMENT_POSITION_CONTAINED_BY**: `16`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:619

Set when other is a descendant of node.

##### Inherited from

`Node.DOCUMENT_POSITION_CONTAINED_BY`

#### DOCUMENT_POSITION_CONTAINS

> `readonly` **DOCUMENT_POSITION_CONTAINS**: `8`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:617

Set when other is an ancestor of node.

##### Inherited from

`Node.DOCUMENT_POSITION_CONTAINS`

#### DOCUMENT_POSITION_DISCONNECTED

> `readonly` **DOCUMENT_POSITION_DISCONNECTED**: `1`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:611

Set when node and other are not in the same tree.

##### Inherited from

`Node.DOCUMENT_POSITION_DISCONNECTED`

#### DOCUMENT_POSITION_FOLLOWING

> `readonly` **DOCUMENT_POSITION_FOLLOWING**: `4`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:615

Set when other is following node.

##### Inherited from

`Node.DOCUMENT_POSITION_FOLLOWING`

#### DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC

> `readonly` **DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC**: `32`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:620

##### Inherited from

`Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC`

#### DOCUMENT_POSITION_PRECEDING

> `readonly` **DOCUMENT_POSITION_PRECEDING**: `2`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:613

Set when other is preceding node.

##### Inherited from

`Node.DOCUMENT_POSITION_PRECEDING`

#### DOCUMENT_TYPE_NODE

> `readonly` **DOCUMENT_TYPE_NODE**: `10`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:606

node is a doctype.

##### Inherited from

`Node.DOCUMENT_TYPE_NODE`

#### documentElement

> `readonly` **documentElement**: [`Element`](#element-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1217

Gets a reference to the root node of the document.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Document/documentElement)

#### ELEMENT_NODE

> `readonly` **ELEMENT_NODE**: `1`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:591

node is an element.

##### Inherited from

`Node.ELEMENT_NODE`

#### ENTITY_NODE

> `readonly` **ENTITY_NODE**: `6`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:598

##### Inherited from

`Node.ENTITY_NODE`

#### ENTITY_REFERENCE_NODE

> `readonly` **ENTITY_REFERENCE_NODE**: `5`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:597

##### Inherited from

`Node.ENTITY_REFERENCE_NODE`

#### firstChild

> `readonly` **firstChild**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:380

Returns the first child.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/firstChild)

##### Inherited from

`Node.firstChild`

#### implementation

> `readonly` **implementation**: `DOMImplementation`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1207

The implementation that created this document.

#### isConnected

> `readonly` **isConnected**: `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:402

Returns true if this node is inside of a document or is the document node itself.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/isConnected)

##### Inherited from

`Node.isConnected`

#### lastChild

> `readonly` **lastChild**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:386

Returns the last child.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lastChild)

##### Inherited from

`Node.lastChild`

#### lineNumber?

> `optional` **lineNumber**: `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:474

Zero based line position inside the parsed source,
if the `locator` was not disabled.

##### Inherited from

`Node.lineNumber`

#### localName

> **localName**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:390

The local part of the qualified name of this node.

##### Inherited from

`Node.localName`

#### namespaceURI

> `readonly` **namespaceURI**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:406

The namespace URI of this node.

##### Inherited from

`Node.namespaceURI`

#### nextSibling

> `readonly` **nextSibling**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:412

Returns the next sibling.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nextSibling)

##### Inherited from

`Node.nextSibling`

#### nodeName

> `readonly` **nodeName**: `"#document"`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1209

Returns a string appropriate for the type of node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeName)

##### Overrides

`Node.nodeName`

#### nodeType

> `readonly` **nodeType**: `9`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1210

Returns the type of node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeType)

##### Overrides

`Node.nodeType`

#### nodeValue

> **nodeValue**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:426

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeValue)

##### Inherited from

`Node.nodeValue`

#### NOTATION_NODE

> `readonly` **NOTATION_NODE**: `12`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:609

##### Inherited from

`Node.NOTATION_NODE`

#### ownerDocument

> `readonly` **ownerDocument**: [`Document`](#document-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1208

Returns the node document. Returns null for documents.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/ownerDocument)

##### Overrides

`Node.ownerDocument`

#### parentElement

> `readonly` **parentElement**: [`Element`](#element-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:444

Returns the parent `Node` if it is of type `Element`, otherwise `null`.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/parentElement)

##### Inherited from

`Node.parentElement`

#### parentNode

> `readonly` **parentNode**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:438

Returns the parent.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/parentNode)

##### Inherited from

`Node.parentNode`

#### prefix

> **prefix**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:448

The prefix of the namespace for this node.

##### Inherited from

`Node.prefix`

#### previousSibling

> `readonly` **previousSibling**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:454

Returns the previous sibling.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/previousSibling)

##### Inherited from

`Node.previousSibling`

#### PROCESSING_INSTRUCTION_NODE

> `readonly` **PROCESSING_INSTRUCTION_NODE**: `7`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:600

node is a ProcessingInstruction node.

##### Inherited from

`Node.PROCESSING_INSTRUCTION_NODE`

#### TEXT_NODE

> `readonly` **TEXT_NODE**: `3`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:594

node is a Text node.

##### Inherited from

`Node.TEXT_NODE`

#### textContent

> **textContent**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:468

The text content of this node and its descendants.

For [Element](#element-1) and DocumentFragment nodes, returns the concatenation of the
`nodeValue` of every descendant text node, excluding processing instruction and comment
nodes. For all other node types, returns `nodeValue`.

Setting `textContent` on an element or document fragment replaces all child nodes with a
single text node; on other nodes it sets `data`, `value`, and `nodeValue` directly.
[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/textContent)

##### See

[https://dom.spec.whatwg.org/#dom-node-textcontent](https://dom.spec.whatwg.org/#dom-node-textcontent)

##### Inherited from

`Node.textContent`

#### type

> `readonly` **type**: `"xml"` \| `"html"`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1201

##### See

- https://dom.spec.whatwg.org/#concept-document-type
- DOMImplementation

### Methods

#### appendChild()

> **appendChild**(`node`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:482

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/appendChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `node`    | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.appendChild`

#### cloneNode()

> **cloneNode**(`deep?`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:533

Returns a copy of node. If deep is true, the copy also includes the node's descendants.

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `deep?`   | `boolean` |

##### Returns

[`Node`](#node-1)

##### Throws

May throw a DOMException if operations within [Element#setAttributeNode](#setattributenode) or
[Node#appendChild](#appendchild-8) (which are potentially invoked in this method) do not meet their
specific constraints.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/cloneNode)

##### Inherited from

`Node.cloneNode`

#### compareDocumentPosition()

> **compareDocumentPosition**(`other`): `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:540

Returns a bitmask indicating the position of other relative to node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/compareDocumentPosition)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`number`

##### Inherited from

`Node.compareDocumentPosition`

#### contains()

> **contains**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:489

Checks whether `other` is an inclusive descendant of this node.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/contains)

##### Parameters

| Parameter | Type                                       |
| --------- | ------------------------------------------ |
| `other`   | [`Node`](#node-1) \| `null` \| `undefined` |

##### Returns

`boolean`

##### Inherited from

`Node.contains`

#### createAttribute()

> **createAttribute**(`localName`): [`Attr`](#attr-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1233

Creates an attribute object with a specified name.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Document/createAttribute)

##### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `localName` | `string` |

##### Returns

[`Attr`](#attr-1)

#### createAttributeNS()

> **createAttributeNS**(`namespace`, `qualifiedName`): [`Attr`](#attr-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1236

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Document/createAttributeNS)

##### Parameters

| Parameter       | Type               |
| --------------- | ------------------ |
| `namespace`     | `string` \| `null` |
| `qualifiedName` | `string`           |

##### Returns

[`Attr`](#attr-1)

#### createCDATASection()

> **createCDATASection**(`data`): `CDATASection`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1249

Returns a new CDATASection node whose data is `data`.

**This implementation differs from the specification:** - calling this method on an HTML
document does not throw `NotSupportedError`.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `data`    | `string` |

##### Returns

`CDATASection`

##### Throws

With code `INVALID_CHARACTER_ERR` if `data` contains `"]]>"`.

##### See

- https://developer.mozilla.org/en-US/docs/Web/API/Document/createCDATASection
- https://dom.spec.whatwg.org/#dom-document-createcdatasection

#### createComment()

> **createComment**(`data`): `Comment`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1261

Creates a comment object with the specified data.

No validation is performed at creation time. When the resulting document is serialized
with `requireWellFormed: true`, the serializer throws `InvalidStateError` if the comment
data contains `--` anywhere, ends with `-`, or contains characters outside the XML Char
production (W3C DOM Parsing §3.2.1.3). Without that option the data is emitted verbatim.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Document/createComment)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `data`    | `string` |

##### Returns

`Comment`

#### createDocumentFragment()

> **createDocumentFragment**(): `DocumentFragment`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1268

Creates a new document.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Document/createDocumentFragment)

##### Returns

`DocumentFragment`

#### createElement()

> **createElement**(`tagName`): [`Element`](#element-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1270

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `tagName` | `string` |

##### Returns

[`Element`](#element-1)

#### createElementNS()

> **createElementNS**(`namespace`, `qualifiedName`): [`Element`](#element-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1292

Returns an element with namespace namespace. Its namespace prefix will be everything before
":" (U+003E) in qualifiedName or null. Its local name will be everything after ":" (U+003E)
in qualifiedName or qualifiedName.

If localName does not match the Name production an "InvalidCharacterError" DOMException will
be thrown.

If one of the following conditions is true a "NamespaceError" DOMException will be thrown:

localName does not match the QName production.
Namespace prefix is not null and namespace is the empty string.
Namespace prefix is "xml" and namespace is not the XML namespace.
qualifiedName or namespace prefix is "xmlns" and namespace is not the XMLNS namespace.
namespace is the XMLNS namespace and neither qualifiedName nor namespace prefix is "xmlns".

When supplied, options's is can be used to create a customized built-in element.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Document/createElementNS)

##### Parameters

| Parameter       | Type               |
| --------------- | ------------------ |
| `namespace`     | `string` \| `null` |
| `qualifiedName` | `string`           |

##### Returns

[`Element`](#element-1)

#### ~~createEntityReference()~~

> **createEntityReference**(`name`): `EntityReference`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1319

Creates an EntityReference object.
The current implementation does not fill the `childNodes` with those of the corresponding
`Entity`

The name of the entity to reference. No namespace well-formedness checks are performed.

The `name` is validated against the XML `Name` production at creation time; an invalid
name throws `InvalidCharacterError`. When the resulting node is serialized with
`requireWellFormed: true`, the serializer re-validates `nodeName` against the XML `Name`
production and throws `InvalidStateError` if a later `nodeName` mutation made it invalid;
without that option the name is emitted verbatim.

**This implementation differs from the specification:** xmldom does not expand entities —
the parser resolves entity references inline and never constructs `EntityReference` nodes,
so this method is the only producer.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |

##### Returns

`EntityReference`

##### Deprecated

In DOM Level 4.

##### Throws

With code `INVALID_CHARACTER_ERR` when `name` is not a valid XML `Name`.

##### Throws

with code `NOT_SUPPORTED_ERR` when the document is of type `html`

##### See

https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-392B75AE

#### createProcessingInstruction()

> **createProcessingInstruction**(`target`, `data`): `ProcessingInstruction`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1338

Returns a ProcessingInstruction node whose target is target and data is data.

**This behavior is slightly different from the in the specs**:

- it does not do any input validation on the arguments and doesn't throw
  "InvalidCharacterError".

Note: When the resulting document is serialized with `requireWellFormed: true`, the
serializer throws `InvalidStateError` if `.target` is not a valid XML `NCName` (a `Name`
with no colon) or is an ASCII case-insensitive match for `"xml"`, or if `.data` contains
`?>` or characters outside the XML Char production (W3C DOM Parsing §3.2.1.7). Without
that option the target and data are emitted verbatim.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `target`  | `string` |
| `data`    | `string` |

##### Returns

`ProcessingInstruction`

##### See

- https://developer.mozilla.org/docs/Web/API/Document/createProcessingInstruction
- https://dom.spec.whatwg.org/#dom-document-createprocessinginstruction
- https://www.w3.org/TR/DOM-Parsing/#dfn-concept-serialize-xml §3.2.1.7

#### createTextNode()

> **createTextNode**(`data`): [`Text`](#text-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1351

Creates a text string from the specified value.

##### Parameters

| Parameter | Type     | Description                                                                                                                                        |
| --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`    | `string` | String that specifies the nodeValue property of the text node. [MDN Reference](https://developer.mozilla.org/docs/Web/API/Document/createTextNode) |

##### Returns

[`Text`](#text-1)

#### getElementById()

> **getElementById**(`elementId`): [`Element`](#element-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1356

Returns a reference to the first object with the specified value of the ID attribute.

##### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `elementId` | `string` |

##### Returns

[`Element`](#element-1) \| `null`

#### getElementsByClassName()

> **getElementsByClassName**(`classNames`): `LiveNodeList`\<[`Element`](#element-1)\>

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1373

Returns a LiveNodeList of all child elements which have **all** of the given class
name(s).

Returns an empty list if `classNames` is an empty string or only contains HTML white space
characters.

Warning: This returns a live LiveNodeList.
Changes in the DOM will reflect in the array as the changes occur.
If an element selected by this array no longer qualifies for the selector,
it will automatically be removed. Be aware of this for iteration purposes.

##### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `classNames` | `string` |

##### Returns

`LiveNodeList`\<[`Element`](#element-1)\>

##### See

- https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementsByClassName
- https://dom.spec.whatwg.org/#concept-getelementsbyclassname

#### getElementsByTagName()

> **getElementsByTagName**(`qualifiedName`): `LiveNodeList`\<[`Element`](#element-1)\>

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1397

Returns a LiveNodeList of elements with the given qualifiedName.
Searching for all descendants can be done by passing `*` as `qualifiedName`.

The complete document is searched, including the root node.
The returned list is live, which means it updates itself with the DOM tree automatically.
Therefore, there is no need to call `Element.getElementsByTagName()`
with the same element and arguments repeatedly if the DOM changes in between calls.

When called on an HTML element in an HTML document,
`getElementsByTagName` lower-cases the argument before searching for it.
This is undesirable when trying to match camel-cased SVG elements (such as
`<linearGradient>`) in an HTML document.
Instead, use `Element.getElementsByTagNameNS()`,
which preserves the capitalization of the tag name.

`Element.getElementsByTagName` is similar to `Document.getElementsByTagName()`,
except that it only searches for elements that are descendants of the specified element.

##### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `qualifiedName` | `string` |

##### Returns

`LiveNodeList`\<[`Element`](#element-1)\>

##### See

- https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByTagName
- https://dom.spec.whatwg.org/#concept-getelementsbytagname

#### getElementsByTagNameNS()

> **getElementsByTagNameNS**(`namespaceURI`, `localName`): `LiveNodeList`\<[`Element`](#element-1)\>

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1409

Returns a `LiveNodeList` of elements with the given tag name belonging to the given
namespace. The complete document is searched, including the root node.

The returned list is live, which means it updates itself with the DOM tree automatically.
Therefore, there is no need to call `Element.getElementsByTagName()`
with the same element and arguments repeatedly if the DOM changes in between calls.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/getElementsByTagNameNS)

##### Parameters

| Parameter      | Type               |
| -------------- | ------------------ |
| `namespaceURI` | `string` \| `null` |
| `localName`    | `string`           |

##### Returns

`LiveNodeList`\<[`Element`](#element-1)\>

#### getRootNode()

> **getRootNode**(`options`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:502

Searches for the root node of this node.

**This behavior is slightly different from the one in the specs**:

- ignores `options.composed`, since `ShadowRoot`s are unsupported, therefore always
  returning root.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/getRootNode)

##### Parameters

| Parameter | Type                 |
| --------- | -------------------- |
| `options` | `GetRootNodeOptions` |

##### Returns

[`Node`](#node-1)

##### See

- https://dom.spec.whatwg.org/#dom-node-getrootnode
- https://dom.spec.whatwg.org/#concept-shadow-including-root

##### Inherited from

`Node.getRootNode`

#### hasChildNodes()

> **hasChildNodes**(): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:547

Returns whether node has children.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/hasChildNodes)

##### Returns

`boolean`

##### Inherited from

`Node.hasChildNodes`

#### importNode()

> **importNode**\<`T`\>(`node`, `deep?`): `T`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1421

Imports a node from another document into this document, creating a new copy owned by this
document. If `deep` is true, the copy also includes the node's descendants.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Document/importNode)

##### Type Parameters

| Type Parameter                  |
| ------------------------------- |
| `T` _extends_ [`Node`](#node-1) |

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `node`    | `T`       |
| `deep?`   | `boolean` |

##### Returns

`T`

##### See

[https://dom.spec.whatwg.org/#dom-document-importnode](https://dom.spec.whatwg.org/#dom-document-importnode)

#### insertBefore()

> **insertBefore**(`node`, `child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:550

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/insertBefore)

##### Parameters

| Parameter | Type                        |
| --------- | --------------------------- |
| `node`    | [`Node`](#node-1)           |
| `child`   | [`Node`](#node-1) \| `null` |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.insertBefore`

#### isDefaultNamespace()

> **isDefaultNamespace**(`namespace`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:553

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/isDefaultNamespace)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |

##### Returns

`boolean`

##### Inherited from

`Node.isDefaultNamespace`

#### isEqualNode()

> **isEqualNode**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:514

Checks whether the given node is equal to this node.

Two nodes are equal when they have the same type, defining characteristics (for the type),
and the same `childNodes`. The comparison is iterative to avoid stack overflows on deeply
nested trees. `Attribute` nodes of each `Element` pair are also compared iteratively.

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`boolean`

##### See

- [https://dom.spec.whatwg.org/#concept-node-equals](https://dom.spec.whatwg.org/#concept-node-equals)
- [https://developer.mozilla.org/en-US/docs/Web/API/Node/isEqualNode](https://developer.mozilla.org/en-US/docs/Web/API/Node/isEqualNode)

##### Inherited from

`Node.isEqualNode`

#### isSameNode()

> **isSameNode**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:521

Checks whether the given node is this node.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/isSameNode)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`boolean`

##### Inherited from

`Node.isSameNode`

#### ~~isSupported()~~

> **isSupported**(`feature`, `version`): `true`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:568

Checks whether the DOM implementation implements a specific feature and its version.

##### Parameters

| Parameter | Type     | Description                                                                                                                          |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `feature` | `string` | The package name of the feature to test. This is the same name that can be passed to the method `hasFeature` on `DOMImplementation`. |
| `version` | `string` | This is the version number of the package name to test.                                                                              |

##### Returns

`true`

##### Deprecated

Since `DOMImplementation.hasFeature` is deprecated and always returns true.

##### Since

Introduced in DOM Level 2

##### See

DOMImplementation.hasFeature

##### Inherited from

`Node.isSupported`

#### lookupNamespaceURI()

> **lookupNamespaceURI**(`prefix`): `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:571

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lookupNamespaceURI)

##### Parameters

| Parameter | Type               |
| --------- | ------------------ |
| `prefix`  | `string` \| `null` |

##### Returns

`string` \| `null`

##### Inherited from

`Node.lookupNamespaceURI`

#### lookupPrefix()

> **lookupPrefix**(`namespace`): `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:574

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lookupPrefix)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |

##### Returns

`string` \| `null`

##### Inherited from

`Node.lookupPrefix`

#### normalize()

> **normalize**(): `void`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:582

Removes empty exclusive Text nodes and concatenates the data of remaining contiguous
exclusive Text nodes into the first of their nodes.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/normalize)

##### Returns

`void`

##### Inherited from

`Node.normalize`

#### removeChild()

> **removeChild**(`child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:585

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/removeChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `child`   | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.removeChild`

#### replaceChild()

> **replaceChild**(`node`, `child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:588

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/replaceChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `node`    | [`Node`](#node-1) |
| `child`   | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.replaceChild`

---

## DocumentType

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1431

A Node containing a doctype.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/DocumentType)

### Extends

- [`Node`](#node-1)

### Properties

#### ATTRIBUTE_NODE

> `readonly` **ATTRIBUTE_NODE**: `2`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:592

##### Inherited from

`Node.ATTRIBUTE_NODE`

#### baseURI

> `readonly` **baseURI**: `"about:blank"`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:396

Always returns `about:blank` currently.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/baseURI)

##### Inherited from

`Node.baseURI`

#### CDATA_SECTION_NODE

> `readonly` **CDATA_SECTION_NODE**: `4`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:596

node is a CDATASection node.

##### Inherited from

`Node.CDATA_SECTION_NODE`

#### childNodes

> `readonly` **childNodes**: `NodeList`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:374

Returns the children.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/childNodes)

##### Inherited from

`Node.childNodes`

#### columnNumber?

> `optional` **columnNumber**: `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:479

One based column position inside the parsed source,
if the `locator` was not disabled.

##### Inherited from

`Node.columnNumber`

#### COMMENT_NODE

> `readonly` **COMMENT_NODE**: `8`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:602

node is a Comment node.

##### Inherited from

`Node.COMMENT_NODE`

#### DOCUMENT_FRAGMENT_NODE

> `readonly` **DOCUMENT_FRAGMENT_NODE**: `11`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:608

node is a DocumentFragment node.

##### Inherited from

`Node.DOCUMENT_FRAGMENT_NODE`

#### DOCUMENT_NODE

> `readonly` **DOCUMENT_NODE**: `9`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:604

node is a document.

##### Inherited from

`Node.DOCUMENT_NODE`

#### DOCUMENT_POSITION_CONTAINED_BY

> `readonly` **DOCUMENT_POSITION_CONTAINED_BY**: `16`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:619

Set when other is a descendant of node.

##### Inherited from

`Node.DOCUMENT_POSITION_CONTAINED_BY`

#### DOCUMENT_POSITION_CONTAINS

> `readonly` **DOCUMENT_POSITION_CONTAINS**: `8`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:617

Set when other is an ancestor of node.

##### Inherited from

`Node.DOCUMENT_POSITION_CONTAINS`

#### DOCUMENT_POSITION_DISCONNECTED

> `readonly` **DOCUMENT_POSITION_DISCONNECTED**: `1`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:611

Set when node and other are not in the same tree.

##### Inherited from

`Node.DOCUMENT_POSITION_DISCONNECTED`

#### DOCUMENT_POSITION_FOLLOWING

> `readonly` **DOCUMENT_POSITION_FOLLOWING**: `4`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:615

Set when other is following node.

##### Inherited from

`Node.DOCUMENT_POSITION_FOLLOWING`

#### DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC

> `readonly` **DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC**: `32`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:620

##### Inherited from

`Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC`

#### DOCUMENT_POSITION_PRECEDING

> `readonly` **DOCUMENT_POSITION_PRECEDING**: `2`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:613

Set when other is preceding node.

##### Inherited from

`Node.DOCUMENT_POSITION_PRECEDING`

#### DOCUMENT_TYPE_NODE

> `readonly` **DOCUMENT_TYPE_NODE**: `10`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:606

node is a doctype.

##### Inherited from

`Node.DOCUMENT_TYPE_NODE`

#### ELEMENT_NODE

> `readonly` **ELEMENT_NODE**: `1`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:591

node is an element.

##### Inherited from

`Node.ELEMENT_NODE`

#### ENTITY_NODE

> `readonly` **ENTITY_NODE**: `6`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:598

##### Inherited from

`Node.ENTITY_NODE`

#### ENTITY_REFERENCE_NODE

> `readonly` **ENTITY_REFERENCE_NODE**: `5`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:597

##### Inherited from

`Node.ENTITY_REFERENCE_NODE`

#### firstChild

> `readonly` **firstChild**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:380

Returns the first child.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/firstChild)

##### Inherited from

`Node.firstChild`

#### internalSubset

> `readonly` **internalSubset**: `string`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1449

The internal subset string (the raw content between `[` and `]`), or an empty string.
Declared `readonly` by the WHATWG DOM spec; xmldom does not enforce this — direct
property writes succeed and the written value is serialized verbatim.
When serialized with `requireWellFormed: true`, throws `InvalidStateError` if the value
contains `"]>"`.
[MDN Reference](https://developer.mozilla.org/docs/Web/API/DocumentType/internalSubset)

#### isConnected

> `readonly` **isConnected**: `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:402

Returns true if this node is inside of a document or is the document node itself.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/isConnected)

##### Inherited from

`Node.isConnected`

#### lastChild

> `readonly` **lastChild**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:386

Returns the last child.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lastChild)

##### Inherited from

`Node.lastChild`

#### lineNumber?

> `optional` **lineNumber**: `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:474

Zero based line position inside the parsed source,
if the `locator` was not disabled.

##### Inherited from

`Node.lineNumber`

#### localName

> **localName**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:390

The local part of the qualified name of this node.

##### Inherited from

`Node.localName`

#### name

> `readonly` **name**: `string`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1440

The doctype name, stored verbatim.
Declared `readonly` by the WHATWG DOM spec; xmldom does not enforce this — direct
property writes succeed and the written value is serialized verbatim.
When serialized with `requireWellFormed: true`, throws `InvalidStateError` if the value
is not a valid XML `Name` production (XML 1.0 [5]).
[MDN Reference](https://developer.mozilla.org/docs/Web/API/DocumentType/name)

#### namespaceURI

> `readonly` **namespaceURI**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:406

The namespace URI of this node.

##### Inherited from

`Node.namespaceURI`

#### nextSibling

> `readonly` **nextSibling**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:412

Returns the next sibling.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nextSibling)

##### Inherited from

`Node.nextSibling`

#### nodeName

> `readonly` **nodeName**: `string`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:418

Returns a string appropriate for the type of node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeName)

##### Inherited from

`Node.nodeName`

#### nodeType

> `readonly` **nodeType**: `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:424

Returns the type of node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeType)

##### Inherited from

`Node.nodeType`

#### nodeValue

> **nodeValue**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:426

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeValue)

##### Inherited from

`Node.nodeValue`

#### NOTATION_NODE

> `readonly` **NOTATION_NODE**: `12`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:609

##### Inherited from

`Node.NOTATION_NODE`

#### ownerDocument

> `readonly` **ownerDocument**: [`Document`](#document-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:432

Returns the node document. Returns null for documents.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/ownerDocument)

##### Inherited from

`Node.ownerDocument`

#### parentElement

> `readonly` **parentElement**: [`Element`](#element-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:444

Returns the parent `Node` if it is of type `Element`, otherwise `null`.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/parentElement)

##### Inherited from

`Node.parentElement`

#### parentNode

> `readonly` **parentNode**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:438

Returns the parent.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/parentNode)

##### Inherited from

`Node.parentNode`

#### prefix

> **prefix**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:448

The prefix of the namespace for this node.

##### Inherited from

`Node.prefix`

#### previousSibling

> `readonly` **previousSibling**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:454

Returns the previous sibling.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/previousSibling)

##### Inherited from

`Node.previousSibling`

#### PROCESSING_INSTRUCTION_NODE

> `readonly` **PROCESSING_INSTRUCTION_NODE**: `7`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:600

node is a ProcessingInstruction node.

##### Inherited from

`Node.PROCESSING_INSTRUCTION_NODE`

#### publicId

> `readonly` **publicId**: `string`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1458

The external subset public identifier, stored verbatim including surrounding quotes.
Declared `readonly` by the WHATWG DOM spec; xmldom does not enforce this — direct
property writes succeed and the written value is serialized verbatim.
When serialized with `requireWellFormed: true`, throws `InvalidStateError` if the value
is non-empty and does not match the XML `PubidLiteral` production (XML 1.0 [12]).
[MDN Reference](https://developer.mozilla.org/docs/Web/API/DocumentType/publicId)

#### systemId

> `readonly` **systemId**: `string`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1467

The external subset system identifier, stored verbatim including surrounding quotes.
Declared `readonly` by the WHATWG DOM spec; xmldom does not enforce this — direct
property writes succeed and the written value is serialized verbatim.
When serialized with `requireWellFormed: true`, throws `InvalidStateError` if the value
is non-empty and does not match the XML `SystemLiteral` production (XML 1.0 [11]).
[MDN Reference](https://developer.mozilla.org/docs/Web/API/DocumentType/systemId)

#### TEXT_NODE

> `readonly` **TEXT_NODE**: `3`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:594

node is a Text node.

##### Inherited from

`Node.TEXT_NODE`

#### textContent

> **textContent**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:468

The text content of this node and its descendants.

For [Element](#element-1) and DocumentFragment nodes, returns the concatenation of the
`nodeValue` of every descendant text node, excluding processing instruction and comment
nodes. For all other node types, returns `nodeValue`.

Setting `textContent` on an element or document fragment replaces all child nodes with a
single text node; on other nodes it sets `data`, `value`, and `nodeValue` directly.
[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/textContent)

##### See

[https://dom.spec.whatwg.org/#dom-node-textcontent](https://dom.spec.whatwg.org/#dom-node-textcontent)

##### Inherited from

`Node.textContent`

### Methods

#### appendChild()

> **appendChild**(`node`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:482

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/appendChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `node`    | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.appendChild`

#### cloneNode()

> **cloneNode**(`deep?`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:533

Returns a copy of node. If deep is true, the copy also includes the node's descendants.

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `deep?`   | `boolean` |

##### Returns

[`Node`](#node-1)

##### Throws

May throw a DOMException if operations within [Element#setAttributeNode](#setattributenode) or
[Node#appendChild](#appendchild-8) (which are potentially invoked in this method) do not meet their
specific constraints.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/cloneNode)

##### Inherited from

`Node.cloneNode`

#### compareDocumentPosition()

> **compareDocumentPosition**(`other`): `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:540

Returns a bitmask indicating the position of other relative to node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/compareDocumentPosition)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`number`

##### Inherited from

`Node.compareDocumentPosition`

#### contains()

> **contains**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:489

Checks whether `other` is an inclusive descendant of this node.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/contains)

##### Parameters

| Parameter | Type                                       |
| --------- | ------------------------------------------ |
| `other`   | [`Node`](#node-1) \| `null` \| `undefined` |

##### Returns

`boolean`

##### Inherited from

`Node.contains`

#### getRootNode()

> **getRootNode**(`options`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:502

Searches for the root node of this node.

**This behavior is slightly different from the one in the specs**:

- ignores `options.composed`, since `ShadowRoot`s are unsupported, therefore always
  returning root.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/getRootNode)

##### Parameters

| Parameter | Type                 |
| --------- | -------------------- |
| `options` | `GetRootNodeOptions` |

##### Returns

[`Node`](#node-1)

##### See

- https://dom.spec.whatwg.org/#dom-node-getrootnode
- https://dom.spec.whatwg.org/#concept-shadow-including-root

##### Inherited from

`Node.getRootNode`

#### hasChildNodes()

> **hasChildNodes**(): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:547

Returns whether node has children.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/hasChildNodes)

##### Returns

`boolean`

##### Inherited from

`Node.hasChildNodes`

#### insertBefore()

> **insertBefore**(`node`, `child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:550

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/insertBefore)

##### Parameters

| Parameter | Type                        |
| --------- | --------------------------- |
| `node`    | [`Node`](#node-1)           |
| `child`   | [`Node`](#node-1) \| `null` |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.insertBefore`

#### isDefaultNamespace()

> **isDefaultNamespace**(`namespace`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:553

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/isDefaultNamespace)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |

##### Returns

`boolean`

##### Inherited from

`Node.isDefaultNamespace`

#### isEqualNode()

> **isEqualNode**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:514

Checks whether the given node is equal to this node.

Two nodes are equal when they have the same type, defining characteristics (for the type),
and the same `childNodes`. The comparison is iterative to avoid stack overflows on deeply
nested trees. `Attribute` nodes of each `Element` pair are also compared iteratively.

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`boolean`

##### See

- [https://dom.spec.whatwg.org/#concept-node-equals](https://dom.spec.whatwg.org/#concept-node-equals)
- [https://developer.mozilla.org/en-US/docs/Web/API/Node/isEqualNode](https://developer.mozilla.org/en-US/docs/Web/API/Node/isEqualNode)

##### Inherited from

`Node.isEqualNode`

#### isSameNode()

> **isSameNode**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:521

Checks whether the given node is this node.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/isSameNode)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`boolean`

##### Inherited from

`Node.isSameNode`

#### ~~isSupported()~~

> **isSupported**(`feature`, `version`): `true`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:568

Checks whether the DOM implementation implements a specific feature and its version.

##### Parameters

| Parameter | Type     | Description                                                                                                                          |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `feature` | `string` | The package name of the feature to test. This is the same name that can be passed to the method `hasFeature` on `DOMImplementation`. |
| `version` | `string` | This is the version number of the package name to test.                                                                              |

##### Returns

`true`

##### Deprecated

Since `DOMImplementation.hasFeature` is deprecated and always returns true.

##### Since

Introduced in DOM Level 2

##### See

DOMImplementation.hasFeature

##### Inherited from

`Node.isSupported`

#### lookupNamespaceURI()

> **lookupNamespaceURI**(`prefix`): `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:571

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lookupNamespaceURI)

##### Parameters

| Parameter | Type               |
| --------- | ------------------ |
| `prefix`  | `string` \| `null` |

##### Returns

`string` \| `null`

##### Inherited from

`Node.lookupNamespaceURI`

#### lookupPrefix()

> **lookupPrefix**(`namespace`): `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:574

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lookupPrefix)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |

##### Returns

`string` \| `null`

##### Inherited from

`Node.lookupPrefix`

#### normalize()

> **normalize**(): `void`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:582

Removes empty exclusive Text nodes and concatenates the data of remaining contiguous
exclusive Text nodes into the first of their nodes.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/normalize)

##### Returns

`void`

##### Inherited from

`Node.normalize`

#### removeChild()

> **removeChild**(`child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:585

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/removeChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `child`   | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.removeChild`

#### replaceChild()

> **replaceChild**(`node`, `child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:588

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/replaceChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `node`    | [`Node`](#node-1) |
| `child`   | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.replaceChild`

---

## DublinCore

Defined in: [libraries/epub/src/index.tsx:172](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L172)

### Properties

#### contributors?

> `optional` **contributors**: [`DcCreator`](#dccreator)[]

Defined in: [libraries/epub/src/index.tsx:179](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L179)

#### creators?

> `optional` **creators**: [`DcCreator`](#dccreator)[]

Defined in: [libraries/epub/src/index.tsx:178](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L178)

#### date?

> `optional` **date**: `Date`

Defined in: [libraries/epub/src/index.tsx:176](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L176)

#### identifier

> **identifier**: `string`

Defined in: [libraries/epub/src/index.tsx:175](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L175)

#### language

> **language**: `Locale`

Defined in: [libraries/epub/src/index.tsx:174](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L174)

#### subjects?

> `optional` **subjects**: (`string` \| [`DcSubject`](#dcsubject))[]

Defined in: [libraries/epub/src/index.tsx:177](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L177)

#### title

> **title**: `string`

Defined in: [libraries/epub/src/index.tsx:173](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L173)

#### type?

> `optional` **type**: `string`

Defined in: [libraries/epub/src/index.tsx:180](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L180)

---

## Element

Defined in: node_modules/@xmldom/xmldom/index.d.ts:842

Element is the most general base class from which all objects in a Document inherit. It only
has methods and properties common to all kinds of elements. More specific classes inherit from
Element.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element)

### Extends

- [`Node`](#node-1)

### Properties

#### ATTRIBUTE_NODE

> `readonly` **ATTRIBUTE_NODE**: `2`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:592

##### Inherited from

`Node.ATTRIBUTE_NODE`

#### attributes

> `readonly` **attributes**: `NamedNodeMap`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:846

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/attributes)

#### baseURI

> `readonly` **baseURI**: `"about:blank"`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:396

Always returns `about:blank` currently.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/baseURI)

##### Inherited from

`Node.baseURI`

#### CDATA_SECTION_NODE

> `readonly` **CDATA_SECTION_NODE**: `4`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:596

node is a CDATASection node.

##### Inherited from

`Node.CDATA_SECTION_NODE`

#### childNodes

> `readonly` **childNodes**: `NodeList`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:374

Returns the children.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/childNodes)

##### Inherited from

`Node.childNodes`

#### children

> `readonly` **children**: `LiveNodeList`\<[`Element`](#element-1)\>

Defined in: node_modules/@xmldom/xmldom/index.d.ts:861

Returns a live collection of the direct child elements of this element.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/children)

##### See

https://dom.spec.whatwg.org/#dom-parentnode-children

#### columnNumber?

> `optional` **columnNumber**: `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:479

One based column position inside the parsed source,
if the `locator` was not disabled.

##### Inherited from

`Node.columnNumber`

#### COMMENT_NODE

> `readonly` **COMMENT_NODE**: `8`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:602

node is a Comment node.

##### Inherited from

`Node.COMMENT_NODE`

#### DOCUMENT_FRAGMENT_NODE

> `readonly` **DOCUMENT_FRAGMENT_NODE**: `11`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:608

node is a DocumentFragment node.

##### Inherited from

`Node.DOCUMENT_FRAGMENT_NODE`

#### DOCUMENT_NODE

> `readonly` **DOCUMENT_NODE**: `9`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:604

node is a document.

##### Inherited from

`Node.DOCUMENT_NODE`

#### DOCUMENT_POSITION_CONTAINED_BY

> `readonly` **DOCUMENT_POSITION_CONTAINED_BY**: `16`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:619

Set when other is a descendant of node.

##### Inherited from

`Node.DOCUMENT_POSITION_CONTAINED_BY`

#### DOCUMENT_POSITION_CONTAINS

> `readonly` **DOCUMENT_POSITION_CONTAINS**: `8`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:617

Set when other is an ancestor of node.

##### Inherited from

`Node.DOCUMENT_POSITION_CONTAINS`

#### DOCUMENT_POSITION_DISCONNECTED

> `readonly` **DOCUMENT_POSITION_DISCONNECTED**: `1`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:611

Set when node and other are not in the same tree.

##### Inherited from

`Node.DOCUMENT_POSITION_DISCONNECTED`

#### DOCUMENT_POSITION_FOLLOWING

> `readonly` **DOCUMENT_POSITION_FOLLOWING**: `4`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:615

Set when other is following node.

##### Inherited from

`Node.DOCUMENT_POSITION_FOLLOWING`

#### DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC

> `readonly` **DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC**: `32`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:620

##### Inherited from

`Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC`

#### DOCUMENT_POSITION_PRECEDING

> `readonly` **DOCUMENT_POSITION_PRECEDING**: `2`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:613

Set when other is preceding node.

##### Inherited from

`Node.DOCUMENT_POSITION_PRECEDING`

#### DOCUMENT_TYPE_NODE

> `readonly` **DOCUMENT_TYPE_NODE**: `10`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:606

node is a doctype.

##### Inherited from

`Node.DOCUMENT_TYPE_NODE`

#### ELEMENT_NODE

> `readonly` **ELEMENT_NODE**: `1`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:591

node is an element.

##### Inherited from

`Node.ELEMENT_NODE`

#### ENTITY_NODE

> `readonly` **ENTITY_NODE**: `6`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:598

##### Inherited from

`Node.ENTITY_NODE`

#### ENTITY_REFERENCE_NODE

> `readonly` **ENTITY_REFERENCE_NODE**: `5`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:597

##### Inherited from

`Node.ENTITY_REFERENCE_NODE`

#### firstChild

> `readonly` **firstChild**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:380

Returns the first child.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/firstChild)

##### Inherited from

`Node.firstChild`

#### isConnected

> `readonly` **isConnected**: `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:402

Returns true if this node is inside of a document or is the document node itself.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/isConnected)

##### Inherited from

`Node.isConnected`

#### lastChild

> `readonly` **lastChild**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:386

Returns the last child.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lastChild)

##### Inherited from

`Node.lastChild`

#### lineNumber?

> `optional` **lineNumber**: `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:474

Zero based line position inside the parsed source,
if the `locator` was not disabled.

##### Inherited from

`Node.lineNumber`

#### localName

> **localName**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:390

The local part of the qualified name of this node.

##### Inherited from

`Node.localName`

#### namespaceURI

> `readonly` **namespaceURI**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:406

The namespace URI of this node.

##### Inherited from

`Node.namespaceURI`

#### nextSibling

> `readonly` **nextSibling**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:412

Returns the next sibling.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nextSibling)

##### Inherited from

`Node.nextSibling`

#### nodeName

> `readonly` **nodeName**: `string`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:418

Returns a string appropriate for the type of node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeName)

##### Inherited from

`Node.nodeName`

#### nodeType

> `readonly` **nodeType**: `1`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:843

Returns the type of node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeType)

##### Overrides

`Node.nodeType`

#### nodeValue

> **nodeValue**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:426

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeValue)

##### Inherited from

`Node.nodeValue`

#### NOTATION_NODE

> `readonly` **NOTATION_NODE**: `12`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:609

##### Inherited from

`Node.NOTATION_NODE`

#### ownerDocument

> `readonly` **ownerDocument**: [`Document`](#document-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:432

Returns the node document. Returns null for documents.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/ownerDocument)

##### Inherited from

`Node.ownerDocument`

#### parentElement

> `readonly` **parentElement**: [`Element`](#element-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:444

Returns the parent `Node` if it is of type `Element`, otherwise `null`.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/parentElement)

##### Inherited from

`Node.parentElement`

#### parentNode

> `readonly` **parentNode**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:438

Returns the parent.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/parentNode)

##### Inherited from

`Node.parentNode`

#### prefix

> **prefix**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:448

The prefix of the namespace for this node.

##### Inherited from

`Node.prefix`

#### previousSibling

> `readonly` **previousSibling**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:454

Returns the previous sibling.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/previousSibling)

##### Inherited from

`Node.previousSibling`

#### PROCESSING_INSTRUCTION_NODE

> `readonly` **PROCESSING_INSTRUCTION_NODE**: `7`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:600

node is a ProcessingInstruction node.

##### Inherited from

`Node.PROCESSING_INSTRUCTION_NODE`

#### tagName

> `readonly` **tagName**: `string`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:852

Returns the HTML-uppercased qualified name.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/tagName)

#### TEXT_NODE

> `readonly` **TEXT_NODE**: `3`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:594

node is a Text node.

##### Inherited from

`Node.TEXT_NODE`

#### textContent

> **textContent**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:468

The text content of this node and its descendants.

For [Element](#element-1) and DocumentFragment nodes, returns the concatenation of the
`nodeValue` of every descendant text node, excluding processing instruction and comment
nodes. For all other node types, returns `nodeValue`.

Setting `textContent` on an element or document fragment replaces all child nodes with a
single text node; on other nodes it sets `data`, `value`, and `nodeValue` directly.
[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/textContent)

##### See

[https://dom.spec.whatwg.org/#dom-node-textcontent](https://dom.spec.whatwg.org/#dom-node-textcontent)

##### Inherited from

`Node.textContent`

### Methods

#### appendChild()

> **appendChild**(`node`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:482

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/appendChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `node`    | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.appendChild`

#### cloneNode()

> **cloneNode**(`deep?`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:533

Returns a copy of node. If deep is true, the copy also includes the node's descendants.

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `deep?`   | `boolean` |

##### Returns

[`Node`](#node-1)

##### Throws

May throw a DOMException if operations within [Element#setAttributeNode](#setattributenode) or
[Node#appendChild](#appendchild-8) (which are potentially invoked in this method) do not meet their
specific constraints.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/cloneNode)

##### Inherited from

`Node.cloneNode`

#### compareDocumentPosition()

> **compareDocumentPosition**(`other`): `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:540

Returns a bitmask indicating the position of other relative to node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/compareDocumentPosition)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`number`

##### Inherited from

`Node.compareDocumentPosition`

#### contains()

> **contains**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:489

Checks whether `other` is an inclusive descendant of this node.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/contains)

##### Parameters

| Parameter | Type                                       |
| --------- | ------------------------------------------ |
| `other`   | [`Node`](#node-1) \| `null` \| `undefined` |

##### Returns

`boolean`

##### Inherited from

`Node.contains`

#### getAttribute()

> **getAttribute**(`qualifiedName`): `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:869

Returns element's first attribute whose qualified name is qualifiedName, and null if there
is no such attribute otherwise.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/getAttribute)

##### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `qualifiedName` | `string` |

##### Returns

`string` \| `null`

#### getAttributeNames()

> **getAttributeNames**(): `string`[]

Defined in: node_modules/@xmldom/xmldom/index.d.ts:882

Returns the qualified names of all element's attributes. Can contain duplicates.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/getAttributeNames)

##### Returns

`string`[]

#### getAttributeNode()

> **getAttributeNode**(`qualifiedName`): [`Attr`](#attr-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:884

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/getAttributeNode)

##### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `qualifiedName` | `string` |

##### Returns

[`Attr`](#attr-1) \| `null`

#### getAttributeNodeNS()

> **getAttributeNodeNS**(`namespace`, `localName`): [`Attr`](#attr-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:886

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/getAttributeNodeNS)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |
| `localName` | `string`           |

##### Returns

[`Attr`](#attr-1) \| `null`

#### getAttributeNS()

> **getAttributeNS**(`namespace`, `localName`): `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:876

Returns element's attribute whose namespace is namespace and local name is localName, and
null if there is no such attribute otherwise.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/getAttributeNS)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |
| `localName` | `string`           |

##### Returns

`string` \| `null`

#### getElementsByClassName()

> **getElementsByClassName**(`classNames`): `LiveNodeList`\<[`Element`](#element-1)\>

Defined in: node_modules/@xmldom/xmldom/index.d.ts:905

Returns a LiveNodeList of all child elements which have **all** of the given class
name(s).

Returns an empty list if `classNames` is an empty string or only contains HTML white space
characters.

Warning: This returns a live LiveNodeList.
Changes in the DOM will reflect in the array as the changes occur.
If an element selected by this array no longer qualifies for the selector,
it will automatically be removed. Be aware of this for iteration purposes.

##### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `classNames` | `string` |

##### Returns

`LiveNodeList`\<[`Element`](#element-1)\>

##### See

- https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByClassName
- https://dom.spec.whatwg.org/#concept-getelementsbyclassname

#### getElementsByTagName()

> **getElementsByTagName**(`qualifiedName`): `LiveNodeList`\<[`Element`](#element-1)\>

Defined in: node_modules/@xmldom/xmldom/index.d.ts:929

Returns a LiveNodeList of elements with the given qualifiedName.
Searching for all descendants can be done by passing `*` as `qualifiedName`.

All descendants of the specified element are searched, but not the element itself.
The returned list is live, which means it updates itself with the DOM tree automatically.
Therefore, there is no need to call `Element.getElementsByTagName()`
with the same element and arguments repeatedly if the DOM changes in between calls.

When called on an HTML element in an HTML document,
`getElementsByTagName` lower-cases the argument before searching for it.
This is undesirable when trying to match camel-cased SVG elements (such as
`<linearGradient>`) in an HTML document.
Instead, use `Element.getElementsByTagNameNS()`,
which preserves the capitalization of the tag name.

`Element.getElementsByTagName` is similar to `Document.getElementsByTagName()`,
except that it only searches for elements that are descendants of the specified element.

##### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `qualifiedName` | `string` |

##### Returns

`LiveNodeList`\<[`Element`](#element-1)\>

##### See

- https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByTagName
- https://dom.spec.whatwg.org/#concept-getelementsbytagname

#### getElementsByTagNameNS()

> **getElementsByTagNameNS**(`namespaceURI`, `localName`): `LiveNodeList`\<[`Element`](#element-1)\>

Defined in: node_modules/@xmldom/xmldom/index.d.ts:938

Returns a `LiveNodeList` of elements with the given tag name belonging to the given
namespace. It is similar to `Document.getElementsByTagNameNS`, except that its search is
restricted to descendants of the specified element.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/getElementsByTagNameNS)

##### Parameters

| Parameter      | Type               |
| -------------- | ------------------ |
| `namespaceURI` | `string` \| `null` |
| `localName`    | `string`           |

##### Returns

`LiveNodeList`\<[`Element`](#element-1)\>

#### getQualifiedName()

> **getQualifiedName**(): `string`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:943

##### Returns

`string`

#### getRootNode()

> **getRootNode**(`options`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:502

Searches for the root node of this node.

**This behavior is slightly different from the one in the specs**:

- ignores `options.composed`, since `ShadowRoot`s are unsupported, therefore always
  returning root.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/getRootNode)

##### Parameters

| Parameter | Type                 |
| --------- | -------------------- |
| `options` | `GetRootNodeOptions` |

##### Returns

[`Node`](#node-1)

##### See

- https://dom.spec.whatwg.org/#dom-node-getrootnode
- https://dom.spec.whatwg.org/#concept-shadow-including-root

##### Inherited from

`Node.getRootNode`

#### hasAttribute()

> **hasAttribute**(`qualifiedName`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:950

Returns true if element has an attribute whose qualified name is qualifiedName, and false
otherwise.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/hasAttribute)

##### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `qualifiedName` | `string` |

##### Returns

`boolean`

#### hasAttributeNS()

> **hasAttributeNS**(`namespace`, `localName`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:957

Returns true if element has an attribute whose namespace is namespace and local name is
localName.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/hasAttributeNS)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |
| `localName` | `string`           |

##### Returns

`boolean`

#### hasAttributes()

> **hasAttributes**(): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:963

Returns true if element has attributes, and false otherwise.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/hasAttributes)

##### Returns

`boolean`

#### hasChildNodes()

> **hasChildNodes**(): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:547

Returns whether node has children.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/hasChildNodes)

##### Returns

`boolean`

##### Inherited from

`Node.hasChildNodes`

#### insertBefore()

> **insertBefore**(`node`, `child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:550

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/insertBefore)

##### Parameters

| Parameter | Type                        |
| --------- | --------------------------- |
| `node`    | [`Node`](#node-1)           |
| `child`   | [`Node`](#node-1) \| `null` |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.insertBefore`

#### isDefaultNamespace()

> **isDefaultNamespace**(`namespace`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:553

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/isDefaultNamespace)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |

##### Returns

`boolean`

##### Inherited from

`Node.isDefaultNamespace`

#### isEqualNode()

> **isEqualNode**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:514

Checks whether the given node is equal to this node.

Two nodes are equal when they have the same type, defining characteristics (for the type),
and the same `childNodes`. The comparison is iterative to avoid stack overflows on deeply
nested trees. `Attribute` nodes of each `Element` pair are also compared iteratively.

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`boolean`

##### See

- [https://dom.spec.whatwg.org/#concept-node-equals](https://dom.spec.whatwg.org/#concept-node-equals)
- [https://developer.mozilla.org/en-US/docs/Web/API/Node/isEqualNode](https://developer.mozilla.org/en-US/docs/Web/API/Node/isEqualNode)

##### Inherited from

`Node.isEqualNode`

#### isSameNode()

> **isSameNode**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:521

Checks whether the given node is this node.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/isSameNode)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`boolean`

##### Inherited from

`Node.isSameNode`

#### ~~isSupported()~~

> **isSupported**(`feature`, `version`): `true`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:568

Checks whether the DOM implementation implements a specific feature and its version.

##### Parameters

| Parameter | Type     | Description                                                                                                                          |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `feature` | `string` | The package name of the feature to test. This is the same name that can be passed to the method `hasFeature` on `DOMImplementation`. |
| `version` | `string` | This is the version number of the package name to test.                                                                              |

##### Returns

`true`

##### Deprecated

Since `DOMImplementation.hasFeature` is deprecated and always returns true.

##### Since

Introduced in DOM Level 2

##### See

DOMImplementation.hasFeature

##### Inherited from

`Node.isSupported`

#### lookupNamespaceURI()

> **lookupNamespaceURI**(`prefix`): `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:571

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lookupNamespaceURI)

##### Parameters

| Parameter | Type               |
| --------- | ------------------ |
| `prefix`  | `string` \| `null` |

##### Returns

`string` \| `null`

##### Inherited from

`Node.lookupNamespaceURI`

#### lookupPrefix()

> **lookupPrefix**(`namespace`): `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:574

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lookupPrefix)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |

##### Returns

`string` \| `null`

##### Inherited from

`Node.lookupPrefix`

#### normalize()

> **normalize**(): `void`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:582

Removes empty exclusive Text nodes and concatenates the data of remaining contiguous
exclusive Text nodes into the first of their nodes.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/normalize)

##### Returns

`void`

##### Inherited from

`Node.normalize`

#### removeAttribute()

> **removeAttribute**(`qualifiedName`): `void`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:969

Removes element's first attribute whose qualified name is qualifiedName.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/removeAttribute)

##### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `qualifiedName` | `string` |

##### Returns

`void`

#### removeAttributeNode()

> **removeAttributeNode**(`attr`): [`Attr`](#attr-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:977

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/removeAttributeNode)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `attr`    | [`Attr`](#attr-1) |

##### Returns

[`Attr`](#attr-1)

#### removeAttributeNS()

> **removeAttributeNS**(`namespace`, `localName`): `void`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:975

Removes element's attribute whose namespace is namespace and local name is localName.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/removeAttributeNS)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |
| `localName` | `string`           |

##### Returns

`void`

#### removeChild()

> **removeChild**(`child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:585

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/removeChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `child`   | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.removeChild`

#### replaceChild()

> **replaceChild**(`node`, `child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:588

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/replaceChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `node`    | [`Node`](#node-1) |
| `child`   | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

##### Inherited from

`Node.replaceChild`

#### setAttribute()

> **setAttribute**(`qualifiedName`, `value`): `void`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:983

Sets the value of element's first attribute whose qualified name is qualifiedName to value.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/setAttribute)

##### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `qualifiedName` | `string` |
| `value`         | `string` |

##### Returns

`void`

#### setAttributeNode()

> **setAttributeNode**(`attr`): [`Attr`](#attr-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:996

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/setAttributeNode)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `attr`    | [`Attr`](#attr-1) |

##### Returns

[`Attr`](#attr-1) \| `null`

#### setAttributeNodeNS()

> **setAttributeNodeNS**(`attr`): [`Attr`](#attr-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:998

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/setAttributeNodeNS)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `attr`    | [`Attr`](#attr-1) |

##### Returns

[`Attr`](#attr-1) \| `null`

#### setAttributeNS()

> **setAttributeNS**(`namespace`, `qualifiedName`, `value`): `void`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:990

Sets the value of element's attribute whose namespace is namespace and local name is
localName to value.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element/setAttributeNS)

##### Parameters

| Parameter       | Type               |
| --------------- | ------------------ |
| `namespace`     | `string` \| `null` |
| `qualifiedName` | `string`           |
| `value`         | `string`           |

##### Returns

`void`

---

## Epub2UpgradeOptions

Defined in: [libraries/epub/src/upgrade.tsx:76](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/upgrade.tsx#L76)

### Properties

#### outputPath?

> `optional` **outputPath**: `string`

Defined in: [libraries/epub/src/upgrade.tsx:80](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/upgrade.tsx#L80)

The path to the output file. If provided, the input file will be copied to the output path.

#### removeNcx?

> `optional` **removeNcx**: `boolean`

Defined in: [libraries/epub/src/upgrade.tsx:84](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/upgrade.tsx#L84)

Whether to remove the NCX file, as it's technically optional in EPUB 3.

---

## EpubIdentifier

Defined in: [libraries/epub/src/index.tsx:132](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L132)

### Properties

#### id?

> `optional` **id**: `string`

Defined in: [libraries/epub/src/index.tsx:134](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L134)

#### identifierType?

> `optional` **identifierType**: `string`

Defined in: [libraries/epub/src/index.tsx:136](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L136)

the value of a refining `identifier-type` meta, if present

#### scheme?

> `optional` **scheme**: `string`

Defined in: [libraries/epub/src/index.tsx:138](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L138)

the `scheme` of a refining `identifier-type` meta, or a legacy `opf:scheme` attribute

#### value

> **value**: `string`

Defined in: [libraries/epub/src/index.tsx:133](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L133)

---

## EpubListEntry

Defined in: [libraries/epub/src/adapters/interface.ts:39](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L39)

### Properties

#### absolutePath

> **absolutePath**: `string`

Defined in: [libraries/epub/src/adapters/interface.ts:41](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L41)

location the adapter can read the entry back from, in whatever form it stores

#### relativePath

> **relativePath**: `string`

Defined in: [libraries/epub/src/adapters/interface.ts:43](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L43)

the entry name, as it appears in the archive

---

## EpubSource

Defined in: [libraries/epub/src/index.tsx:141](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L141)

### Properties

#### id?

> `optional` **id**: `string`

Defined in: [libraries/epub/src/index.tsx:143](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L143)

#### identifierType?

> `optional` **identifierType**: `string`

Defined in: [libraries/epub/src/index.tsx:145](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L145)

the value of a refining `identifier-type` meta, if present

#### isPageBreakSource?

> `optional` **isPageBreakSource**: `boolean`

Defined in: [libraries/epub/src/index.tsx:156](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L156)

whether this source has a `source-of="pagination"` refinement
or of a `<meta property="pageBreakSource">` element

as of EPUB 3.4 `source-of` is advised-deprecated in favour of the
publication-level `pageBreakSource` property. if you want to
be sure to get the source of pagination, use [Epub.getPageBreakSource](#getpagebreaksource)

#### scheme?

> `optional` **scheme**: `string`

Defined in: [libraries/epub/src/index.tsx:147](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L147)

the `scheme` of a refining `identifier-type` meta, or a legacy `opf:scheme` attribute

#### value

> **value**: `string`

Defined in: [libraries/epub/src/index.tsx:142](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L142)

---

## EpubStorageAdapter

Defined in: [libraries/epub/src/adapters/interface.ts:56](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L56)

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

Defined in: [libraries/epub/src/adapters/interface.ts:71](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L71)

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

Defined in: [libraries/epub/src/adapters/interface.ts:90](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L90)

Always called on close or error

##### Returns

`void` \| `Promise`\<`void`\>

#### duplicate()?

> `optional` **duplicate**(): `Promise`\<[`EpubStorageAdapter`](#epubstorageadapter)\>

Defined in: [libraries/epub/src/adapters/interface.ts:84](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L84)

Required for Epub.copy

##### Returns

`Promise`\<[`EpubStorageAdapter`](#epubstorageadapter)\>

#### exists()

> **exists**(`entry`): `Promise`\<`boolean`\>

Defined in: [libraries/epub/src/adapters/interface.ts:65](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L65)

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

Defined in: [libraries/epub/src/adapters/interface.ts:81](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L81)

Required for Epub.saveAndClose to walk the contents

##### Returns

`AsyncIterable`\<[`EpubListEntry`](#epublistentry)\>

#### read()

##### Call Signature

> **read**(`entry`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [libraries/epub/src/adapters/interface.ts:57](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L57)

###### Parameters

| Parameter | Type     |
| --------- | -------- |
| `entry`   | `string` |

###### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

##### Call Signature

> **read**(`entry`, `encoding`): `Promise`\<`string`\>

Defined in: [libraries/epub/src/adapters/interface.ts:58](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L58)

###### Parameters

| Parameter  | Type      |
| ---------- | --------- |
| `entry`    | `string`  |
| `encoding` | `"utf-8"` |

###### Returns

`Promise`\<`string`\>

#### remove()?

> `optional` **remove**(`entry`): `Promise`\<`void`\>

Defined in: [libraries/epub/src/adapters/interface.ts:78](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L78)

Required for removeManifestItem / setCoverImage replacement

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `entry`   | `string` |

##### Returns

`Promise`\<`void`\>

#### serialize()?

> `optional` **serialize**(`targetPath`): `Promise`\<`void`\>

Defined in: [libraries/epub/src/adapters/interface.ts:87](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L87)

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

Defined in: [libraries/epub/src/adapters/interface.ts:74](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L74)

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

Defined in: [libraries/epub/src/adapters/interface.ts:75](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L75)

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

Defined in: [libraries/epub/src/adapters/interface.ts:93](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L93)

### Type Parameters

| Type Parameter            | Default type |
| ------------------------- | ------------ |
| `Opts` _extends_ `object` | `object`     |

### Properties

#### capabilities

> `readonly` **capabilities**: [`EpubStorageCapabilities`](#epubstoragecapabilities)

Defined in: [libraries/epub/src/adapters/interface.ts:95](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L95)

#### kind

> `readonly` **kind**: [`EpubStorageKind`](#epubstoragekind)

Defined in: [libraries/epub/src/adapters/interface.ts:94](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L94)

### Methods

#### init()

> **init**(`source`, `opts?`): `Promise`\<[`EpubStorageAdapter`](#epubstorageadapter)\>

Defined in: [libraries/epub/src/adapters/interface.ts:101](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L101)

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

Defined in: [libraries/epub/src/adapters/interface.ts:107](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L107)

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

Defined in: [libraries/epub/src/adapters/interface.ts:34](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L34)

### Properties

#### writable

> `readonly` **writable**: `boolean`

Defined in: [libraries/epub/src/adapters/interface.ts:36](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L36)

when false, the Epub class refuses every mutation method at runtime

---

## FromOptions

Defined in: [libraries/epub/src/index.tsx:210](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L210)

### Properties

#### readonly?

> `optional` **readonly**: `boolean`

Defined in: [libraries/epub/src/index.tsx:215](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L215)

when true, mutation methods throw [EpubReadOnlyError](#epubreadonlyerror) at runtime

##### Default

```ts
false;
```

---

## GuideItem

Defined in: [libraries/epub/src/index.tsx:204](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L204)

### Properties

#### href

> **href**: `string`

Defined in: [libraries/epub/src/index.tsx:205](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L205)

#### title

> **title**: `string`

Defined in: [libraries/epub/src/index.tsx:206](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L206)

#### type

> **type**: `string`

Defined in: [libraries/epub/src/index.tsx:207](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L207)

---

## Landmark

Defined in: [libraries/epub/src/upgrade.tsx:70](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/upgrade.tsx#L70)

### Properties

#### href

> **href**: `string`

Defined in: [libraries/epub/src/upgrade.tsx:71](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/upgrade.tsx#L71)

#### title

> **title**: `string`

Defined in: [libraries/epub/src/upgrade.tsx:72](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/upgrade.tsx#L72)

#### type

> **type**: `string`

Defined in: [libraries/epub/src/upgrade.tsx:73](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/upgrade.tsx#L73)

---

## MemoryAdapterOptions

Defined in: [libraries/epub/src/adapters/memory.ts:13](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/memory.ts#L13)

### Properties

#### cache?

> `optional` **cache**: `boolean`

Defined in: [libraries/epub/src/adapters/memory.ts:20](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/memory.ts#L20)

per-entry decompressed buffer cache
turn it off when opening many EPUBs and reading each entry at most once
keeps resident size bounded by the entry index, not the decompressed payload sum

##### Default

```ts
true;
```

#### signal?

> `optional` **signal**: `AbortSignal`

Defined in: [libraries/epub/src/adapters/memory.ts:21](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/memory.ts#L21)

---

## Navigation

Defined in: [libraries/epub/src/index.tsx:198](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L198)

### Properties

#### children

> **children**: [`NavigationList`](#navigationlist)

Defined in: [libraries/epub/src/index.tsx:201](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L201)

#### role

> **role**: `string`

Defined in: [libraries/epub/src/index.tsx:200](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L200)

#### title?

> `optional` **title**: `string`

Defined in: [libraries/epub/src/index.tsx:199](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L199)

---

## NavigationItem

Defined in: [libraries/epub/src/index.tsx:189](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L189)

### Properties

#### children?

> `optional` **children**: [`NavigationList`](#navigationlist)

Defined in: [libraries/epub/src/index.tsx:193](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L193)

#### href?

> `optional` **href**: `string`

Defined in: [libraries/epub/src/index.tsx:191](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L191)

#### role?

> `optional` **role**: `string`

Defined in: [libraries/epub/src/index.tsx:192](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L192)

#### title

> **title**: `string`

Defined in: [libraries/epub/src/index.tsx:190](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L190)

---

## Node

Defined in: node_modules/@xmldom/xmldom/index.d.ts:368

The DOM Node interface is an abstract base class upon which many other DOM API objects are
based, thus letting those object types to be used similarly and often interchangeably. As an
abstract class, there is no such thing as a plain Node object. All objects that implement
Node functionality are based on one of its subclasses. Most notable are Document, Element,
and DocumentFragment.

In addition, every kind of DOM node is represented by an interface based on Node. These
include Attr, CharacterData (which Text, Comment, CDATASection and ProcessingInstruction are
all based on), and DocumentType.

In some cases, a particular feature of the base Node interface may not apply to one of its
child interfaces; in that case, the inheriting node may return null or throw an exception,
depending on circumstances. For example, attempting to add children to a node type that
cannot have children will throw an exception.

**This behavior is slightly different from the in the specs**:

- unimplemented interfaces: EventTarget

### See

- http://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/core.html#ID-1950641247
- https://dom.spec.whatwg.org/#node

### Prettierignore

### Properties

#### ATTRIBUTE_NODE

> `readonly` **ATTRIBUTE_NODE**: `2`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:592

#### baseURI

> `readonly` **baseURI**: `"about:blank"`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:396

Always returns `about:blank` currently.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/baseURI)

#### CDATA_SECTION_NODE

> `readonly` **CDATA_SECTION_NODE**: `4`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:596

node is a CDATASection node.

#### childNodes

> `readonly` **childNodes**: `NodeList`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:374

Returns the children.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/childNodes)

#### columnNumber?

> `optional` **columnNumber**: `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:479

One based column position inside the parsed source,
if the `locator` was not disabled.

#### COMMENT_NODE

> `readonly` **COMMENT_NODE**: `8`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:602

node is a Comment node.

#### DOCUMENT_FRAGMENT_NODE

> `readonly` **DOCUMENT_FRAGMENT_NODE**: `11`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:608

node is a DocumentFragment node.

#### DOCUMENT_NODE

> `readonly` **DOCUMENT_NODE**: `9`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:604

node is a document.

#### DOCUMENT_POSITION_CONTAINED_BY

> `readonly` **DOCUMENT_POSITION_CONTAINED_BY**: `16`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:619

Set when other is a descendant of node.

#### DOCUMENT_POSITION_CONTAINS

> `readonly` **DOCUMENT_POSITION_CONTAINS**: `8`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:617

Set when other is an ancestor of node.

#### DOCUMENT_POSITION_DISCONNECTED

> `readonly` **DOCUMENT_POSITION_DISCONNECTED**: `1`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:611

Set when node and other are not in the same tree.

#### DOCUMENT_POSITION_FOLLOWING

> `readonly` **DOCUMENT_POSITION_FOLLOWING**: `4`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:615

Set when other is following node.

#### DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC

> `readonly` **DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC**: `32`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:620

#### DOCUMENT_POSITION_PRECEDING

> `readonly` **DOCUMENT_POSITION_PRECEDING**: `2`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:613

Set when other is preceding node.

#### DOCUMENT_TYPE_NODE

> `readonly` **DOCUMENT_TYPE_NODE**: `10`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:606

node is a doctype.

#### ELEMENT_NODE

> `readonly` **ELEMENT_NODE**: `1`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:591

node is an element.

#### ENTITY_NODE

> `readonly` **ENTITY_NODE**: `6`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:598

#### ENTITY_REFERENCE_NODE

> `readonly` **ENTITY_REFERENCE_NODE**: `5`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:597

#### firstChild

> `readonly` **firstChild**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:380

Returns the first child.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/firstChild)

#### isConnected

> `readonly` **isConnected**: `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:402

Returns true if this node is inside of a document or is the document node itself.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/isConnected)

#### lastChild

> `readonly` **lastChild**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:386

Returns the last child.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lastChild)

#### lineNumber?

> `optional` **lineNumber**: `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:474

Zero based line position inside the parsed source,
if the `locator` was not disabled.

#### localName

> **localName**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:390

The local part of the qualified name of this node.

#### namespaceURI

> `readonly` **namespaceURI**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:406

The namespace URI of this node.

#### nextSibling

> `readonly` **nextSibling**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:412

Returns the next sibling.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nextSibling)

#### nodeName

> `readonly` **nodeName**: `string`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:418

Returns a string appropriate for the type of node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeName)

#### nodeType

> `readonly` **nodeType**: `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:424

Returns the type of node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeType)

#### nodeValue

> **nodeValue**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:426

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeValue)

#### NOTATION_NODE

> `readonly` **NOTATION_NODE**: `12`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:609

#### ownerDocument

> `readonly` **ownerDocument**: [`Document`](#document-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:432

Returns the node document. Returns null for documents.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/ownerDocument)

#### parentElement

> `readonly` **parentElement**: [`Element`](#element-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:444

Returns the parent `Node` if it is of type `Element`, otherwise `null`.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/parentElement)

#### parentNode

> `readonly` **parentNode**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:438

Returns the parent.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/parentNode)

#### prefix

> **prefix**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:448

The prefix of the namespace for this node.

#### previousSibling

> `readonly` **previousSibling**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:454

Returns the previous sibling.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/previousSibling)

#### PROCESSING_INSTRUCTION_NODE

> `readonly` **PROCESSING_INSTRUCTION_NODE**: `7`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:600

node is a ProcessingInstruction node.

#### TEXT_NODE

> `readonly` **TEXT_NODE**: `3`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:594

node is a Text node.

#### textContent

> **textContent**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:468

The text content of this node and its descendants.

For [Element](#element-1) and DocumentFragment nodes, returns the concatenation of the
`nodeValue` of every descendant text node, excluding processing instruction and comment
nodes. For all other node types, returns `nodeValue`.

Setting `textContent` on an element or document fragment replaces all child nodes with a
single text node; on other nodes it sets `data`, `value`, and `nodeValue` directly.
[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/textContent)

##### See

[https://dom.spec.whatwg.org/#dom-node-textcontent](https://dom.spec.whatwg.org/#dom-node-textcontent)

### Methods

#### appendChild()

> **appendChild**(`node`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:482

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/appendChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `node`    | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

#### cloneNode()

> **cloneNode**(`deep?`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:533

Returns a copy of node. If deep is true, the copy also includes the node's descendants.

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `deep?`   | `boolean` |

##### Returns

[`Node`](#node-1)

##### Throws

May throw a DOMException if operations within [Element#setAttributeNode](#setattributenode) or
[Node#appendChild](#appendchild-8) (which are potentially invoked in this method) do not meet their
specific constraints.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/cloneNode)

#### compareDocumentPosition()

> **compareDocumentPosition**(`other`): `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:540

Returns a bitmask indicating the position of other relative to node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/compareDocumentPosition)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`number`

#### contains()

> **contains**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:489

Checks whether `other` is an inclusive descendant of this node.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/contains)

##### Parameters

| Parameter | Type                                       |
| --------- | ------------------------------------------ |
| `other`   | [`Node`](#node-1) \| `null` \| `undefined` |

##### Returns

`boolean`

#### getRootNode()

> **getRootNode**(`options`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:502

Searches for the root node of this node.

**This behavior is slightly different from the one in the specs**:

- ignores `options.composed`, since `ShadowRoot`s are unsupported, therefore always
  returning root.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/getRootNode)

##### Parameters

| Parameter | Type                 |
| --------- | -------------------- |
| `options` | `GetRootNodeOptions` |

##### Returns

[`Node`](#node-1)

##### See

- https://dom.spec.whatwg.org/#dom-node-getrootnode
- https://dom.spec.whatwg.org/#concept-shadow-including-root

#### hasChildNodes()

> **hasChildNodes**(): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:547

Returns whether node has children.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/hasChildNodes)

##### Returns

`boolean`

#### insertBefore()

> **insertBefore**(`node`, `child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:550

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/insertBefore)

##### Parameters

| Parameter | Type                        |
| --------- | --------------------------- |
| `node`    | [`Node`](#node-1)           |
| `child`   | [`Node`](#node-1) \| `null` |

##### Returns

[`Node`](#node-1)

#### isDefaultNamespace()

> **isDefaultNamespace**(`namespace`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:553

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/isDefaultNamespace)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |

##### Returns

`boolean`

#### isEqualNode()

> **isEqualNode**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:514

Checks whether the given node is equal to this node.

Two nodes are equal when they have the same type, defining characteristics (for the type),
and the same `childNodes`. The comparison is iterative to avoid stack overflows on deeply
nested trees. `Attribute` nodes of each `Element` pair are also compared iteratively.

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`boolean`

##### See

- [https://dom.spec.whatwg.org/#concept-node-equals](https://dom.spec.whatwg.org/#concept-node-equals)
- [https://developer.mozilla.org/en-US/docs/Web/API/Node/isEqualNode](https://developer.mozilla.org/en-US/docs/Web/API/Node/isEqualNode)

#### isSameNode()

> **isSameNode**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:521

Checks whether the given node is this node.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/isSameNode)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`boolean`

#### ~~isSupported()~~

> **isSupported**(`feature`, `version`): `true`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:568

Checks whether the DOM implementation implements a specific feature and its version.

##### Parameters

| Parameter | Type     | Description                                                                                                                          |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `feature` | `string` | The package name of the feature to test. This is the same name that can be passed to the method `hasFeature` on `DOMImplementation`. |
| `version` | `string` | This is the version number of the package name to test.                                                                              |

##### Returns

`true`

##### Deprecated

Since `DOMImplementation.hasFeature` is deprecated and always returns true.

##### Since

Introduced in DOM Level 2

##### See

DOMImplementation.hasFeature

#### lookupNamespaceURI()

> **lookupNamespaceURI**(`prefix`): `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:571

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lookupNamespaceURI)

##### Parameters

| Parameter | Type               |
| --------- | ------------------ |
| `prefix`  | `string` \| `null` |

##### Returns

`string` \| `null`

#### lookupPrefix()

> **lookupPrefix**(`namespace`): `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:574

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lookupPrefix)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |

##### Returns

`string` \| `null`

#### normalize()

> **normalize**(): `void`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:582

Removes empty exclusive Text nodes and concatenates the data of remaining contiguous
exclusive Text nodes into the first of their nodes.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/normalize)

##### Returns

`void`

#### removeChild()

> **removeChild**(`child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:585

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/removeChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `child`   | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

#### replaceChild()

> **replaceChild**(`node`, `child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:588

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/replaceChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `node`    | [`Node`](#node-1) |
| `child`   | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

---

## Text

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1051

The textual content of Element or Attr. If an element has no markup within its content, it has
a single child implementing Text that contains the element's text. However, if the element
contains markup, it is parsed into information items and Text nodes that form its children.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Text)

### Extends

- `CharacterData`

### Properties

#### ATTRIBUTE_NODE

> `readonly` **ATTRIBUTE_NODE**: `2`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:592

##### Inherited from

`CharacterData.ATTRIBUTE_NODE`

#### baseURI

> `readonly` **baseURI**: `"about:blank"`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:396

Always returns `about:blank` currently.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/baseURI)

##### Inherited from

`CharacterData.baseURI`

#### CDATA_SECTION_NODE

> `readonly` **CDATA_SECTION_NODE**: `4`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:596

node is a CDATASection node.

##### Inherited from

`CharacterData.CDATA_SECTION_NODE`

#### childNodes

> `readonly` **childNodes**: `NodeList`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:374

Returns the children.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/childNodes)

##### Inherited from

`CharacterData.childNodes`

#### columnNumber?

> `optional` **columnNumber**: `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:479

One based column position inside the parsed source,
if the `locator` was not disabled.

##### Inherited from

`CharacterData.columnNumber`

#### COMMENT_NODE

> `readonly` **COMMENT_NODE**: `8`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:602

node is a Comment node.

##### Inherited from

`CharacterData.COMMENT_NODE`

#### data

> **data**: `string`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1019

[MDN Reference](https://developer.mozilla.org/docs/Web/API/CharacterData/data)

##### Inherited from

`CharacterData.data`

#### DOCUMENT_FRAGMENT_NODE

> `readonly` **DOCUMENT_FRAGMENT_NODE**: `11`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:608

node is a DocumentFragment node.

##### Inherited from

`CharacterData.DOCUMENT_FRAGMENT_NODE`

#### DOCUMENT_NODE

> `readonly` **DOCUMENT_NODE**: `9`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:604

node is a document.

##### Inherited from

`CharacterData.DOCUMENT_NODE`

#### DOCUMENT_POSITION_CONTAINED_BY

> `readonly` **DOCUMENT_POSITION_CONTAINED_BY**: `16`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:619

Set when other is a descendant of node.

##### Inherited from

`CharacterData.DOCUMENT_POSITION_CONTAINED_BY`

#### DOCUMENT_POSITION_CONTAINS

> `readonly` **DOCUMENT_POSITION_CONTAINS**: `8`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:617

Set when other is an ancestor of node.

##### Inherited from

`CharacterData.DOCUMENT_POSITION_CONTAINS`

#### DOCUMENT_POSITION_DISCONNECTED

> `readonly` **DOCUMENT_POSITION_DISCONNECTED**: `1`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:611

Set when node and other are not in the same tree.

##### Inherited from

`CharacterData.DOCUMENT_POSITION_DISCONNECTED`

#### DOCUMENT_POSITION_FOLLOWING

> `readonly` **DOCUMENT_POSITION_FOLLOWING**: `4`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:615

Set when other is following node.

##### Inherited from

`CharacterData.DOCUMENT_POSITION_FOLLOWING`

#### DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC

> `readonly` **DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC**: `32`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:620

##### Inherited from

`CharacterData.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC`

#### DOCUMENT_POSITION_PRECEDING

> `readonly` **DOCUMENT_POSITION_PRECEDING**: `2`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:613

Set when other is preceding node.

##### Inherited from

`CharacterData.DOCUMENT_POSITION_PRECEDING`

#### DOCUMENT_TYPE_NODE

> `readonly` **DOCUMENT_TYPE_NODE**: `10`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:606

node is a doctype.

##### Inherited from

`CharacterData.DOCUMENT_TYPE_NODE`

#### ELEMENT_NODE

> `readonly` **ELEMENT_NODE**: `1`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:591

node is an element.

##### Inherited from

`CharacterData.ELEMENT_NODE`

#### ENTITY_NODE

> `readonly` **ENTITY_NODE**: `6`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:598

##### Inherited from

`CharacterData.ENTITY_NODE`

#### ENTITY_REFERENCE_NODE

> `readonly` **ENTITY_REFERENCE_NODE**: `5`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:597

##### Inherited from

`CharacterData.ENTITY_REFERENCE_NODE`

#### firstChild

> `readonly` **firstChild**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:380

Returns the first child.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/firstChild)

##### Inherited from

`CharacterData.firstChild`

#### isConnected

> `readonly` **isConnected**: `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:402

Returns true if this node is inside of a document or is the document node itself.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/isConnected)

##### Inherited from

`CharacterData.isConnected`

#### lastChild

> `readonly` **lastChild**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:386

Returns the last child.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lastChild)

##### Inherited from

`CharacterData.lastChild`

#### length

> `readonly` **length**: `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1021

[MDN Reference](https://developer.mozilla.org/docs/Web/API/CharacterData/length)

##### Inherited from

`CharacterData.length`

#### lineNumber?

> `optional` **lineNumber**: `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:474

Zero based line position inside the parsed source,
if the `locator` was not disabled.

##### Inherited from

`CharacterData.lineNumber`

#### localName

> **localName**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:390

The local part of the qualified name of this node.

##### Inherited from

`CharacterData.localName`

#### namespaceURI

> `readonly` **namespaceURI**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:406

The namespace URI of this node.

##### Inherited from

`CharacterData.namespaceURI`

#### nextSibling

> `readonly` **nextSibling**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:412

Returns the next sibling.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nextSibling)

##### Inherited from

`CharacterData.nextSibling`

#### nodeName

> **nodeName**: `"#text"` \| `"#cdata-section"`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1052

Returns a string appropriate for the type of node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeName)

##### Overrides

`CharacterData.nodeName`

#### nodeType

> **nodeType**: `3` \| `4`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1053

Returns the type of node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeType)

##### Overrides

`CharacterData.nodeType`

#### nodeValue

> **nodeValue**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:426

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/nodeValue)

##### Inherited from

`CharacterData.nodeValue`

#### NOTATION_NODE

> `readonly` **NOTATION_NODE**: `12`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:609

##### Inherited from

`CharacterData.NOTATION_NODE`

#### ownerDocument

> `readonly` **ownerDocument**: [`Document`](#document-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1022

Returns the node document. Returns null for documents.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/ownerDocument)

##### Inherited from

`CharacterData.ownerDocument`

#### parentElement

> `readonly` **parentElement**: [`Element`](#element-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:444

Returns the parent `Node` if it is of type `Element`, otherwise `null`.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/parentElement)

##### Inherited from

`CharacterData.parentElement`

#### parentNode

> `readonly` **parentNode**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:438

Returns the parent.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/parentNode)

##### Inherited from

`CharacterData.parentNode`

#### prefix

> **prefix**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:448

The prefix of the namespace for this node.

##### Inherited from

`CharacterData.prefix`

#### previousSibling

> `readonly` **previousSibling**: [`Node`](#node-1) \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:454

Returns the previous sibling.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/previousSibling)

##### Inherited from

`CharacterData.previousSibling`

#### PROCESSING_INSTRUCTION_NODE

> `readonly` **PROCESSING_INSTRUCTION_NODE**: `7`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:600

node is a ProcessingInstruction node.

##### Inherited from

`CharacterData.PROCESSING_INSTRUCTION_NODE`

#### TEXT_NODE

> `readonly` **TEXT_NODE**: `3`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:594

node is a Text node.

##### Inherited from

`CharacterData.TEXT_NODE`

#### textContent

> **textContent**: `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:468

The text content of this node and its descendants.

For [Element](#element-1) and DocumentFragment nodes, returns the concatenation of the
`nodeValue` of every descendant text node, excluding processing instruction and comment
nodes. For all other node types, returns `nodeValue`.

Setting `textContent` on an element or document fragment replaces all child nodes with a
single text node; on other nodes it sets `data`, `value`, and `nodeValue` directly.
[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/textContent)

##### See

[https://dom.spec.whatwg.org/#dom-node-textcontent](https://dom.spec.whatwg.org/#dom-node-textcontent)

##### Inherited from

`CharacterData.textContent`

### Methods

#### appendChild()

> **appendChild**(`node`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:482

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/appendChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `node`    | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

##### Inherited from

`CharacterData.appendChild`

#### appendData()

> **appendData**(`data`): `void`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1024

[MDN Reference](https://developer.mozilla.org/docs/Web/API/CharacterData/appendData)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `data`    | `string` |

##### Returns

`void`

##### Inherited from

`CharacterData.appendData`

#### cloneNode()

> **cloneNode**(`deep?`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:533

Returns a copy of node. If deep is true, the copy also includes the node's descendants.

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `deep?`   | `boolean` |

##### Returns

[`Node`](#node-1)

##### Throws

May throw a DOMException if operations within [Element#setAttributeNode](#setattributenode) or
[Node#appendChild](#appendchild-8) (which are potentially invoked in this method) do not meet their
specific constraints.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/cloneNode)

##### Inherited from

`CharacterData.cloneNode`

#### compareDocumentPosition()

> **compareDocumentPosition**(`other`): `number`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:540

Returns a bitmask indicating the position of other relative to node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/compareDocumentPosition)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`number`

##### Inherited from

`CharacterData.compareDocumentPosition`

#### contains()

> **contains**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:489

Checks whether `other` is an inclusive descendant of this node.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/contains)

##### Parameters

| Parameter | Type                                       |
| --------- | ------------------------------------------ |
| `other`   | [`Node`](#node-1) \| `null` \| `undefined` |

##### Returns

`boolean`

##### Inherited from

`CharacterData.contains`

#### deleteData()

> **deleteData**(`offset`, `count`): `void`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1026

[MDN Reference](https://developer.mozilla.org/docs/Web/API/CharacterData/deleteData)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `offset`  | `number` |
| `count`   | `number` |

##### Returns

`void`

##### Inherited from

`CharacterData.deleteData`

#### getRootNode()

> **getRootNode**(`options`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:502

Searches for the root node of this node.

**This behavior is slightly different from the one in the specs**:

- ignores `options.composed`, since `ShadowRoot`s are unsupported, therefore always
  returning root.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/getRootNode)

##### Parameters

| Parameter | Type                 |
| --------- | -------------------- |
| `options` | `GetRootNodeOptions` |

##### Returns

[`Node`](#node-1)

##### See

- https://dom.spec.whatwg.org/#dom-node-getrootnode
- https://dom.spec.whatwg.org/#concept-shadow-including-root

##### Inherited from

`CharacterData.getRootNode`

#### hasChildNodes()

> **hasChildNodes**(): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:547

Returns whether node has children.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/hasChildNodes)

##### Returns

`boolean`

##### Inherited from

`CharacterData.hasChildNodes`

#### insertBefore()

> **insertBefore**(`node`, `child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:550

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/insertBefore)

##### Parameters

| Parameter | Type                        |
| --------- | --------------------------- |
| `node`    | [`Node`](#node-1)           |
| `child`   | [`Node`](#node-1) \| `null` |

##### Returns

[`Node`](#node-1)

##### Inherited from

`CharacterData.insertBefore`

#### insertData()

> **insertData**(`offset`, `data`): `void`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1028

[MDN Reference](https://developer.mozilla.org/docs/Web/API/CharacterData/insertData)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `offset`  | `number` |
| `data`    | `string` |

##### Returns

`void`

##### Inherited from

`CharacterData.insertData`

#### isDefaultNamespace()

> **isDefaultNamespace**(`namespace`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:553

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/isDefaultNamespace)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |

##### Returns

`boolean`

##### Inherited from

`CharacterData.isDefaultNamespace`

#### isEqualNode()

> **isEqualNode**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:514

Checks whether the given node is equal to this node.

Two nodes are equal when they have the same type, defining characteristics (for the type),
and the same `childNodes`. The comparison is iterative to avoid stack overflows on deeply
nested trees. `Attribute` nodes of each `Element` pair are also compared iteratively.

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`boolean`

##### See

- [https://dom.spec.whatwg.org/#concept-node-equals](https://dom.spec.whatwg.org/#concept-node-equals)
- [https://developer.mozilla.org/en-US/docs/Web/API/Node/isEqualNode](https://developer.mozilla.org/en-US/docs/Web/API/Node/isEqualNode)

##### Inherited from

`CharacterData.isEqualNode`

#### isSameNode()

> **isSameNode**(`other`): `boolean`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:521

Checks whether the given node is this node.

[MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Node/isSameNode)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `other`   | [`Node`](#node-1) |

##### Returns

`boolean`

##### Inherited from

`CharacterData.isSameNode`

#### ~~isSupported()~~

> **isSupported**(`feature`, `version`): `true`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:568

Checks whether the DOM implementation implements a specific feature and its version.

##### Parameters

| Parameter | Type     | Description                                                                                                                          |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `feature` | `string` | The package name of the feature to test. This is the same name that can be passed to the method `hasFeature` on `DOMImplementation`. |
| `version` | `string` | This is the version number of the package name to test.                                                                              |

##### Returns

`true`

##### Deprecated

Since `DOMImplementation.hasFeature` is deprecated and always returns true.

##### Since

Introduced in DOM Level 2

##### See

DOMImplementation.hasFeature

##### Inherited from

`CharacterData.isSupported`

#### lookupNamespaceURI()

> **lookupNamespaceURI**(`prefix`): `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:571

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lookupNamespaceURI)

##### Parameters

| Parameter | Type               |
| --------- | ------------------ |
| `prefix`  | `string` \| `null` |

##### Returns

`string` \| `null`

##### Inherited from

`CharacterData.lookupNamespaceURI`

#### lookupPrefix()

> **lookupPrefix**(`namespace`): `string` \| `null`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:574

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/lookupPrefix)

##### Parameters

| Parameter   | Type               |
| ----------- | ------------------ |
| `namespace` | `string` \| `null` |

##### Returns

`string` \| `null`

##### Inherited from

`CharacterData.lookupPrefix`

#### normalize()

> **normalize**(): `void`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:582

Removes empty exclusive Text nodes and concatenates the data of remaining contiguous
exclusive Text nodes into the first of their nodes.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/normalize)

##### Returns

`void`

##### Inherited from

`CharacterData.normalize`

#### removeChild()

> **removeChild**(`child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:585

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/removeChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `child`   | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

##### Inherited from

`CharacterData.removeChild`

#### replaceChild()

> **replaceChild**(`node`, `child`): [`Node`](#node-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:588

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Node/replaceChild)

##### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `node`    | [`Node`](#node-1) |
| `child`   | [`Node`](#node-1) |

##### Returns

[`Node`](#node-1)

##### Inherited from

`CharacterData.replaceChild`

#### replaceData()

> **replaceData**(`offset`, `count`, `data`): `void`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1030

[MDN Reference](https://developer.mozilla.org/docs/Web/API/CharacterData/replaceData)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `offset`  | `number` |
| `count`   | `number` |
| `data`    | `string` |

##### Returns

`void`

##### Inherited from

`CharacterData.replaceData`

#### splitText()

> **splitText**(`offset`): [`Text`](#text-1)

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1059

Splits data at the given offset and returns the remainder as Text node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Text/splitText)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `offset`  | `number` |

##### Returns

[`Text`](#text-1)

#### substringData()

> **substringData**(`offset`, `count`): `string`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1032

[MDN Reference](https://developer.mozilla.org/docs/Web/API/CharacterData/substringData)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `offset`  | `number` |
| `count`   | `number` |

##### Returns

`string`

##### Inherited from

`CharacterData.substringData`

---

## AdapterOptions\<A\>

> **AdapterOptions**\<`A`\> = `A` _extends_ [`EpubStorageAdapterClass`](#epubstorageadapterclass)\<infer Opts\> ? `Opts` : `object`

Defined in: [libraries/epub/src/adapters/interface.ts:110](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L110)

### Type Parameters

| Type Parameter |
| -------------- |
| `A`            |

---

## ArchiveSource

> **ArchiveSource** = `string` \| `Uint8Array` \| `Blob`

Defined in: [libraries/epub/src/adapters/interface.ts:12](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L12)

---

## Attr

> **Attr** = `InstanceOf`\<[`Attr`](#attr-1)\>

Defined in: node_modules/@xmldom/xmldom/index.d.ts:664

A DOM element's attribute as an object. In most DOM methods, you will probably directly
retrieve the attribute as a string (e.g., Element.getAttribute(), but certain functions (e.g.,
Element.getAttributeNode()) or means of iterating give Attr types.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Attr)

---

## Document

> **Document** = `InstanceOf`\<[`Document`](#document-1)\>

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1188

---

## DocumentType

> **DocumentType** = `InstanceOf`\<`DocumentFragment`\>

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1431

---

## Element

> **Element** = `InstanceOf`\<[`Element`](#element-1)\>

Defined in: node_modules/@xmldom/xmldom/index.d.ts:842

Element is the most general base class from which all objects in a Document inherit. It only
has methods and properties common to all kinds of elements. More specific classes inherit from
Element.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Element)

---

## EpubInstanceFor\<A\>

> **EpubInstanceFor**\<`A`\> = `A`\[`"capabilities"`\]\[`"writable"`\] _extends_ `true` ? [`Epub`](#epub) : [`EpubReader`](#epubreader)

Defined in: [libraries/epub/src/index.tsx:3328](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L3328)

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

Defined in: [libraries/epub/src/index.tsx:124](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L124)

---

## EpubReader

> **EpubReader** = `Pick`\<[`Epub`](#epub), `"storage"` \| `"findMetadataItem"` \| `"findAllMetadataItems"` \| `"resolveHref"` \| `"readFileContents"` \| `"readItemContents"` \| `"readXhtmlItemContents"` \| `"discardAndClose"` \| `Extract`\<keyof [`Epub`](#epub), `` `get${string}` ``\>\> & `Disposable`

Defined in: [libraries/epub/src/index.tsx:222](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L222)

Read-only view of an EPUB
Returned by Epub.using(MemoryAdapter).from(...) and by Epub.from(path, { readonly: true })

---

## EpubStorageKind

> **EpubStorageKind** = `"tmp-dir"` \| `"in-memory"` \| `string` & `object`

Defined in: [libraries/epub/src/adapters/interface.ts:10](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/adapters/interface.ts#L10)

Pluggable storage backend for an Epub instance

Built-in adapters:

- [TmpFsAdapter](#tmpfsadapter) extracts the archive to a tmp directory and
  supports the full read/write/save/upgrade
- [MemoryAdapter](#memoryadapter) keeps an in-memory zip handle and supports
  reads only

---

## InMemoryEpubReader

> **InMemoryEpubReader** = [`EpubReader`](#epubreader) & `object`

Defined in: [libraries/epub/src/index.tsx:240](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L240)

Readonly Epub-instance backed by an in-memory zip handle
Returned by `Epub.using(MemoryAdapter).from(...)`

### Type Declaration

#### storage

> `readonly` **storage**: `"in-memory"`

---

## ManifestItem

> **ManifestItem** = `object`

Defined in: [libraries/epub/src/index.tsx:107](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L107)

### Properties

#### fallback?

> `optional` **fallback**: `string`

Defined in: [libraries/epub/src/index.tsx:112](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L112)

#### href

> **href**: `string`

Defined in: [libraries/epub/src/index.tsx:109](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L109)

#### id

> **id**: `string`

Defined in: [libraries/epub/src/index.tsx:108](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L108)

#### mediaOverlay?

> `optional` **mediaOverlay**: `string`

Defined in: [libraries/epub/src/index.tsx:113](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L113)

#### mediaType?

> `optional` **mediaType**: `string`

Defined in: [libraries/epub/src/index.tsx:111](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L111)

#### properties?

> `optional` **properties**: `string`[]

Defined in: [libraries/epub/src/index.tsx:114](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L114)

#### title?

> `optional` **title**: `string`

Defined in: [libraries/epub/src/index.tsx:110](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L110)

---

## MetadataEntry

> **MetadataEntry** = `object`

Defined in: [libraries/epub/src/index.tsx:117](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L117)

### Properties

#### id?

> `optional` **id**: `string`

Defined in: [libraries/epub/src/index.tsx:118](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L118)

#### properties

> **properties**: `Record`\<`string`, `string`\>

Defined in: [libraries/epub/src/index.tsx:120](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L120)

#### type

> **type**: `string`

Defined in: [libraries/epub/src/index.tsx:119](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L119)

#### value

> **value**: `string` \| `undefined`

Defined in: [libraries/epub/src/index.tsx:121](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L121)

---

## NavigationList

> **NavigationList** = [`NavigationItem`](#navigationitem)[]

Defined in: [libraries/epub/src/index.tsx:196](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/index.tsx#L196)

---

## Node

> **Node** = `InstanceOf`\<[`Node`](#node-1)\> & `object`

Defined in: node_modules/@xmldom/xmldom/index.d.ts:368

### Type Declaration

#### ATTRIBUTE_NODE

> `readonly` **ATTRIBUTE_NODE**: `2`

#### CDATA_SECTION_NODE

> `readonly` **CDATA_SECTION_NODE**: `4`

node is a CDATASection node.

#### COMMENT_NODE

> `readonly` **COMMENT_NODE**: `8`

node is a Comment node.

#### DOCUMENT_FRAGMENT_NODE

> `readonly` **DOCUMENT_FRAGMENT_NODE**: `11`

node is a DocumentFragment node.

#### DOCUMENT_NODE

> `readonly` **DOCUMENT_NODE**: `9`

node is a document.

#### DOCUMENT_POSITION_CONTAINED_BY

> `readonly` **DOCUMENT_POSITION_CONTAINED_BY**: `16`

Set when other is a descendant of node.

#### DOCUMENT_POSITION_CONTAINS

> `readonly` **DOCUMENT_POSITION_CONTAINS**: `8`

Set when other is an ancestor of node.

#### DOCUMENT_POSITION_DISCONNECTED

> `readonly` **DOCUMENT_POSITION_DISCONNECTED**: `1`

Set when node and other are not in the same tree.

#### DOCUMENT_POSITION_FOLLOWING

> `readonly` **DOCUMENT_POSITION_FOLLOWING**: `4`

Set when other is following node.

#### DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC

> `readonly` **DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC**: `32`

#### DOCUMENT_POSITION_PRECEDING

> `readonly` **DOCUMENT_POSITION_PRECEDING**: `2`

Set when other is preceding node.

#### DOCUMENT_TYPE_NODE

> `readonly` **DOCUMENT_TYPE_NODE**: `10`

node is a doctype.

#### ELEMENT_NODE

> `readonly` **ELEMENT_NODE**: `1`

node is an element.

#### ENTITY_NODE

> `readonly` **ENTITY_NODE**: `6`

#### ENTITY_REFERENCE_NODE

> `readonly` **ENTITY_REFERENCE_NODE**: `5`

#### NOTATION_NODE

> `readonly` **NOTATION_NODE**: `12`

#### PROCESSING_INSTRUCTION_NODE

> `readonly` **PROCESSING_INSTRUCTION_NODE**: `7`

node is a ProcessingInstruction node.

#### TEXT_NODE

> `readonly` **TEXT_NODE**: `3`

node is a Text node.

---

## Text

> **Text** = `InstanceOf`\<[`Text`](#text-1)\>

Defined in: node_modules/@xmldom/xmldom/index.d.ts:1051

The textual content of Element or Attr. If an element has no markup within its content, it has
a single child implementing Text that contains the element's text. However, if the element
contains markup, it is parsed into information items and Text nodes that form its children.

**This implementation differs from the specification:** not constructable,
use `document.createTextNode(data)` instead.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Text)

---

## XmlDiagnostic

> **XmlDiagnostic** = `object`

Defined in: [libraries/epub/src/xml.ts:233](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L233)

### Properties

#### column?

> `optional` **column**: `number`

Defined in: [libraries/epub/src/xml.ts:238](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L238)

#### level

> **level**: `"warning"` \| `"error"` \| `"fatalError"`

Defined in: [libraries/epub/src/xml.ts:235](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L235)

#### line?

> `optional` **line**: `number`

Defined in: [libraries/epub/src/xml.ts:237](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L237)

#### message

> **message**: `string`

Defined in: [libraries/epub/src/xml.ts:236](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L236)

---

## NS

> `const` **NS**: `object`

Defined in: [libraries/epub/src/xml.ts:283](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L283)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Type Declaration

#### dc

> **dc**: `string` = `"http://purl.org/dc/elements/1.1/"`

#### epub

> **epub**: `string` = `"http://www.idpf.org/2007/ops"`

#### opf

> **opf**: `string` = `"http://www.idpf.org/2007/opf"`

#### xhtml

> **xhtml**: `string` = `"http://www.w3.org/1999/xhtml"`

#### xml

> **xml**: `string` = `"http://www.w3.org/XML/1998/namespace"`

#### xmlns

> **xmlns**: `string` = `"http://www.w3.org/2000/xmlns/"`

---

## XMLSerializer

> **XMLSerializer**: _typeof_ `XMLSerializer`

Defined in: [libraries/epub/src/xml.ts:12](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L12)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

---

## addLinkToXhtmlHead()

> **addLinkToXhtmlHead**(`document`, `link`): `void`

Defined in: [libraries/epub/src/xml.ts:215](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L215)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter   | Type                                                       |
| ----------- | ---------------------------------------------------------- |
| `document`  | [`Document`](#document-1)                                  |
| `link`      | \{ `href`: `string`; `rel`: `string`; `type`: `string`; \} |
| `link.href` | `string`                                                   |
| `link.rel`  | `string`                                                   |
| `link.type` | `string`                                                   |

### Returns

`void`

---

## adoptNamespaces()

> **adoptNamespaces**(`node`): `void`

Defined in: [libraries/epub/src/xml.ts:54](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L54)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter | Type                    |
| --------- | ----------------------- |
| `node`    | [`Element`](#element-1) |

### Returns

`void`

### Privateremarks

`x()` builds elements in no namespace. That serializes correctly, because a
child in no namespace inherits the enclosing default namespace on the way
out, but in memory the elements report `namespaceURI === null` and so are
invisible to namespace-aware queries such as `getElementsByTagNameNS`.
Calling this after inserting a node makes the tree report the namespace its
position implies.

---

## createDocument()

> **createDocument**(`namespaceUri`, `qualifiedName`, `docType?`): [`Document`](#document-1)

Defined in: [libraries/epub/src/xml.ts:351](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L351)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter       | Type                                        |
| --------------- | ------------------------------------------- |
| `namespaceUri`  | `string` \| `null`                          |
| `qualifiedName` | `string`                                    |
| `docType?`      | [`DocumentType`](#documenttype-2) \| `null` |

### Returns

[`Document`](#document-1)

---

## createDocumentType()

> **createDocumentType**(`qualifiedName`, `publicId?`, `systemId?`): [`DocumentType`](#documenttype-2)

Defined in: [libraries/epub/src/xml.ts:363](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L363)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `qualifiedName` | `string` |
| `publicId?`     | `string` |
| `systemId?`     | `string` |

### Returns

[`DocumentType`](#documenttype-2)

---

## declareDefaultNamespace()

> **declareDefaultNamespace**(`element`, `uri`): `void`

Defined in: [libraries/epub/src/xml.ts:78](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L78)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter | Type                    |
| --------- | ----------------------- |
| `element` | [`Element`](#element-1) |
| `uri`     | `string`                |

### Returns

`void`

---

## findXmlChildByName()

> **findXmlChildByName**(`name`, `element`, `filter?`): [`Element`](#element-1) \| `undefined`

Defined in: [libraries/epub/src/xml.ts:157](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L157)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter | Type                    |
| --------- | ----------------------- |
| `name`    | `string`                |
| `element` | [`Element`](#element-1) |
| `filter?` | (`node`) => `boolean`   |

### Returns

[`Element`](#element-1) \| `undefined`

---

## findXmlChildByNameNS()

> **findXmlChildByNameNS**(`namespaceUri`, `name`, `element`, `filter?`): [`Element`](#element-1) \| `undefined`

Defined in: [libraries/epub/src/xml.ts:134](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L134)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter      | Type                    |
| -------------- | ----------------------- |
| `namespaceUri` | `string` \| `null`      |
| `name`         | `string`                |
| `element`      | [`Element`](#element-1) |
| `filter?`      | (`node`) => `boolean`   |

### Returns

[`Element`](#element-1) \| `undefined`

---

## findXmlDescendantByName()

> **findXmlDescendantByName**(`name`, `element`, `filter?`): [`Element`](#element-1) \| `undefined`

Defined in: [libraries/epub/src/xml.ts:203](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L203)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter | Type                    |
| --------- | ----------------------- |
| `name`    | `string`                |
| `element` | [`Element`](#element-1) |
| `filter?` | (`node`) => `boolean`   |

### Returns

[`Element`](#element-1) \| `undefined`

---

## findXmlDescendantByNameNS()

> **findXmlDescendantByNameNS**(`namespaceUri`, `name`, `element`, `filter?`): [`Element`](#element-1) \| `undefined`

Defined in: [libraries/epub/src/xml.ts:172](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L172)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter      | Type                    |
| -------------- | ----------------------- |
| `namespaceUri` | `string` \| `null`      |
| `name`         | `string`                |
| `element`      | [`Element`](#element-1) |
| `filter?`      | (`node`) => `boolean`   |

### Returns

[`Element`](#element-1) \| `undefined`

---

## getXhtmlBody()

> **getXhtmlBody**(`document`): [`Element`](#element-1)

Defined in: [libraries/epub/src/xml.ts:120](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L120)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter  | Type                      |
| ---------- | ------------------------- |
| `document` | [`Document`](#document-1) |

### Returns

[`Element`](#element-1)

---

## insert()

> **insert**\<`T`\>(`parent`, `child`, `reference?`): `T`

Defined in: [libraries/epub/src/xml.ts:89](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L89)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Type Parameters

| Type Parameter                  |
| ------------------------------- |
| `T` _extends_ [`Node`](#node-1) |

### Parameters

| Parameter    | Type                        |
| ------------ | --------------------------- |
| `parent`     | [`Element`](#element-1)     |
| `child`      | `T`                         |
| `reference?` | [`Node`](#node-1) \| `null` |

### Returns

`T`

---

## isCdata()

> **isCdata**(`n`): `n is CharacterData`

Defined in: [libraries/epub/src/xml.ts:22](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L22)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `n`       | [`Node`](#node-1) |

### Returns

`n is CharacterData`

---

## isComment()

> **isComment**(`n`): `n is CharacterData`

Defined in: [libraries/epub/src/xml.ts:26](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L26)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `n`       | [`Node`](#node-1) |

### Returns

`n is CharacterData`

---

## isElement()

> **isElement**(`n`): `n is Element`

Defined in: [libraries/epub/src/xml.ts:14](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L14)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `n`       | [`Node`](#node-1) |

### Returns

`n is Element`

---

## isText()

> **isText**(`n`): `n is CharacterData`

Defined in: [libraries/epub/src/xml.ts:18](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L18)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `n`       | [`Node`](#node-1) |

### Returns

`n is CharacterData`

---

## parse()

> **parse**(`xml`, `mediaType`, `onError?`): [`Document`](#document-1)

Defined in: [libraries/epub/src/xml.ts:241](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L241)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter   | Type                     |
| ----------- | ------------------------ |
| `xml`       | `string`                 |
| `mediaType` | `string`                 |
| `onError?`  | (`diagnostic`) => `void` |

### Returns

[`Document`](#document-1)

---

## replace()

> **replace**\<`T`\>(`parent`, `newChild`, `oldChild`): `T`

Defined in: [libraries/epub/src/xml.ts:105](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L105)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Type Parameters

| Type Parameter                  |
| ------------------------------- |
| `T` _extends_ [`Node`](#node-1) |

### Parameters

| Parameter  | Type                    |
| ---------- | ----------------------- |
| `parent`   | [`Element`](#element-1) |
| `newChild` | `T`                     |
| `oldChild` | [`Node`](#node-1)       |

### Returns

`T`

---

## serialize()

> **serialize**(`doc`, `options?`): `string`

Defined in: [libraries/epub/src/xml.ts:261](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L261)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter           | Type                          |
| ------------------- | ----------------------------- |
| `doc`               | [`Node`](#node-1)             |
| `options?`          | \{ `validate?`: `boolean`; \} |
| `options.validate?` | `boolean`                     |

### Returns

`string`

---

## text()

> **text**(`data`): [`Text`](#text-1)

Defined in: [libraries/epub/src/xml.ts:347](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L347)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter | Type     |
| --------- | -------- |
| `data`    | `string` |

### Returns

[`Text`](#text-1)

---

## x()

> **x**(`name`, `attributes?`, ...`children?`): [`Element`](#element-1)

Defined in: [libraries/epub/src/xml.ts:294](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/libraries/epub/src/xml.ts#L294)

The XML surface. Publication-level operations live on [Epub](#epub); for
building and inspecting XML trees directly, use these.

The DOM node types are re-exported so that callers do not need to depend on
`@xmldom/xmldom` themselves.

### Parameters

| Parameter      | Type                                                       |
| -------------- | ---------------------------------------------------------- |
| `name`         | `string`                                                   |
| `attributes?`  | `Record`\<`string`, `string` \| `undefined`\> \| `null`    |
| ...`children?` | (`string` \| [`Node`](#node-1) \| `null` \| `undefined`)[] |

### Returns

[`Element`](#element-1)
