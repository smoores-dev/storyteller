# @smoores/epub

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
npm install @smoores/epub
```

yarn:

```sh
yarn add @smoores/epub
```

deno:

```sh
deno install npm:@smoores/epub
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

`@smoores/epub` provides an API to interact with the metadata, manifest, and
spine of the EPUB publication. There are higher level APIs that mostly abstract
away the implementation details of the EPUB specification, like
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
import { Epub } from "@smoores/epub"

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

import { Epub } from "@smoores/epub"

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
import { Epub, ManifestItem } from "@smoores/epub"

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
import { Epub } from "@smoores/epub"

const epub = await Epub.from("path/to/book.epub")
await epub.setTitle("S'mores for Everyone")

await epub.writeToFile("path/to/updated.epub")
```

### Writing to a byte array

```ts
import { randomUUID } from "node:crypto"

import { Epub } from "@smoores/epub"

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

* [Epub](#epub)
  * [Link](#link)
  * [Properties](#properties)
    * [xhtmlBuilder](#xhtmlbuilder)
    * [xhtmlParser](#xhtmlparser)
    * [xmlBuilder](#xmlbuilder)
    * [xmlParser](#xmlparser)
  * [Methods](#methods)
    * [addContributor()](#addcontributor)
    * [addCreator()](#addcreator)
    * [addManifestItem()](#addmanifestitem)
    * [addMetadata()](#addmetadata)
    * [addSpineItem()](#addspineitem)
    * [addSubject()](#addsubject)
    * [close()](#close)
    * [createXhtmlDocument()](#createxhtmldocument)
    * [getContributors()](#getcontributors)
    * [getCoverImage()](#getcoverimage)
    * [getCoverImageItem()](#getcoverimageitem)
    * [getCreators()](#getcreators)
    * [getLanguage()](#getlanguage)
    * [getManifest()](#getmanifest)
    * [getMetadata()](#getmetadata)
    * [getPublicationDate()](#getpublicationdate)
    * [getSpineItems()](#getspineitems)
    * [getSubjects()](#getsubjects)
    * [getTitle()](#gettitle)
    * [getType()](#gettype)
    * [readItemContents()](#readitemcontents)
    * [readXhtmlItemContents()](#readxhtmlitemcontents)
    * [removeContributor()](#removecontributor)
    * [removeCreator()](#removecreator)
    * [removeManifestItem()](#removemanifestitem)
    * [removeSpineItem()](#removespineitem)
    * [replaceMetadata()](#replacemetadata)
    * [setCoverImage()](#setcoverimage)
    * [setLanguage()](#setlanguage)
    * [setPublicationDate()](#setpublicationdate)
    * [setTitle()](#settitle)
    * [setType()](#settype)
    * [updateManifestItem()](#updatemanifestitem)
    * [writeItemContents()](#writeitemcontents)
    * [writeToArray()](#writetoarray)
    * [writeToFile()](#writetofile)
    * [writeXhtmlItemContents()](#writexhtmlitemcontents)
    * [addLinkToXhtmlHead()](#addlinktoxhtmlhead)
    * [create()](#create)
    * [createXmlElement()](#createxmlelement)
    * [createXmlTextNode()](#createxmltextnode)
    * [findXmlChildByName()](#findxmlchildbyname)
    * [formatSmilDuration()](#formatsmilduration)
    * [from()](#from)
    * [getXhtmlBody()](#getxhtmlbody)
    * [getXhtmlTextContent()](#getxhtmltextcontent)
    * [getXmlChildren()](#getxmlchildren)
    * [getXmlElementName()](#getxmlelementname)
    * [isXmlTextNode()](#isxmltextnode)
    * [replaceXmlChildren()](#replacexmlchildren)
* [AlternateScript](#alternatescript)
  * [Properties](#properties-1)
    * [locale](#locale)
    * [name](#name)
* [DcCreator](#dccreator)
  * [Properties](#properties-2)
    * [alternateScripts?](#alternatescripts)
    * [fileAs?](#fileas)
    * [name](#name-1)
    * [role?](#role)
* [DcSubject](#dcsubject)
  * [Properties](#properties-3)
    * [authority](#authority)
    * [term](#term)
    * [value](#value)
* [DublinCore](#dublincore)
  * [Properties](#properties-4)
    * [contributors?](#contributors)
    * [creators?](#creators)
    * [date?](#date)
    * [identifier](#identifier)
    * [language](#language)
    * [subjects?](#subjects)
    * [title](#title)
    * [type?](#type)
* [ElementName](#elementname)
  * [Defined in](#defined-in-76)
* [EpubMetadata](#epubmetadata)
  * [Defined in](#defined-in-77)
* [ManifestItem](#manifestitem)
  * [Type declaration](#type-declaration)
    * [fallback?](#fallback)
    * [href](#href)
    * [id](#id)
    * [mediaOverlay?](#mediaoverlay)
    * [mediaType?](#mediatype)
    * [properties?](#properties-5)
  * [Defined in](#defined-in-78)
* [MetadataEntry](#metadataentry)
  * [Type declaration](#type-declaration-1)
    * [id?](#id-1)
    * [properties](#properties-6)
    * [type](#type-1)
    * [value](#value-1)
  * [Defined in](#defined-in-79)
* [ParsedXml](#parsedxml)
  * [Defined in](#defined-in-80)
* [XmlElement\<Name>](#xmlelementname)
  * [Type declaration](#type-declaration-2)
    * [:@?](#)
  * [Type Parameters](#type-parameters-5)
  * [Defined in](#defined-in-81)
* [XmlNode](#xmlnode)
  * [Defined in](#defined-in-82)
* [XmlTextNode](#xmltextnode)
  * [Type declaration](#type-declaration-3)
    * [#text](#text)
  * [Defined in](#defined-in-83)

## Epub

A single EPUB instance.

The entire EPUB contents will be read into memory.

Example usage:

```ts
import { Epub, getBody, findByName, textContent } from "@smoores/epub"

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

<https://www.w3.org/TR/epub-33/>

### Properties

#### xhtmlBuilder

> `static` **xhtmlBuilder**: `XMLBuilder`

##### Defined in

[index.ts:230](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L230)

#### xhtmlParser

> `static` **xhtmlParser**: `XMLParser`

##### Defined in

[index.ts:198](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L198)

#### xmlBuilder

> `static` **xmlBuilder**: `XMLBuilder`

##### Defined in

[index.ts:223](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L223)

#### xmlParser

> `static` **xmlParser**: `XMLParser`

##### Defined in

[index.ts:191](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L191)

### Methods

#### addContributor()

> **addContributor**(`contributor`, `index`?): `Promise`<`void`>

Add a contributor to the EPUB metadata.

If index is provided, the creator will be placed at that index in the list of
creators. Otherwise, it will be added to the end of the list.

This is a convenience method for
`epub.addCreator(contributor, index, 'contributor')`.

##### Parameters

| Parameter     | Type                               |
| ------------- | ---------------------------------- |
| `contributor` | [`DcCreator`](README.md#dccreator) |
| `index`?      | `number`                           |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dccreator>

##### Defined in

[index.ts:1413](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1413)

#### addCreator()

> **addCreator**(`creator`, `index`?, `type`?): `Promise`<`void`>

Add a creator to the EPUB metadata.

If index is provided, the creator will be placed at that index in the list of
creators. Otherwise, it will be added to the end of the list.

##### Parameters

| Parameter | Type                               | Default value |
| --------- | ---------------------------------- | ------------- |
| `creator` | [`DcCreator`](README.md#dccreator) | `undefined`   |
| `index`?  | `number`                           | `undefined`   |
| `type`?   | `"creator"` \| `"contributor"`     | `"creator"`   |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dccreator>

##### Defined in

[index.ts:1252](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1252)

#### addManifestItem()

##### Call Signature

> **addManifestItem**(`item`, `contents`, `encoding`): `Promise`<`void`>

Create a new manifest item and write its contents to a new entry.

###### Parameters

| Parameter  | Type                                     | Description                                                                                                                 |
| ---------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `item`     | [`ManifestItem`](README.md#manifestitem) | -                                                                                                                           |
| `contents` | [`ParsedXml`](README.md#parsedxml)       | The new contents. May be either a parsed XML tree or a unicode string, as determined by the `as` argument.                  |
| `encoding` | `"xml"`                                  | Optional - whether to interpret contents as a parsed XML tree, a unicode string, or a byte array. Defaults to a byte array. |

###### Returns

`Promise`<`void`>

###### Link

<https://www.w3.org/TR/epub-33/#sec-pkg-manifest>

###### Link

<https://www.w3.org/TR/epub-33/#sec-contentdocs>

###### Defined in

[index.ts:1768](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1768)

##### Call Signature

> **addManifestItem**(`item`, `contents`, `encoding`): `Promise`<`void`>

Create a new manifest item and write its contents to a new entry.

###### Parameters

| Parameter  | Type                                     | Description                                                                                                                 |
| ---------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `item`     | [`ManifestItem`](README.md#manifestitem) | -                                                                                                                           |
| `contents` | `string`                                 | The new contents. May be either a parsed XML tree or a unicode string, as determined by the `as` argument.                  |
| `encoding` | `"utf-8"`                                | Optional - whether to interpret contents as a parsed XML tree, a unicode string, or a byte array. Defaults to a byte array. |

###### Returns

`Promise`<`void`>

###### Link

<https://www.w3.org/TR/epub-33/#sec-pkg-manifest>

###### Link

<https://www.w3.org/TR/epub-33/#sec-contentdocs>

###### Defined in

[index.ts:1773](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1773)

##### Call Signature

> **addManifestItem**(`item`, `contents`): `Promise`<`void`>

Create a new manifest item and write its contents to a new entry.

###### Parameters

| Parameter  | Type                                     | Description                                                                                                |
| ---------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `item`     | [`ManifestItem`](README.md#manifestitem) | -                                                                                                          |
| `contents` | `Uint8Array`<`ArrayBufferLike`>          | The new contents. May be either a parsed XML tree or a unicode string, as determined by the `as` argument. |

###### Returns

`Promise`<`void`>

###### Link

<https://www.w3.org/TR/epub-33/#sec-pkg-manifest>

###### Link

<https://www.w3.org/TR/epub-33/#sec-contentdocs>

###### Defined in

[index.ts:1778](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1778)

#### addMetadata()

> **addMetadata**(`entry`): `Promise`<`void`>

Add a new metadata entry to the Epub.

This method, like `epub.getMetadata()`, operates on metadata entries. For more
useful semantic representations of metadata, use specific methods such as
`setTitle()` and `setLanguage()`.

##### Parameters

| Parameter | Type                                       |
| --------- | ------------------------------------------ |
| `entry`   | [`MetadataEntry`](README.md#metadataentry) |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-pkg-metadata>

##### Defined in

[index.ts:1901](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1901)

#### addSpineItem()

> **addSpineItem**(`manifestId`, `index`?): `Promise`<`void`>

Add an item to the spine of the EPUB.

If `index` is undefined, the item will be added to the end of the spine.
Otherwise it will be inserted at the specified index.

If the manifestId does not correspond to an item in the manifest, this will
throw an error.

##### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `manifestId` | `string` |
| `index`?     | `number` |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-spine-elem>

##### Defined in

[index.ts:1471](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1471)

#### addSubject()

> **addSubject**(`subject`): `Promise`<`void`>

Add a subject to the EPUB metadata.

##### Parameters

| Parameter | Type                                           | Description                                                                         |
| --------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `subject` | `string` \| [`DcSubject`](README.md#dcsubject) | May be a string representing just a schema-less subject name, or a DcSubject object |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dcsubject>

##### Defined in

[index.ts:941](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L941)

#### close()

> **close**(): `Promise`<`void`>

Close the Epub. Must be called before the Epub goes out of scope/is garbage
collected.

##### Returns

`Promise`<`void`>

##### Defined in

[index.ts:418](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L418)

#### createXhtmlDocument()

> **createXhtmlDocument**(`body`, `head`?, `language`?):
> `Promise`<([`XmlElement`](README.md#xmlelementname)<`"html"`> |
> [`XmlElement`](README.md#xmlelementname)<`"?xml"`>)\[]>

Create a new XHTML document with the given body and head.

##### Parameters

| Parameter   | Type                               | Description                                        |
| ----------- | ---------------------------------- | -------------------------------------------------- |
| `body`      | [`ParsedXml`](README.md#parsedxml) | The XML nodes to place in the body of the document |
| `head`?     | [`ParsedXml`](README.md#parsedxml) | Optional - the XMl nodes to place in the head      |
| `language`? | `Locale`                           | Optional - defaults to the EPUB's language         |

##### Returns

`Promise`<([`XmlElement`](README.md#xmlelementname)<`"html"`> |
[`XmlElement`](README.md#xmlelementname)<`"?xml"`>)\[]>

##### Defined in

[index.ts:1584](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1584)

#### getContributors()

> **getContributors**(): `Promise`<[`DcCreator`](README.md#dccreator)\[]>

Retrieve the list of contributors.

This is a convenience method for `epub.getCreators('contributor')`.

##### Returns

`Promise`<[`DcCreator`](README.md#dccreator)\[]>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dccontributor>

##### Defined in

[index.ts:1239](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1239)

#### getCoverImage()

> **getCoverImage**(): `Promise`<`null` | `Uint8Array`<`ArrayBufferLike`>>

Retrieve the cover image data as a byte array.

This does not include, for example, the cover image's filename or mime type. To
retrieve the image manifest item, use epub.getCoverImageItem().

##### Returns

`Promise`<`null` | `Uint8Array`<`ArrayBufferLike`>>

##### Link

<https://www.w3.org/TR/epub-33/#sec-cover-image>

##### Defined in

[index.ts:844](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L844)

#### getCoverImageItem()

> **getCoverImageItem**(): `Promise`<`null` |
> [`ManifestItem`](README.md#manifestitem)>

Retrieve the cover image manifest item.

This does not return the actual image data. To retrieve the image data, pass
this item's id to epub.readItemContents, or use epub.getCoverImage() instead.

##### Returns

`Promise`<`null` | [`ManifestItem`](README.md#manifestitem)>

##### Link

<https://www.w3.org/TR/epub-33/#sec-cover-image>

##### Defined in

[index.ts:825](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L825)

#### getCreators()

> **getCreators**(`type`): `Promise`<[`DcCreator`](README.md#dccreator)\[]>

Retrieve the list of creators.

##### Parameters

| Parameter | Type                           | Default value |
| --------- | ------------------------------ | ------------- |
| `type`    | `"creator"` \| `"contributor"` | `"creator"`   |

##### Returns

`Promise`<[`DcCreator`](README.md#dccreator)\[]>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dccreator>

##### Defined in

[index.ts:1181](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1181)

#### getLanguage()

> **getLanguage**(): `Promise`<`null` | `Locale`>

Retrieve the Epub's language as specified in its package document metadata.

If no language metadata is specified, returns null. Returns the language as an
Intl.Locale instance.

##### Returns

`Promise`<`null` | `Locale`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dclanguage>

##### Defined in

[index.ts:1025](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1025)

#### getManifest()

> **getManifest**(): `Promise`<`Record`<`string`,
> [`ManifestItem`](README.md#manifestitem)>>

Retrieve the manifest for the Epub.

This is represented as a map from each manifest items' id to the rest of its
properties.

##### Returns

`Promise`<`Record`<`string`, [`ManifestItem`](README.md#manifestitem)>>

##### Link

<https://www.w3.org/TR/epub-33/#sec-pkg-manifest>

##### Defined in

[index.ts:664](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L664)

#### getMetadata()

> **getMetadata**(): `Promise`<[`EpubMetadata`](README.md#epubmetadata)>

Retrieve the metadata entries for the Epub.

This is represented as an array of metadata entries, in the order that they're
presented in the Epub package document.

For more useful semantic representations of metadata, use specific methods such
as `getTitle()` and `getAuthors()`.

##### Returns

`Promise`<[`EpubMetadata`](README.md#epubmetadata)>

##### Link

<https://www.w3.org/TR/epub-33/#sec-pkg-metadata>

##### Defined in

[index.ts:722](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L722)

#### getPublicationDate()

> **getPublicationDate**(): `Promise`<`null` | `Date`>

Retrieve the publication date from the dc:date element in the EPUB metadata as a
Date object.

If there is no dc:date element, returns null.

##### Returns

`Promise`<`null` | `Date`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dcdate>

##### Defined in

[index.ts:881](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L881)

#### getSpineItems()

> **getSpineItems**(): `Promise`<[`ManifestItem`](README.md#manifestitem)\[]>

Retrieve the manifest items that make up the Epub's spine.

The spine specifies the order that the contents of the Epub should be displayed
to users by default.

##### Returns

`Promise`<[`ManifestItem`](README.md#manifestitem)\[]>

##### Link

<https://www.w3.org/TR/epub-33/#sec-spine-elem>

##### Defined in

[index.ts:1452](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1452)

#### getSubjects()

> **getSubjects**(): `Promise`<(`string` |
> [`DcSubject`](README.md#dcsubject))\[]>

Retrieve the list of subjects for this EPUB.

Subjects without associated authority and term metadata will be returned as
strings. Otherwise, they will be represented as DcSubject objects, with a value,
authority, and term.

##### Returns

`Promise`<(`string` | [`DcSubject`](README.md#dcsubject))\[]>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dcsubject>

##### Defined in

[index.ts:980](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L980)

#### getTitle()

> **getTitle**(`short`): `Promise`<`undefined` | `string`>

Retrieve the title of the Epub.

##### Parameters

| Parameter | Type      | Default value | Description                                                                                                                                |
| --------- | --------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `short`   | `boolean` | `false`       | Optional - whether to return only the first title segment if multiple are found. Otherwise, will follow the spec to combine title segments |

##### Returns

`Promise`<`undefined` | `string`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dctitle>

##### Defined in

[index.ts:1067](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1067)

#### getType()

> **getType**(): `Promise`<`null` |
> [`MetadataEntry`](README.md#metadataentry)>

Retrieve the publication type from the dc:type element in the EPUB metadata.

If there is no dc:type element, returns null.

##### Returns

`Promise`<`null` | [`MetadataEntry`](README.md#metadataentry)>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dctype>

##### Defined in

[index.ts:928](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L928)

#### readItemContents()

##### Call Signature

> **readItemContents**(`id`): `Promise`<`Uint8Array`<`ArrayBufferLike`>>

Retrieve the contents of a manifest item, given its id.

###### Parameters

| Parameter | Type     | Description                             |
| --------- | -------- | --------------------------------------- |
| `id`      | `string` | The id of the manifest item to retrieve |

###### Returns

`Promise`<`Uint8Array`<`ArrayBufferLike`>>

###### Link

<https://www.w3.org/TR/epub-33/#sec-contentdocs>

###### Defined in

[index.ts:1556](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1556)

##### Call Signature

> **readItemContents**(`id`, `encoding`): `Promise`<`string`>

Retrieve the contents of a manifest item, given its id.

###### Parameters

| Parameter  | Type      | Description                                                                                                                                                        |
| ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`       | `string`  | The id of the manifest item to retrieve                                                                                                                            |
| `encoding` | `"utf-8"` | Optional - must be the string "utf-8". If provided, the function will encode the data into a unicode string. Otherwise, the data will be returned as a byte array. |

###### Returns

`Promise`<`string`>

###### Link

<https://www.w3.org/TR/epub-33/#sec-contentdocs>

###### Defined in

[index.ts:1557](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1557)

#### readXhtmlItemContents()

##### Call Signature

> **readXhtmlItemContents**(`id`, `as`?):
> `Promise`<[`ParsedXml`](README.md#parsedxml)>

Retrieves the contents of an XHTML item, given its manifest id.

###### Parameters

| Parameter | Type      | Description                                                                                                                           |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | `string`  | The id of the manifest item to retrieve                                                                                               |
| `as`?     | `"xhtml"` | Optional - whether to return the parsed XML document tree, or the concatenated text of the document. Defaults to the parsed XML tree. |

###### Returns

`Promise`<[`ParsedXml`](README.md#parsedxml)>

###### Link

<https://www.w3.org/TR/epub-33/#sec-xhtml>

###### Defined in

[index.ts:1617](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1617)

##### Call Signature

> **readXhtmlItemContents**(`id`, `as`): `Promise`<`string`>

Retrieves the contents of an XHTML item, given its manifest id.

###### Parameters

| Parameter | Type     | Description                                                                                                                           |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | `string` | The id of the manifest item to retrieve                                                                                               |
| `as`      | `"text"` | Optional - whether to return the parsed XML document tree, or the concatenated text of the document. Defaults to the parsed XML tree. |

###### Returns

`Promise`<`string`>

###### Link

<https://www.w3.org/TR/epub-33/#sec-xhtml>

###### Defined in

[index.ts:1618](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1618)

#### removeContributor()

> **removeContributor**(`index`): `Promise`<`void`>

Remove a contributor from the EPUB metadata.

Removes the contributor at the provided index. This index refers to the array
returned by `epub.getContributors()`.

This is a convenience method for `epub.removeCreator(index, 'contributor')`.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `index`   | `number` |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dccreator>

##### Defined in

[index.ts:1397](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1397)

#### removeCreator()

> **removeCreator**(`index`, `type`): `Promise`<`void`>

Remove a creator from the EPUB metadata.

Removes the creator at the provided index. This index refers to the array
returned by `epub.getCreators()`.

##### Parameters

| Parameter | Type                           | Default value |
| --------- | ------------------------------ | ------------- |
| `index`   | `number`                       | `undefined`   |
| `type`    | `"creator"` \| `"contributor"` | `"creator"`   |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dccreator>

##### Defined in

[index.ts:1341](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1341)

#### removeManifestItem()

> **removeManifestItem**(`id`): `Promise`<`void`>

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

##### Returns

`Promise`<`void`>

##### Defined in

[index.ts:1718](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1718)

#### removeSpineItem()

> **removeSpineItem**(`index`): `Promise`<`void`>

Remove the spine item at the specified index.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `index`   | `number` |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-spine-elem>

##### Defined in

[index.ts:1511](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1511)

#### replaceMetadata()

> **replaceMetadata**(`predicate`, `entry`): `Promise`<`void`>

Replace a metadata entry with a new one.

The `predicate` argument will be used to determine which entry to replace. The
first metadata entry that matches the predicate will be replaced.

##### Parameters

| Parameter   | Type                                       | Description                                                                                   |
| ----------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `predicate` | (`entry`) => `boolean`                     | Calls predicate once for each metadata entry, until it finds one where predicate returns true |
| `entry`     | [`MetadataEntry`](README.md#metadataentry) | The new entry to replace the found entry with                                                 |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-pkg-metadata>

##### Defined in

[index.ts:1946](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1946)

#### setCoverImage()

> **setCoverImage**(`href`, `data`): `Promise`<`void`>

Set the cover image for the EPUB.

Adds a manifest item with the `cover-image` property, per the EPUB 3 spec, and
then writes the provided image data to the provided href within the publication.

##### Parameters

| Parameter | Type                            |
| --------- | ------------------------------- |
| `href`    | `string`                        |
| `data`    | `Uint8Array`<`ArrayBufferLike`> |

##### Returns

`Promise`<`void`>

##### Defined in

[index.ts:858](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L858)

#### setLanguage()

> **setLanguage**(`locale`): `Promise`<`void`>

Update the Epub's language metadata entry.

Updates the existing dc:language element if one exists. Otherwise creates a new
element

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `locale`  | `Locale` |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dclanguage>

##### Defined in

[index.ts:1050](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1050)

#### setPublicationDate()

> **setPublicationDate**(`date`): `Promise`<`void`>

Set the dc:date metadata element with the provided date.

Updates the existing dc:date element if one exists. Otherwise creates a new
element

##### Parameters

| Parameter | Type   |
| --------- | ------ |
| `date`    | `Date` |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dcdate>

##### Defined in

[index.ts:896](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L896)

#### setTitle()

> **setTitle**(`title`): `Promise`<`void`>

Set the title of the Epub.

If a title already exists, only the first title metadata entry will be modified
to match the new value.

If no title currently exists, a single title metadata entry will be created.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `title`   | `string` |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dctitle>

##### Defined in

[index.ts:1142](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1142)

#### setType()

> **setType**(`type`): `Promise`<`void`>

Set the dc:type metadata element.

Updates the existing dc:type element if one exists. Otherwise creates a new
element.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `type`    | `string` |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dctype>

##### Defined in

[index.ts:912](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L912)

#### updateManifestItem()

> **updateManifestItem**(`id`, `newItem`): `Promise`<`void`>

Update the manifest entry for an existing item.

To update the contents of an entry, use `epub.writeItemContents()` or
`epub.writeXhtmlItemContents()`

##### Parameters

| Parameter | Type                                                     |
| --------- | -------------------------------------------------------- |
| `id`      | `string`                                                 |
| `newItem` | `Omit`<[`ManifestItem`](README.md#manifestitem), `"id"`> |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-pkg-manifest>

##### Defined in

[index.ts:1845](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1845)

#### writeItemContents()

##### Call Signature

> **writeItemContents**(`id`, `contents`): `Promise`<`void`>

Write new contents for an existing manifest item, specified by its id.

The id must reference an existing manifest item. If creating a new item, use
`epub.addManifestItem()` instead.

###### Parameters

| Parameter  | Type                            | Description                                                                                           |
| ---------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `id`       | `string`                        | The id of the manifest item to write new contents for                                                 |
| `contents` | `Uint8Array`<`ArrayBufferLike`> | The new contents. May be either a utf-8 encoded string or a byte array, as determined by the encoding |

###### Returns

`Promise`<`void`>

###### Link

<https://www.w3.org/TR/epub-33/#sec-contentdocs>

###### Defined in

[index.ts:1670](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1670)

##### Call Signature

> **writeItemContents**(`id`, `contents`, `encoding`): `Promise`<`void`>

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

`Promise`<`void`>

###### Link

<https://www.w3.org/TR/epub-33/#sec-contentdocs>

###### Defined in

[index.ts:1671](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1671)

#### writeToArray()

> **writeToArray**(): `Promise`<`Uint8Array`<`ArrayBufferLike`>>

Write the current contents of the Epub to a new Uint8Array.

This *does not* close the Epub. It can continue to be modified after it has been
written to disk. Use `epub.close()` to close the Epub.

When this method is called, the "dcterms:modified" meta tag is automatically
updated to the current UTC timestamp.

##### Returns

`Promise`<`Uint8Array`<`ArrayBufferLike`>>

##### Defined in

[index.ts:1998](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1998)

#### writeToFile()

> **writeToFile**(`path`): `Promise`<`void`>

Write the current contents of the Epub to a new EPUB archive on disk.

This *does not* close the Epub. It can continue to be modified after it has been
written to disk. Use `epub.close()` to close the Epub.

When this method is called, the "dcterms:modified" meta tag is automatically
updated to the current UTC timestamp.

##### Parameters

| Parameter | Type     | Description                                                                                                                     |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `path`    | `string` | The file path to write the new archive to. The parent directory does not need te exist -- the path will be recursively created. |

##### Returns

`Promise`<`void`>

##### Defined in

[index.ts:2054](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L2054)

#### writeXhtmlItemContents()

> **writeXhtmlItemContents**(`id`, `contents`): `Promise`<`void`>

Write new contents for an existing XHTML item, specified by its id.

The id must reference an existing manifest item. If creating a new item, use
`epub.addManifestItem()` instead.

##### Parameters

| Parameter  | Type                               | Description                                           |
| ---------- | ---------------------------------- | ----------------------------------------------------- |
| `id`       | `string`                           | The id of the manifest item to write new contents for |
| `contents` | [`ParsedXml`](README.md#parsedxml) | The new contents. Must be a parsed XML tree.          |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-xhtml>

##### Defined in

[index.ts:1710](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L1710)

#### addLinkToXhtmlHead()

> `static` **addLinkToXhtmlHead**(`xml`, `link`): `void`

Given an XML structure representing a complete XHTML document, add a `link`
element to the `head` of the document.

This method modifies the provided XML structure.

##### Parameters

| Parameter   | Type                                                     |
| ----------- | -------------------------------------------------------- |
| `xml`       | [`ParsedXml`](README.md#parsedxml)                       |
| `link`      | { `href`: `string`; `rel`: `string`; `type`: `string`; } |
| `link.href` | `string`                                                 |
| `link.rel`  | `string`                                                 |
| `link.type` | `string`                                                 |

##### Returns

`void`

##### Defined in

[index.ts:260](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L260)

#### create()

> `static` **create**(`dublinCore`, `additionalMetadata`):
> `Promise`<[`Epub`](README.md#epub)>

Construct an Epub instance, optionally beginning with the provided metadata.

##### Parameters

| Parameter            | Type                                     | Default value | Description                             |
| -------------------- | ---------------------------------------- | ------------- | --------------------------------------- |
| `dublinCore`         | [`DublinCore`](README.md#dublincore)     | `undefined`   | Core metadata terms                     |
| `additionalMetadata` | [`EpubMetadata`](README.md#epubmetadata) | `[]`          | An array of additional metadata entries |

##### Returns

`Promise`<[`Epub`](README.md#epub)>

##### Defined in

[index.ts:434](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L434)

#### createXmlElement()

> `static` **createXmlElement**<`Name`>(`name`, `properties`, `children`):
> [`XmlElement`](README.md#xmlelementname)<`Name`>

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` *extends* \`a${string}\` \| \`b${string}\` \| \`c${string}\` \| \`d${string}\` \| \`e${string}\` \| \`f${string}\` \| \`g${string}\` \| \`h${string}\` \| \`i${string}\` \| \`j${string}\` \| \`k${string}\` \| \`l${string}\` \| \`m${string}\` \| \`n${string}\` \| \`o${string}\` \| \`p${string}\` \| \`q${string}\` \| \`r${string}\` \| \`s${string}\` \| \`t${string}\` \| \`u${string}\` \| \`v${string}\` \| \`w${string}\` \| \`x${string}\` \| \`y${string}\` \| \`z${string}\` \| \`A${string}\` \| \`B${string}\` \| \`C${string}\` \| \`D${string}\` \| \`E${string}\` \| \`F${string}\` \| \`G${string}\` \| \`H${string}\` \| \`I${string}\` \| \`J${string}\` \| \`K${string}\` \| \`L${string}\` \| \`M${string}\` \| \`N${string}\` \| \`O${string}\` \| \`P${string}\` \| \`Q${string}\` \| \`R${string}\` \| \`S${string}\` \| \`T${string}\` \| \`U${string}\` \| \`V${string}\` \| \`W${string}\` \| \`X${string}\` \| \`Y${string}\` \| \`Z${string}\` \| \`?${string}\` |

##### Parameters

| Parameter    | Type                              | Default value |
| ------------ | --------------------------------- | ------------- |
| `name`       | `Name`                            | `undefined`   |
| `properties` | `Record`<`string`, `string`>      | `undefined`   |
| `children`   | [`XmlNode`](README.md#xmlnode)\[] | `[]`          |

##### Returns

[`XmlElement`](README.md#xmlelementname)<`Name`>

##### Defined in

[index.ts:295](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L295)

#### createXmlTextNode()

> `static` **createXmlTextNode**(`text`): [`XmlTextNode`](README.md#xmltextnode)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `text`    | `string` |

##### Returns

[`XmlTextNode`](README.md#xmltextnode)

##### Defined in

[index.ts:308](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L308)

#### findXmlChildByName()

> `static` **findXmlChildByName**<`Name`>(`name`, `xml`, `filter`?):
> `undefined` | [`XmlElement`](README.md#xmlelementname)<`Name`>

Given an XML structure, find the first child matching the provided name and
optional filter.

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` *extends* \`a${string}\` \| \`b${string}\` \| \`c${string}\` \| \`d${string}\` \| \`e${string}\` \| \`f${string}\` \| \`g${string}\` \| \`h${string}\` \| \`i${string}\` \| \`j${string}\` \| \`k${string}\` \| \`l${string}\` \| \`m${string}\` \| \`n${string}\` \| \`o${string}\` \| \`p${string}\` \| \`q${string}\` \| \`r${string}\` \| \`s${string}\` \| \`t${string}\` \| \`u${string}\` \| \`v${string}\` \| \`w${string}\` \| \`x${string}\` \| \`y${string}\` \| \`z${string}\` \| \`A${string}\` \| \`B${string}\` \| \`C${string}\` \| \`D${string}\` \| \`E${string}\` \| \`F${string}\` \| \`G${string}\` \| \`H${string}\` \| \`I${string}\` \| \`J${string}\` \| \`K${string}\` \| \`L${string}\` \| \`M${string}\` \| \`N${string}\` \| \`O${string}\` \| \`P${string}\` \| \`Q${string}\` \| \`R${string}\` \| \`S${string}\` \| \`T${string}\` \| \`U${string}\` \| \`V${string}\` \| \`W${string}\` \| \`X${string}\` \| \`Y${string}\` \| \`Z${string}\` \| \`?${string}\` |

##### Parameters

| Parameter | Type                               |
| --------- | ---------------------------------- |
| `name`    | `Name`                             |
| `xml`     | [`ParsedXml`](README.md#parsedxml) |
| `filter`? | (`node`) => `boolean`              |

##### Returns

`undefined` | [`XmlElement`](README.md#xmlelementname)<`Name`>

##### Defined in

[index.ts:369](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L369)

#### formatSmilDuration()

> `static` **formatSmilDuration**(`duration`): `string`

Format a duration, provided as a number of seconds, as a SMIL clock value, to be
used for Media Overlays.

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `duration` | `number` |

##### Returns

`string`

##### Link

<https://www.w3.org/TR/epub-33/#sec-duration>

##### Defined in

[index.ts:243](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L243)

#### from()

> `static` **from**(`path`): `Promise`<[`Epub`](README.md#epub)>

Construct an Epub instance by reading an EPUB file from `path`.

##### Parameters

| Parameter | Type     | Description                                 |
| --------- | -------- | ------------------------------------------- |
| `path`    | `string` | Must be a valid filepath to an EPUB archive |

##### Returns

`Promise`<[`Epub`](README.md#epub)>

##### Defined in

[index.ts:513](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L513)

#### getXhtmlBody()

> `static` **getXhtmlBody**(`xml`): [`ParsedXml`](README.md#parsedxml)

Given an XML structure representing a complete XHTML document, return the
sub-structure representing the children of the document's body element.

##### Parameters

| Parameter | Type                               |
| --------- | ---------------------------------- |
| `xml`     | [`ParsedXml`](README.md#parsedxml) |

##### Returns

[`ParsedXml`](README.md#parsedxml)

##### Defined in

[index.ts:285](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L285)

#### getXhtmlTextContent()

> `static` **getXhtmlTextContent**(`xml`): `string`

Given an XML structure representing a complete XHTML document, return a string
representing the concatenation of all text nodes in the document.

##### Parameters

| Parameter | Type                               |
| --------- | ---------------------------------- |
| `xml`     | [`ParsedXml`](README.md#parsedxml) |

##### Returns

`string`

##### Defined in

[index.ts:317](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L317)

#### getXmlChildren()

> `static` **getXmlChildren**<`Name`>(`element`):
> [`ParsedXml`](README.md#parsedxml)

Given an XMLElement, return a list of its children

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` *extends* \`a${string}\` \| \`b${string}\` \| \`c${string}\` \| \`d${string}\` \| \`e${string}\` \| \`f${string}\` \| \`g${string}\` \| \`h${string}\` \| \`i${string}\` \| \`j${string}\` \| \`k${string}\` \| \`l${string}\` \| \`m${string}\` \| \`n${string}\` \| \`o${string}\` \| \`p${string}\` \| \`q${string}\` \| \`r${string}\` \| \`s${string}\` \| \`t${string}\` \| \`u${string}\` \| \`v${string}\` \| \`w${string}\` \| \`x${string}\` \| \`y${string}\` \| \`z${string}\` \| \`A${string}\` \| \`B${string}\` \| \`C${string}\` \| \`D${string}\` \| \`E${string}\` \| \`F${string}\` \| \`G${string}\` \| \`H${string}\` \| \`I${string}\` \| \`J${string}\` \| \`K${string}\` \| \`L${string}\` \| \`M${string}\` \| \`N${string}\` \| \`O${string}\` \| \`P${string}\` \| \`Q${string}\` \| \`R${string}\` \| \`S${string}\` \| \`T${string}\` \| \`U${string}\` \| \`V${string}\` \| \`W${string}\` \| \`X${string}\` \| \`Y${string}\` \| \`Z${string}\` \| \`?${string}\` |

##### Parameters

| Parameter | Type                                             |
| --------- | ------------------------------------------------ |
| `element` | [`XmlElement`](README.md#xmlelementname)<`Name`> |

##### Returns

[`ParsedXml`](README.md#parsedxml)

##### Defined in

[index.ts:349](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L349)

#### getXmlElementName()

> `static` **getXmlElementName**<`Name`>(`element`): `Name`

Given an XMLElement, return its tag name.

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` *extends* \`a${string}\` \| \`b${string}\` \| \`c${string}\` \| \`d${string}\` \| \`e${string}\` \| \`f${string}\` \| \`g${string}\` \| \`h${string}\` \| \`i${string}\` \| \`j${string}\` \| \`k${string}\` \| \`l${string}\` \| \`m${string}\` \| \`n${string}\` \| \`o${string}\` \| \`p${string}\` \| \`q${string}\` \| \`r${string}\` \| \`s${string}\` \| \`t${string}\` \| \`u${string}\` \| \`v${string}\` \| \`w${string}\` \| \`x${string}\` \| \`y${string}\` \| \`z${string}\` \| \`A${string}\` \| \`B${string}\` \| \`C${string}\` \| \`D${string}\` \| \`E${string}\` \| \`F${string}\` \| \`G${string}\` \| \`H${string}\` \| \`I${string}\` \| \`J${string}\` \| \`K${string}\` \| \`L${string}\` \| \`M${string}\` \| \`N${string}\` \| \`O${string}\` \| \`P${string}\` \| \`Q${string}\` \| \`R${string}\` \| \`S${string}\` \| \`T${string}\` \| \`U${string}\` \| \`V${string}\` \| \`W${string}\` \| \`X${string}\` \| \`Y${string}\` \| \`Z${string}\` \| \`?${string}\` |

##### Parameters

| Parameter | Type                                             |
| --------- | ------------------------------------------------ |
| `element` | [`XmlElement`](README.md#xmlelementname)<`Name`> |

##### Returns

`Name`

##### Defined in

[index.ts:334](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L334)

#### isXmlTextNode()

> `static` **isXmlTextNode**(`node`): `node is XmlTextNode`

Given an XMLNode, determine whether it represents a text node or an XML element.

##### Parameters

| Parameter | Type                           |
| --------- | ------------------------------ |
| `node`    | [`XmlNode`](README.md#xmlnode) |

##### Returns

`node is XmlTextNode`

##### Defined in

[index.ts:382](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L382)

#### replaceXmlChildren()

> `static` **replaceXmlChildren**<`Name`>(`element`, `children`): `void`

##### Type Parameters

| Type Parameter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Name` *extends* \`a${string}\` \| \`b${string}\` \| \`c${string}\` \| \`d${string}\` \| \`e${string}\` \| \`f${string}\` \| \`g${string}\` \| \`h${string}\` \| \`i${string}\` \| \`j${string}\` \| \`k${string}\` \| \`l${string}\` \| \`m${string}\` \| \`n${string}\` \| \`o${string}\` \| \`p${string}\` \| \`q${string}\` \| \`r${string}\` \| \`s${string}\` \| \`t${string}\` \| \`u${string}\` \| \`v${string}\` \| \`w${string}\` \| \`x${string}\` \| \`y${string}\` \| \`z${string}\` \| \`A${string}\` \| \`B${string}\` \| \`C${string}\` \| \`D${string}\` \| \`E${string}\` \| \`F${string}\` \| \`G${string}\` \| \`H${string}\` \| \`I${string}\` \| \`J${string}\` \| \`K${string}\` \| \`L${string}\` \| \`M${string}\` \| \`N${string}\` \| \`O${string}\` \| \`P${string}\` \| \`Q${string}\` \| \`R${string}\` \| \`S${string}\` \| \`T${string}\` \| \`U${string}\` \| \`V${string}\` \| \`W${string}\` \| \`X${string}\` \| \`Y${string}\` \| \`Z${string}\` \| \`?${string}\` |

##### Parameters

| Parameter  | Type                                             |
| ---------- | ------------------------------------------------ |
| `element`  | [`XmlElement`](README.md#xmlelementname)<`Name`> |
| `children` | [`XmlNode`](README.md#xmlnode)\[]                |

##### Returns

`void`

##### Defined in

[index.ts:357](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L357)

***

## AlternateScript

### Properties

#### locale

> **locale**: `Locale`

##### Defined in

[index.ts:142](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L142)

#### name

> **name**: `string`

##### Defined in

[index.ts:141](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L141)

***

## DcCreator

### Properties

#### alternateScripts?

> `optional` **alternateScripts**:
> [`AlternateScript`](README.md#alternatescript)\[]

##### Defined in

[index.ts:149](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L149)

#### fileAs?

> `optional` **fileAs**: `string`

##### Defined in

[index.ts:148](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L148)

#### name

> **name**: `string`

##### Defined in

[index.ts:146](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L146)

#### role?

> `optional` **role**: `string`

##### Defined in

[index.ts:147](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L147)

***

## DcSubject

### Properties

#### authority

> **authority**: `string`

##### Defined in

[index.ts:136](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L136)

#### term

> **term**: `string`

##### Defined in

[index.ts:137](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L137)

#### value

> **value**: `string`

##### Defined in

[index.ts:135](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L135)

***

## DublinCore

### Properties

#### contributors?

> `optional` **contributors**: [`DcCreator`](README.md#dccreator)\[]

##### Defined in

[index.ts:159](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L159)

#### creators?

> `optional` **creators**: [`DcCreator`](README.md#dccreator)\[]

##### Defined in

[index.ts:158](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L158)

#### date?

> `optional` **date**: `Date`

##### Defined in

[index.ts:156](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L156)

#### identifier

> **identifier**: `string`

##### Defined in

[index.ts:155](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L155)

#### language

> **language**: `Locale`

##### Defined in

[index.ts:154](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L154)

#### subjects?

> `optional` **subjects**: (`string` | [`DcSubject`](README.md#dcsubject))\[]

##### Defined in

[index.ts:157](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L157)

#### title

> **title**: `string`

##### Defined in

[index.ts:153](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L153)

#### type?

> `optional` **type**: `string`

##### Defined in

[index.ts:160](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L160)

***

## ElementName

> **ElementName**:
> \`${Letter | Uppercase\<Letter> | QuestionMark}${string}\`

A valid name for an XML element (must start with a letter)

### Defined in

[index.ts:63](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L63)

***

## EpubMetadata

> **EpubMetadata**: [`MetadataEntry`](README.md#metadataentry)\[]

### Defined in

[index.ts:132](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L132)

***

## ManifestItem

> **ManifestItem**: `object`

### Type declaration

#### fallback?

> `optional` **fallback**: `string`

#### href

> **href**: `string`

#### id

> **id**: `string`

#### mediaOverlay?

> `optional` **mediaOverlay**: `string`

#### mediaType?

> `optional` **mediaType**: `string`

#### properties?

> `optional` **properties**: `string`\[]

### Defined in

[index.ts:82](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L82)

***

## MetadataEntry

> **MetadataEntry**: `object`

### Type declaration

#### id?

> `optional` **id**: `string`

#### properties

> **properties**: `Record`<`string`, `string`>

#### type

> **type**: [`ElementName`](README.md#elementname)

#### value

> **value**: `string` | `undefined`

### Defined in

[index.ts:125](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L125)

***

## ParsedXml

> **ParsedXml**: [`XmlNode`](README.md#xmlnode)\[]

An XML structure

### Defined in

[index.ts:80](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L80)

***

## XmlElement\<Name>

> **XmlElement**<`Name`>: `object` & `{ [key in Name]: ParsedXml }`

An XML element

### Type declaration

#### :@?

> `optional` **:@**: `Record`<`string`, `string`>

### Type Parameters

| Type Parameter                                          | Default type                           |
| ------------------------------------------------------- | -------------------------------------- |
| `Name` *extends* [`ElementName`](README.md#elementname) | [`ElementName`](README.md#elementname) |

### Defined in

[index.ts:67](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L67)

***

## XmlNode

> **XmlNode**: [`XmlElement`](README.md#xmlelementname) |
> [`XmlTextNode`](README.md#xmltextnode)

A valid XML node. May be either an element or a text node.

### Defined in

[index.ts:77](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L77)

***

## XmlTextNode

> **XmlTextNode**: `object`

A text node in an XML document

### Type declaration

#### #text

> **#text**: `string`

### Defined in

[index.ts:74](https://gitlab.com/smoores/storyteller/-/blob/main/epub/index.ts#L74)
