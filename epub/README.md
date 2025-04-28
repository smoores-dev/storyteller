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
    * [addCollection()](#addcollection)
    * [addContributor()](#addcontributor)
    * [addCreator()](#addcreator)
    * [addManifestItem()](#addmanifestitem)
    * [addMetadata()](#addmetadata)
    * [addSpineItem()](#addspineitem)
    * [addSubject()](#addsubject)
    * [close()](#close)
    * [createXhtmlDocument()](#createxhtmldocument)
    * [findAllMetadataItems()](#findallmetadataitems)
    * [findMetadataItem()](#findmetadataitem)
    * [getCollections()](#getcollections)
    * [getContributors()](#getcontributors)
    * [getCoverImage()](#getcoverimage)
    * [getCoverImageItem()](#getcoverimageitem)
    * [getCreators()](#getcreators)
    * [getDescription()](#getdescription)
    * [getLanguage()](#getlanguage)
    * [getManifest()](#getmanifest)
    * [getMetadata()](#getmetadata)
    * [getPackageVocabularyPrefixes()](#getpackagevocabularyprefixes)
    * [getPublicationDate()](#getpublicationdate)
    * [getSpineItems()](#getspineitems)
    * [getSubjects()](#getsubjects)
    * [getTitle()](#gettitle)
    * [getType()](#gettype)
    * [readItemContents()](#readitemcontents)
    * [readXhtmlItemContents()](#readxhtmlitemcontents)
    * [removeCollection()](#removecollection)
    * [removeContributor()](#removecontributor)
    * [removeCreator()](#removecreator)
    * [removeManifestItem()](#removemanifestitem)
    * [removeSpineItem()](#removespineitem)
    * [replaceMetadata()](#replacemetadata)
    * [setCoverImage()](#setcoverimage)
    * [setDescription()](#setdescription)
    * [setLanguage()](#setlanguage)
    * [setPackageVocabularyPrefix()](#setpackagevocabularyprefix)
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
* [Collection](#collection)
  * [Properties](#properties-2)
    * [name](#name-1)
    * [position?](#position)
    * [type?](#type)
* [DcCreator](#dccreator)
  * [Properties](#properties-3)
    * [alternateScripts?](#alternatescripts)
    * [fileAs?](#fileas)
    * [name](#name-2)
    * [role?](#role)
* [DcSubject](#dcsubject)
  * [Properties](#properties-4)
    * [authority](#authority)
    * [term](#term)
    * [value](#value)
* [DublinCore](#dublincore)
  * [Properties](#properties-5)
    * [contributors?](#contributors)
    * [creators?](#creators)
    * [date?](#date)
    * [identifier](#identifier)
    * [language](#language)
    * [subjects?](#subjects)
    * [title](#title)
    * [type?](#type-1)
* [ElementName](#elementname)
  * [Defined in](#defined-in-88)
* [EpubMetadata](#epubmetadata)
  * [Defined in](#defined-in-89)
* [ManifestItem](#manifestitem)
  * [Type declaration](#type-declaration)
    * [fallback?](#fallback)
    * [href](#href)
    * [id](#id)
    * [mediaOverlay?](#mediaoverlay)
    * [mediaType?](#mediatype)
    * [properties?](#properties-6)
  * [Defined in](#defined-in-90)
* [MetadataEntry](#metadataentry)
  * [Type declaration](#type-declaration-1)
    * [id?](#id-1)
    * [properties](#properties-7)
    * [type](#type-2)
    * [value](#value-1)
  * [Defined in](#defined-in-91)
* [ParsedXml](#parsedxml)
  * [Defined in](#defined-in-92)
* [XmlElement\<Name>](#xmlelementname)
  * [Type declaration](#type-declaration-2)
    * [:@?](#)
  * [Type Parameters](#type-parameters-5)
  * [Defined in](#defined-in-93)
* [XmlNode](#xmlnode)
  * [Defined in](#defined-in-94)
* [XmlTextNode](#xmltextnode)
  * [Type declaration](#type-declaration-3)
    * [#text](#text)
  * [Defined in](#defined-in-95)

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

[epub/index.ts:237](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L237)

#### xhtmlParser

> `static` **xhtmlParser**: `XMLParser`

##### Defined in

[epub/index.ts:205](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L205)

#### xmlBuilder

> `static` **xmlBuilder**: `XMLBuilder`

##### Defined in

[epub/index.ts:230](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L230)

#### xmlParser

> `static` **xmlParser**: `XMLParser`

##### Defined in

[epub/index.ts:198](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L198)

### Methods

#### addCollection()

> **addCollection**(`collection`, `index`?): `Promise`<`void`>

Add a collection to the EPUB metadata.

If index is provided, the collection will be placed at that index in the list of
collections. Otherwise, it will be added to the end of the list.

##### Parameters

| Parameter    | Type                                 |
| ------------ | ------------------------------------ |
| `collection` | [`Collection`](README.md#collection) |
| `index`?     | `number`                             |

##### Returns

`Promise`<`void`>

##### Defined in

[epub/index.ts:1402](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1402)

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

[epub/index.ts:1755](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1755)

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

[epub/index.ts:1594](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1594)

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

[epub/index.ts:2110](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2110)

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

[epub/index.ts:2115](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2115)

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

[epub/index.ts:2120](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2120)

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

[epub/index.ts:2243](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2243)

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

[epub/index.ts:1813](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1813)

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

[epub/index.ts:1041](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1041)

#### close()

> **close**(): `Promise`<`void`>

Close the Epub. Must be called before the Epub goes out of scope/is garbage
collected.

##### Returns

`Promise`<`void`>

##### Defined in

[epub/index.ts:425](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L425)

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

[epub/index.ts:1926](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1926)

#### findAllMetadataItems()

> **findAllMetadataItems**(`predicate`): `Promise`<`object`\[]>

Returns the item in the metadata element's children array that matches the
provided predicate.

##### Parameters

| Parameter   | Type                   |
| ----------- | ---------------------- |
| `predicate` | (`entry`) => `boolean` |

##### Returns

`Promise`<`object`\[]>

##### Defined in

[epub/index.ts:773](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L773)

#### findMetadataItem()

> **findMetadataItem**(`predicate`): `Promise`<`null` | { `id`: `undefined`
> \| `string`; `properties`: {}; `type`: \`a${string}\` | \`b${string}\`
> \| \`c${string}\` | \`d${string}\` |
> \`e${string}\` | \`f${string}\` | \`g${string}\` | \`h${string}\`
> \| \`i${string}\` | \`j${string}\` |
> \`k${string}\` | \`l${string}\` | \`m${string}\` | \`n${string}\`
> \| \`o${string}\` | \`p${string}\` |
> \`q${string}\` | \`r${string}\` | \`s${string}\` | \`t${string}\`
> \| \`u${string}\` | \`v${string}\` |
> \`w${string}\` | \`x${string}\` | \`y${string}\` | \`z${string}\`
> \| \`A${string}\` | \`B${string}\` |
> \`C${string}\` | \`D${string}\` | \`E${string}\` | \`F${string}\`
> \| \`G${string}\` | \`H${string}\` |
> \`I${string}\` | \`J${string}\` | \`K${string}\` | \`L${string}\`
> \| \`M${string}\` | \`N${string}\` |
> \`O${string}\` | \`P${string}\` | \`Q${string}\` | \`R${string}\`
> \| \`S${string}\` | \`T${string}\` |
> \`U${string}\` | \`V${string}\` | \`W${string}\` | \`X${string}\`
> \| \`Y${string}\` | \`Z${string}\` | \`?${string}\`; `value`:
> `undefined` | `string`; }>

Returns the item in the metadata element's children array that matches the
provided predicate.

##### Parameters

| Parameter   | Type                   |
| ----------- | ---------------------- |
| `predicate` | (`entry`) => `boolean` |

##### Returns

`Promise`<`null` | { `id`: `undefined` | `string`; `properties`: {};
`type`: \`a${string}\` | \`b${string}\` |
\`c${string}\` | \`d${string}\` | \`e${string}\` | \`f${string}\` |
\`g${string}\` | \`h${string}\` | \`i${string}\` | \`j${string}\` |
\`k${string}\` | \`l${string}\` | \`m${string}\` | \`n${string}\` |
\`o${string}\` | \`p${string}\` | \`q${string}\` | \`r${string}\` |
\`s${string}\` | \`t${string}\` | \`u${string}\` | \`v${string}\` |
\`w${string}\` | \`x${string}\` | \`y${string}\` | \`z${string}\` |
\`A${string}\` | \`B${string}\` | \`C${string}\` | \`D${string}\` |
\`E${string}\` | \`F${string}\` | \`G${string}\` | \`H${string}\` |
\`I${string}\` | \`J${string}\` | \`K${string}\` | \`L${string}\` |
\`M${string}\` | \`N${string}\` | \`O${string}\` | \`P${string}\` |
\`Q${string}\` | \`R${string}\` | \`S${string}\` | \`T${string}\` |
\`U${string}\` | \`V${string}\` | \`W${string}\` | \`X${string}\` |
\`Y${string}\` | \`Z${string}\` | \`?${string}\`; `value`: `undefined`
\| `string`; }>

##### Defined in

[epub/index.ts:764](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L764)

#### getCollections()

> **getCollections**(): `Promise`<[`Collection`](README.md#collection)\[]>

Retrieve the list of collections.

##### Returns

`Promise`<[`Collection`](README.md#collection)\[]>

##### Defined in

[epub/index.ts:1362](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1362)

#### getContributors()

> **getContributors**(): `Promise`<[`DcCreator`](README.md#dccreator)\[]>

Retrieve the list of contributors.

This is a convenience method for `epub.getCreators('contributor')`.

##### Returns

`Promise`<[`DcCreator`](README.md#dccreator)\[]>

##### Link

<https://www.w3.org/TR/epub-33/#sec-opf-dccontributor>

##### Defined in

[epub/index.ts:1581](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1581)

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

[epub/index.ts:944](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L944)

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

[epub/index.ts:925](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L925)

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

[epub/index.ts:1523](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1523)

#### getDescription()

> **getDescription**(): `Promise`<`null` | `string`>

Retrieve the Epub's description as specified in its package document metadata.

If no description metadata is specified, returns null. Returns the description
as a string. Descriptions may include HTML markup.

##### Returns

`Promise`<`null` | `string`>

##### Defined in

[epub/index.ts:1252](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1252)

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

[epub/index.ts:1125](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1125)

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

[epub/index.ts:674](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L674)

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

[epub/index.ts:847](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L847)

#### getPackageVocabularyPrefixes()

> **getPackageVocabularyPrefixes**(): `Promise`<`Record`<`string`,
> `string`>>

Return the set of custom vocabulary prefixes set on this publication's root
package element.

Returns a map from prefix to URI

##### Returns

`Promise`<`Record`<`string`, `string`>>

##### Link

<https://www.w3.org/TR/epub-33/#sec-prefix-attr>

##### Defined in

[epub/index.ts:1270](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1270)

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

[epub/index.ts:981](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L981)

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

[epub/index.ts:1794](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1794)

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

[epub/index.ts:1080](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1080)

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

[epub/index.ts:1167](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1167)

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

[epub/index.ts:1028](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1028)

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

[epub/index.ts:1898](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1898)

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

[epub/index.ts:1899](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1899)

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

[epub/index.ts:1959](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1959)

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

[epub/index.ts:1960](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1960)

#### removeCollection()

> **removeCollection**(`index`): `Promise`<`void`>

Remove a collection from the EPUB metadata.

Removes the collection at the provided index. This index refers to the array
returned by `epub.getCollections()`.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `index`   | `number` |

##### Returns

`Promise`<`void`>

##### Defined in

[epub/index.ts:1475](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1475)

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

[epub/index.ts:1739](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1739)

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

[epub/index.ts:1683](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1683)

#### removeManifestItem()

> **removeManifestItem**(`id`): `Promise`<`void`>

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

##### Returns

`Promise`<`void`>

##### Defined in

[epub/index.ts:2060](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2060)

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

[epub/index.ts:1853](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1853)

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

[epub/index.ts:2288](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2288)

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

[epub/index.ts:958](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L958)

#### setDescription()

> **setDescription**(`description`): `Promise`<`void`>

Update the Epub's description metadata entry.

Updates the existing dc:description element if one exists. Otherwise creates a
new element. Any non-ASCII symbols, `&`, `<`, `>`, `"`, `'`, and \`\`\`\` will be
encoded as HTML entities.

##### Parameters

| Parameter     | Type     |
| ------------- | -------- |
| `description` | `string` |

##### Returns

`Promise`<`void`>

##### Defined in

[epub/index.ts:1236](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1236)

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

[epub/index.ts:1150](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1150)

#### setPackageVocabularyPrefix()

> **setPackageVocabularyPrefix**(`prefix`, `uri`): `Promise`<`void`>

Set a custom vocabulary prefix on the root package element.

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `prefix`  | `string` |
| `uri`     | `string` |

##### Returns

`Promise`<`void`>

##### Link

<https://www.w3.org/TR/epub-33/#sec-prefix-attr>

##### Defined in

[epub/index.ts:1294](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1294)

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

[epub/index.ts:996](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L996)

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

[epub/index.ts:1325](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1325)

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

[epub/index.ts:1012](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L1012)

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

[epub/index.ts:2187](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2187)

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

[epub/index.ts:2012](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2012)

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

[epub/index.ts:2013](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2013)

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

[epub/index.ts:2339](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2339)

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

[epub/index.ts:2396](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2396)

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

[epub/index.ts:2052](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L2052)

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

[epub/index.ts:267](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L267)

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

[epub/index.ts:441](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L441)

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

[epub/index.ts:302](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L302)

#### createXmlTextNode()

> `static` **createXmlTextNode**(`text`): [`XmlTextNode`](README.md#xmltextnode)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `text`    | `string` |

##### Returns

[`XmlTextNode`](README.md#xmltextnode)

##### Defined in

[epub/index.ts:315](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L315)

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

[epub/index.ts:376](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L376)

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

[epub/index.ts:250](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L250)

#### from()

> `static` **from**(`pathOrData`): `Promise`<[`Epub`](README.md#epub)>

Construct an Epub instance by reading an existing EPUB publication.

##### Parameters

| Parameter    | Type                                        | Description                                                                                                                           |
| ------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pathOrData` | `string` \| `Uint8Array`<`ArrayBufferLike`> | Must be either a string representing the path to an EPUB file on disk, or a Uint8Array representing the data of the EPUB publication. |

##### Returns

`Promise`<[`Epub`](README.md#epub)>

##### Defined in

[epub/index.ts:522](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L522)

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

[epub/index.ts:292](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L292)

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

[epub/index.ts:324](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L324)

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

[epub/index.ts:356](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L356)

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

[epub/index.ts:341](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L341)

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

[epub/index.ts:389](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L389)

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

[epub/index.ts:364](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L364)

***

## AlternateScript

### Properties

#### locale

> **locale**: `Locale`

##### Defined in

[epub/index.ts:143](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L143)

#### name

> **name**: `string`

##### Defined in

[epub/index.ts:142](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L142)

***

## Collection

### Properties

#### name

> **name**: `string`

##### Defined in

[epub/index.ts:165](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L165)

#### position?

> `optional` **position**: `string`

##### Defined in

[epub/index.ts:167](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L167)

#### type?

> `optional` **type**: `string`

##### Defined in

[epub/index.ts:166](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L166)

***

## DcCreator

### Properties

#### alternateScripts?

> `optional` **alternateScripts**:
> [`AlternateScript`](README.md#alternatescript)\[]

##### Defined in

[epub/index.ts:150](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L150)

#### fileAs?

> `optional` **fileAs**: `string`

##### Defined in

[epub/index.ts:149](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L149)

#### name

> **name**: `string`

##### Defined in

[epub/index.ts:147](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L147)

#### role?

> `optional` **role**: `string`

##### Defined in

[epub/index.ts:148](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L148)

***

## DcSubject

### Properties

#### authority

> **authority**: `string`

##### Defined in

[epub/index.ts:137](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L137)

#### term

> **term**: `string`

##### Defined in

[epub/index.ts:138](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L138)

#### value

> **value**: `string`

##### Defined in

[epub/index.ts:136](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L136)

***

## DublinCore

### Properties

#### contributors?

> `optional` **contributors**: [`DcCreator`](README.md#dccreator)\[]

##### Defined in

[epub/index.ts:160](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L160)

#### creators?

> `optional` **creators**: [`DcCreator`](README.md#dccreator)\[]

##### Defined in

[epub/index.ts:159](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L159)

#### date?

> `optional` **date**: `Date`

##### Defined in

[epub/index.ts:157](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L157)

#### identifier

> **identifier**: `string`

##### Defined in

[epub/index.ts:156](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L156)

#### language

> **language**: `Locale`

##### Defined in

[epub/index.ts:155](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L155)

#### subjects?

> `optional` **subjects**: (`string` | [`DcSubject`](README.md#dcsubject))\[]

##### Defined in

[epub/index.ts:158](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L158)

#### title

> **title**: `string`

##### Defined in

[epub/index.ts:154](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L154)

#### type?

> `optional` **type**: `string`

##### Defined in

[epub/index.ts:161](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L161)

***

## ElementName

> **ElementName**:
> \`${Letter | Uppercase\<Letter> | QuestionMark}${string}\`

A valid name for an XML element (must start with a letter)

### Defined in

[epub/index.ts:64](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L64)

***

## EpubMetadata

> **EpubMetadata**: [`MetadataEntry`](README.md#metadataentry)\[]

### Defined in

[epub/index.ts:133](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L133)

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

[epub/index.ts:83](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L83)

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

[epub/index.ts:126](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L126)

***

## ParsedXml

> **ParsedXml**: [`XmlNode`](README.md#xmlnode)\[]

An XML structure

### Defined in

[epub/index.ts:81](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L81)

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

[epub/index.ts:68](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L68)

***

## XmlNode

> **XmlNode**: [`XmlElement`](README.md#xmlelementname) |
> [`XmlTextNode`](README.md#xmltextnode)

A valid XML node. May be either an element or a text node.

### Defined in

[epub/index.ts:78](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L78)

***

## XmlTextNode

> **XmlTextNode**: `object`

A text node in an XML document

### Type declaration

#### #text

> **#text**: `string`

### Defined in

[epub/index.ts:75](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/epub/index.ts#L75)
