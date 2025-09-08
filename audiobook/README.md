# @storyteller-platform/audiobook

A Node.js library for inspecting, modifying, and creating audiobooks.

<!-- toc -->

- [Installation](#installation)
- [About](#about)
  - [Audiobook Basics](#audiobook-basics)
  - [What this library does](#what-this-library-does)
- [Usage](#usage)
  - [Reading from a single file](#reading-from-a-single-file)
  - [Reading from a set of files](#reading-from-a-set-of-files)
  - [Reading from an array](#reading-from-an-array)
  - [Writing to disk](#writing-to-disk)
  - [Writing to a byte array](#writing-to-a-byte-array)
- [Development](#development)
- [API Docs](#api-docs)

<!-- tocstop -->

## Installation

npm:

```sh
npm install @storyteller-platform/audiobook
```

yarn:

```sh
yarn add @storyteller-platform/audiobook
```

deno:

```sh
deno install npm:@storyteller-platform/audiobook
```

## About

This is a library for working with audiobooks. Audiobooks may be distributed as
single audio files, folders of audio files, or ZIP archives of audio files.
Publishers use audio tags inconsistently and sometimes confusingly to store
metadata within audiobook files — this library provides a consistent interface
for reading and writing metadata to audiobook files.

### Audiobook Basics

An audiobook may be distributed as single audio files, folders of audio files,
or ZIP archives of audio files. Chapter/track information, cover art, and
metadata about the audiobook is often provided as metadata within the audio
files. Different publishers may use different tags to represent the same piece
of metadata, and may format metadata differently (e.g. using `/` instead of `;`
to separate lists of entities).

### What this library does

`@storyteller-platform/audiobook` provides an API to interact with the metadata,
of an audiobook publication. It provides a consistent interface that attempts to
abstract away differences in metadata representations across audio formats and
publishers.

## Usage

The entrypoint to the library is through the [`Audiobook`](#audiobook) class. An
`Audiobook` can be constructed from existing audio data, either read from disk
or already in memory as a typed array.

### Reading from a single file

```ts
import { Audiobook } from "@storyteller-platform/audiobook/node"

const audiobook = await Audiobook.from("path/to/book.m4b")
console.log(await audiobook.getTitle())
```

### Reading from a set of files

```ts
import { Audiobook } from "@storyteller-platform/audiobook/node"

const audiobook = await Audiobook.from([
  "path/to/track1.mp3",
  "path/to/track2.mp3",
  "path/to/track3.mp3",
  "path/to/track4.mp3",
])
console.log(await audiobook.getTitle())
```

### Reading from an array

```ts
import { Audiobook } from "@storyteller-platform/audiobook"

const audioData: Uint8Array = await requestAudioData()

const audiobook = await Audiobook.from({
  filename: "audiobook.m4b",
  data: audioData,
})

console.log(await audiobook.getTitle())
```

### Writing to disk

```ts
import { Audiobook } from "@storyteller-platform/audiobook/node"

const audiobook = await Audiobook.from("path/to/audiobook.m4b")
await audiobook.setTitle("S'mores for Everyone")

await audiobook.save()
audiobook.close()
```

### Writing to a byte array

```ts
import { Audiobook } from "@storyteller-platform/audiobook"

const audioData: Uint8Array = await requestAudioData()

const audiobook = await Audiobook.from({
  filename: "audiobook.m4b",
  data: audioData,
})

await audiobook.setTitle("S'mores for Everyone")

const updated = await audiobook.save()
```

For more details about using the API, see the [API documentation](#audiobook).

## Development

This package lives in the
[Storyteller monorepo](https://gitlab.com/storyteller-platform/storyteller), and
is developed alongside the
[Storyteller platform](https://storyteller-platform.gitlab.io/storyteller).

To get started with developing in the Storyteller monorepo, check out the
[development guides in the docs](https://storyteller-platform.gitlab.io/storyteller/docs/category/development).

# node

## Audiobook

Defined in:
[node/index.ts:20](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/index.ts#L20)

### Extends

- [`BaseAudiobook`](#baseaudiobook)

### Constructors

#### Constructor

> `protected` **new Audiobook**(`entries`, `zipPath?`):
> [`Audiobook`](#audiobook)

Defined in:
[node/index.ts:21](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/index.ts#L21)

##### Parameters

| Parameter  | Type                                  |
| ---------- | ------------------------------------- |
| `entries`  | [`AudiobookEntry`](#audiobookentry)[] |
| `zipPath?` | `string`                              |

##### Returns

[`Audiobook`](#audiobook)

##### Overrides

[`BaseAudiobook`](#baseaudiobook).[`constructor`](#baseaudiobook#constructor)

### Properties

#### entries

> `protected` **entries**: [`AudiobookEntry`](#audiobookentry)[]

Defined in:
[node/index.ts:22](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/index.ts#L22)

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`entries`](#baseaudiobook#entries)

#### metadata

> `protected` **metadata**: [`AudiobookMetadata`](#audiobookmetadata) = `{}`

Defined in:
[base.ts:175](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L175)

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`metadata`](#baseaudiobook#metadata)

#### zipPath?

> `protected` `optional` **zipPath**: `string`

Defined in:
[node/index.ts:23](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/index.ts#L23)

### Methods

#### close()

> **close**(): `void`

Defined in:
[node/index.ts:104](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/index.ts#L104)

##### Returns

`void`

#### getAuthors()

> **getAuthors**(): `Promise`\<`string`[]\>

Defined in:
[base.ts:247](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L247)

##### Returns

`Promise`\<`string`[]\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`getAuthors`](#baseaudiobook#getauthors)

#### getCoverArt()

> **getCoverArt**(): `Promise`\<`null` \| `IPicture`\>

Defined in:
[base.ts:277](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L277)

##### Returns

`Promise`\<`null` \| `IPicture`\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`getCoverArt`](#baseaudiobook#getcoverart)

#### getDescription()

> **getDescription**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:230](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L230)

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`getDescription`](#baseaudiobook#getdescription)

#### getFirstValue()

> `protected` **getFirstValue**\<`T`\>(`getter`): `Promise`\<`null` \| `T`\>

Defined in:
[base.ts:178](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L178)

##### Type Parameters

| Type Parameter |
| -------------- |
| `T`            |

##### Parameters

| Parameter | Type                          |
| --------- | ----------------------------- |
| `getter`  | (`entry`) => `Promise`\<`T`\> |

##### Returns

`Promise`\<`null` \| `T`\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`getFirstValue`](#baseaudiobook#getfirstvalue)

#### getNarrators()

> **getNarrators**(): `Promise`\<`string`[]\>

Defined in:
[base.ts:262](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L262)

##### Returns

`Promise`\<`string`[]\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`getNarrators`](#baseaudiobook#getnarrators)

#### getPublisher()

> **getPublisher**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:293](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L293)

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`getPublisher`](#baseaudiobook#getpublisher)

#### getReleased()

> **getReleased**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:308](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L308)

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`getReleased`](#baseaudiobook#getreleased)

#### getSubtitle()

> **getSubtitle**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:214](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L214)

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`getSubtitle`](#baseaudiobook#getsubtitle)

#### getTitle()

> **getTitle**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:198](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L198)

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`getTitle`](#baseaudiobook#gettitle)

#### save()

> **save**(): `Promise`\<`undefined` \| >
> [`Uint8ArrayEntry`](#uint8arrayentry)[]\>

Defined in:
[node/index.ts:57](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/index.ts#L57)

##### Returns

`Promise`\<`undefined` \| [`Uint8ArrayEntry`](#uint8arrayentry)[]\>

#### setAuthors()

> **setAuthors**(`authors`): `Promise`\<`void`\>

Defined in:
[base.ts:256](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L256)

##### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `authors` | `string`[] |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`setAuthors`](#baseaudiobook#setauthors)

#### setCoverArt()

> **setCoverArt**(`picture`): `Promise`\<`void`\>

Defined in:
[node/index.ts:95](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/index.ts#L95)

##### Parameters

| Parameter | Type                   |
| --------- | ---------------------- |
| `picture` | `string` \| `IPicture` |

##### Returns

`Promise`\<`void`\>

##### Overrides

[`BaseAudiobook`](#baseaudiobook).[`setCoverArt`](#baseaudiobook#setcoverart)

#### setDescription()

> **setDescription**(`description`): `Promise`\<`void`\>

Defined in:
[base.ts:241](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L241)

##### Parameters

| Parameter     | Type     |
| ------------- | -------- |
| `description` | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`setDescription`](#baseaudiobook#setdescription)

#### setNarrators()

> **setNarrators**(`narrators`): `Promise`\<`void`\>

Defined in:
[base.ts:271](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L271)

##### Parameters

| Parameter   | Type       |
| ----------- | ---------- |
| `narrators` | `string`[] |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`setNarrators`](#baseaudiobook#setnarrators)

#### setPublisher()

> **setPublisher**(`publisher`): `Promise`\<`void`\>

Defined in:
[base.ts:302](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L302)

##### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `publisher` | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`setPublisher`](#baseaudiobook#setpublisher)

#### setReleased()

> **setReleased**(`released`): `Promise`\<`void`\>

Defined in:
[base.ts:317](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L317)

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `released` | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`setReleased`](#baseaudiobook#setreleased)

#### setSubtitle()

> **setSubtitle**(`subtitle`): `Promise`\<`void`\>

Defined in:
[base.ts:224](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L224)

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `subtitle` | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`setSubtitle`](#baseaudiobook#setsubtitle)

#### setTitle()

> **setTitle**(`title`): `Promise`\<`void`\>

Defined in:
[base.ts:208](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L208)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `title`   | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`setTitle`](#baseaudiobook#settitle)

#### setValue()

> `protected` **setValue**(`setter`): `Promise`\<`void`\>

Defined in:
[base.ts:190](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L190)

##### Parameters

| Parameter | Type                             |
| --------- | -------------------------------- |
| `setter`  | (`entry`) => `Promise`\<`void`\> |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobook`](#baseaudiobook).[`setValue`](#baseaudiobook#setvalue)

#### from()

> `static` **from**(`pathOrPathsOrData`): `Promise`\<[`Audiobook`](#audiobook)\>

Defined in:
[node/index.ts:28](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/index.ts#L28)

##### Parameters

| Parameter           | Type                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pathOrPathsOrData` | `string` \| `string`[] \| [`Uint8ArrayEntry`](#uint8arrayentry) \| [`Uint8ArrayEntry`](#uint8arrayentry)[] |

##### Returns

`Promise`\<[`Audiobook`](#audiobook)\>

# entry

## API Docs

## AudiobookEntry

Defined in:
[entry.ts:12](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/entry.ts#L12)

### Extends

- [`BaseAudiobookEntry`](#baseaudiobookentry)

### Constructors

#### Constructor

> **new AudiobookEntry**(`entry`): [`AudiobookEntry`](#audiobookentry)

Defined in:
[entry.ts:41](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/entry.ts#L41)

##### Parameters

| Parameter | Type                                             |
| --------- | ------------------------------------------------ |
| `entry`   | [`Uint8ArrayEntry`](#uint8arrayentry) \| `Entry` |

##### Returns

[`AudiobookEntry`](#audiobookentry)

##### Overrides

[`BaseAudiobookEntry`](#baseaudiobookentry).[`constructor`](#baseaudiobookentry#constructor-1)

### Properties

#### entry

> `protected` **entry**: [`Uint8ArrayEntry`](#uint8arrayentry) \| `Entry`

Defined in:
[entry.ts:41](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/entry.ts#L41)

#### file

> `protected` **file**: `null` \| `File` = `null`

Defined in:
[entry.ts:15](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/entry.ts#L15)

##### Overrides

[`BaseAudiobookEntry`](#baseaudiobookentry).[`file`](#baseaudiobookentry#file)

#### filename

> **filename**: `string`

Defined in:
[entry.ts:13](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/entry.ts#L13)

##### Overrides

[`BaseAudiobookEntry`](#baseaudiobookentry).[`filename`](#baseaudiobookentry#filename)

### Methods

#### createFile()

> **createFile**(): `Promise`\<`File`\>

Defined in:
[entry.ts:34](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/entry.ts#L34)

##### Returns

`Promise`\<`File`\>

##### Overrides

[`BaseAudiobookEntry`](#baseaudiobookentry).[`createFile`](#baseaudiobookentry#createfile)

#### getAuthors()

> **getAuthors**(): `Promise`\<`string`[]\>

Defined in:
[base.ts:57](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L57)

##### Returns

`Promise`\<`string`[]\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`getAuthors`](#baseaudiobookentry#getauthors-2)

#### getCoverArt()

> **getCoverArt**(): `Promise`\<`null` \| `IPicture`\>

Defined in:
[base.ts:106](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L106)

##### Returns

`Promise`\<`null` \| `IPicture`\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`getCoverArt`](#baseaudiobookentry#getcoverart-2)

#### getData()

> **getData**(): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in:
[entry.ts:29](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/entry.ts#L29)

##### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

##### Overrides

[`BaseAudiobookEntry`](#baseaudiobookentry).[`getData`](#baseaudiobookentry#getdata)

#### getDescription()

> **getDescription**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:45](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L45)

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`getDescription`](#baseaudiobookentry#getdescription-2)

#### getFile()

> **getFile**(): `Promise`\<`File`\>

Defined in:
[base.ts:17](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L17)

##### Returns

`Promise`\<`File`\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`getFile`](#baseaudiobookentry#getfile)

#### getNarrators()

> **getNarrators**(): `Promise`\<`string`[]\>

Defined in:
[base.ts:84](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L84)

##### Returns

`Promise`\<`string`[]\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`getNarrators`](#baseaudiobookentry#getnarrators-2)

#### getPublisher()

> **getPublisher**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:130](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L130)

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`getPublisher`](#baseaudiobookentry#getpublisher-2)

#### getReleased()

> **getReleased**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:140](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L140)

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`getReleased`](#baseaudiobookentry#getreleased-2)

#### getSubtitle()

> **getSubtitle**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:35](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L35)

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`getSubtitle`](#baseaudiobookentry#getsubtitle-2)

#### getTitle()

> **getTitle**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:25](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L25)

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`getTitle`](#baseaudiobookentry#gettitle-2)

#### readData()

> `protected` **readData**(): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in:
[entry.ts:17](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/entry.ts#L17)

##### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

#### save()

> **save**(): `void`

Defined in:
[base.ts:150](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L150)

##### Returns

`void`

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`save`](#baseaudiobookentry#save)

#### setAuthors()

> **setAuthors**(`authors`): `Promise`\<`void`\>

Defined in:
[base.ts:75](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L75)

##### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `authors` | `string`[] |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`setAuthors`](#baseaudiobookentry#setauthors-2)

#### setCoverArt()

> **setCoverArt**(`picture`): `Promise`\<`void`\>

Defined in:
[base.ts:116](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L116)

##### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `picture` | `IPicture` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`setCoverArt`](#baseaudiobookentry#setcoverart-2)

#### setDescription()

> **setDescription**(`description`): `Promise`\<`void`\>

Defined in:
[base.ts:52](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L52)

##### Parameters

| Parameter     | Type     |
| ------------- | -------- |
| `description` | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`setDescription`](#baseaudiobookentry#setdescription-2)

#### setNarrators()

> **setNarrators**(`narrators`): `Promise`\<`void`\>

Defined in:
[base.ts:100](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L100)

##### Parameters

| Parameter   | Type       |
| ----------- | ---------- |
| `narrators` | `string`[] |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`setNarrators`](#baseaudiobookentry#setnarrators-2)

#### setPublisher()

> **setPublisher**(`publisher`): `Promise`\<`void`\>

Defined in:
[base.ts:135](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L135)

##### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `publisher` | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`setPublisher`](#baseaudiobookentry#setpublisher-2)

#### setReleased()

> **setReleased**(`released`): `Promise`\<`void`\>

Defined in:
[base.ts:145](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L145)

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `released` | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`setReleased`](#baseaudiobookentry#setreleased-2)

#### setSubtitle()

> **setSubtitle**(`subtitle`): `Promise`\<`void`\>

Defined in:
[base.ts:40](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L40)

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `subtitle` | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`setSubtitle`](#baseaudiobookentry#setsubtitle-2)

#### setTitle()

> **setTitle**(`title`): `Promise`\<`void`\>

Defined in:
[base.ts:30](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L30)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `title`   | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](#baseaudiobookentry).[`setTitle`](#baseaudiobookentry#settitle-2)

---

## Uint8ArrayEntry

Defined in:
[entry.ts:7](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/entry.ts#L7)

### Properties

#### data

> **data**: `Uint8Array`

Defined in:
[entry.ts:9](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/entry.ts#L9)

#### filename

> **filename**: `string`

Defined in:
[entry.ts:8](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/entry.ts#L8)

# base

## API Docs

## `abstract` BaseAudiobook

Defined in:
[base.ts:174](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L174)

### Extended by

- [`Audiobook`](#audiobook)

### Constructors

#### Constructor

> **new BaseAudiobook**(): [`BaseAudiobook`](#baseaudiobook)

##### Returns

[`BaseAudiobook`](#baseaudiobook)

### Properties

#### entries

> `abstract` `protected` **entries**:
> [`BaseAudiobookEntry`](#baseaudiobookentry)[]

Defined in:
[base.ts:176](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L176)

#### metadata

> `protected` **metadata**: [`AudiobookMetadata`](#audiobookmetadata) = `{}`

Defined in:
[base.ts:175](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L175)

### Methods

#### getAuthors()

> **getAuthors**(): `Promise`\<`string`[]\>

Defined in:
[base.ts:247](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L247)

##### Returns

`Promise`\<`string`[]\>

#### getCoverArt()

> **getCoverArt**(): `Promise`\<`null` \| `IPicture`\>

Defined in:
[base.ts:277](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L277)

##### Returns

`Promise`\<`null` \| `IPicture`\>

#### getDescription()

> **getDescription**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:230](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L230)

##### Returns

`Promise`\<`null` \| `string`\>

#### getFirstValue()

> `protected` **getFirstValue**\<`T`\>(`getter`): `Promise`\<`null` \| `T`\>

Defined in:
[base.ts:178](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L178)

##### Type Parameters

| Type Parameter |
| -------------- |
| `T`            |

##### Parameters

| Parameter | Type                          |
| --------- | ----------------------------- |
| `getter`  | (`entry`) => `Promise`\<`T`\> |

##### Returns

`Promise`\<`null` \| `T`\>

#### getNarrators()

> **getNarrators**(): `Promise`\<`string`[]\>

Defined in:
[base.ts:262](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L262)

##### Returns

`Promise`\<`string`[]\>

#### getPublisher()

> **getPublisher**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:293](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L293)

##### Returns

`Promise`\<`null` \| `string`\>

#### getReleased()

> **getReleased**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:308](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L308)

##### Returns

`Promise`\<`null` \| `string`\>

#### getSubtitle()

> **getSubtitle**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:214](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L214)

##### Returns

`Promise`\<`null` \| `string`\>

#### getTitle()

> **getTitle**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:198](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L198)

##### Returns

`Promise`\<`null` \| `string`\>

#### setAuthors()

> **setAuthors**(`authors`): `Promise`\<`void`\>

Defined in:
[base.ts:256](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L256)

##### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `authors` | `string`[] |

##### Returns

`Promise`\<`void`\>

#### setCoverArt()

> **setCoverArt**(`picture`): `Promise`\<`void`\>

Defined in:
[base.ts:287](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L287)

##### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `picture` | `IPicture` |

##### Returns

`Promise`\<`void`\>

#### setDescription()

> **setDescription**(`description`): `Promise`\<`void`\>

Defined in:
[base.ts:241](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L241)

##### Parameters

| Parameter     | Type     |
| ------------- | -------- |
| `description` | `string` |

##### Returns

`Promise`\<`void`\>

#### setNarrators()

> **setNarrators**(`narrators`): `Promise`\<`void`\>

Defined in:
[base.ts:271](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L271)

##### Parameters

| Parameter   | Type       |
| ----------- | ---------- |
| `narrators` | `string`[] |

##### Returns

`Promise`\<`void`\>

#### setPublisher()

> **setPublisher**(`publisher`): `Promise`\<`void`\>

Defined in:
[base.ts:302](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L302)

##### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `publisher` | `string` |

##### Returns

`Promise`\<`void`\>

#### setReleased()

> **setReleased**(`released`): `Promise`\<`void`\>

Defined in:
[base.ts:317](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L317)

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `released` | `string` |

##### Returns

`Promise`\<`void`\>

#### setSubtitle()

> **setSubtitle**(`subtitle`): `Promise`\<`void`\>

Defined in:
[base.ts:224](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L224)

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `subtitle` | `string` |

##### Returns

`Promise`\<`void`\>

#### setTitle()

> **setTitle**(`title`): `Promise`\<`void`\>

Defined in:
[base.ts:208](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L208)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `title`   | `string` |

##### Returns

`Promise`\<`void`\>

#### setValue()

> `protected` **setValue**(`setter`): `Promise`\<`void`\>

Defined in:
[base.ts:190](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L190)

##### Parameters

| Parameter | Type                             |
| --------- | -------------------------------- |
| `setter`  | (`entry`) => `Promise`\<`void`\> |

##### Returns

`Promise`\<`void`\>

---

## `abstract` BaseAudiobookEntry

Defined in:
[base.ts:9](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L9)

### Extended by

- [`AudiobookEntry`](#audiobookentry)
- [`AudiobookEntry`](#audiobookentry)

### Constructors

#### Constructor

> **new BaseAudiobookEntry**(): [`BaseAudiobookEntry`](#baseaudiobookentry)

##### Returns

[`BaseAudiobookEntry`](#baseaudiobookentry)

### Properties

#### file

> `abstract` `protected` **file**: `null` \| `File`

Defined in:
[base.ts:11](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L11)

#### filename

> `abstract` **filename**: `string`

Defined in:
[base.ts:10](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L10)

### Methods

#### createFile()

> `abstract` **createFile**(): `Promise`\<`File`\>

Defined in:
[base.ts:15](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L15)

##### Returns

`Promise`\<`File`\>

#### getAuthors()

> **getAuthors**(): `Promise`\<`string`[]\>

Defined in:
[base.ts:57](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L57)

##### Returns

`Promise`\<`string`[]\>

#### getCoverArt()

> **getCoverArt**(): `Promise`\<`null` \| `IPicture`\>

Defined in:
[base.ts:106](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L106)

##### Returns

`Promise`\<`null` \| `IPicture`\>

#### getData()

> `abstract` **getData**(): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in:
[base.ts:13](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L13)

##### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

#### getDescription()

> **getDescription**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:45](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L45)

##### Returns

`Promise`\<`null` \| `string`\>

#### getFile()

> **getFile**(): `Promise`\<`File`\>

Defined in:
[base.ts:17](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L17)

##### Returns

`Promise`\<`File`\>

#### getNarrators()

> **getNarrators**(): `Promise`\<`string`[]\>

Defined in:
[base.ts:84](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L84)

##### Returns

`Promise`\<`string`[]\>

#### getPublisher()

> **getPublisher**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:130](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L130)

##### Returns

`Promise`\<`null` \| `string`\>

#### getReleased()

> **getReleased**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:140](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L140)

##### Returns

`Promise`\<`null` \| `string`\>

#### getSubtitle()

> **getSubtitle**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:35](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L35)

##### Returns

`Promise`\<`null` \| `string`\>

#### getTitle()

> **getTitle**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:25](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L25)

##### Returns

`Promise`\<`null` \| `string`\>

#### save()

> **save**(): `void`

Defined in:
[base.ts:150](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L150)

##### Returns

`void`

#### setAuthors()

> **setAuthors**(`authors`): `Promise`\<`void`\>

Defined in:
[base.ts:75](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L75)

##### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `authors` | `string`[] |

##### Returns

`Promise`\<`void`\>

#### setCoverArt()

> **setCoverArt**(`picture`): `Promise`\<`void`\>

Defined in:
[base.ts:116](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L116)

##### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `picture` | `IPicture` |

##### Returns

`Promise`\<`void`\>

#### setDescription()

> **setDescription**(`description`): `Promise`\<`void`\>

Defined in:
[base.ts:52](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L52)

##### Parameters

| Parameter     | Type     |
| ------------- | -------- |
| `description` | `string` |

##### Returns

`Promise`\<`void`\>

#### setNarrators()

> **setNarrators**(`narrators`): `Promise`\<`void`\>

Defined in:
[base.ts:100](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L100)

##### Parameters

| Parameter   | Type       |
| ----------- | ---------- |
| `narrators` | `string`[] |

##### Returns

`Promise`\<`void`\>

#### setPublisher()

> **setPublisher**(`publisher`): `Promise`\<`void`\>

Defined in:
[base.ts:135](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L135)

##### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `publisher` | `string` |

##### Returns

`Promise`\<`void`\>

#### setReleased()

> **setReleased**(`released`): `Promise`\<`void`\>

Defined in:
[base.ts:145](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L145)

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `released` | `string` |

##### Returns

`Promise`\<`void`\>

#### setSubtitle()

> **setSubtitle**(`subtitle`): `Promise`\<`void`\>

Defined in:
[base.ts:40](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L40)

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `subtitle` | `string` |

##### Returns

`Promise`\<`void`\>

#### setTitle()

> **setTitle**(`title`): `Promise`\<`void`\>

Defined in:
[base.ts:30](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L30)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `title`   | `string` |

##### Returns

`Promise`\<`void`\>

---

## AudiobookChapter

Defined in:
[base.ts:155](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L155)

### Properties

#### filename

> **filename**: `string`

Defined in:
[base.ts:156](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L156)

#### start

> **start**: `number`

Defined in:
[base.ts:157](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L157)

#### stop

> **stop**: `number`

Defined in:
[base.ts:158](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L158)

#### title

> **title**: `string`

Defined in:
[base.ts:159](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L159)

---

## AudiobookMetadata

Defined in:
[base.ts:162](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L162)

### Properties

#### authors?

> `optional` **authors**: `string`[]

Defined in:
[base.ts:168](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L168)

#### chapters?

> `optional` **chapters**: [`AudiobookChapter`](#audiobookchapter)[]

Defined in:
[base.ts:167](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L167)

#### coverArt?

> `optional` **coverArt**: `IPicture`

Defined in:
[base.ts:166](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L166)

#### description?

> `optional` **description**: `string`

Defined in:
[base.ts:165](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L165)

#### narrators?

> `optional` **narrators**: `string`[]

Defined in:
[base.ts:169](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L169)

#### publisher?

> `optional` **publisher**: `string`

Defined in:
[base.ts:170](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L170)

#### released?

> `optional` **released**: `string`

Defined in:
[base.ts:171](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L171)

#### subtitle?

> `optional` **subtitle**: `string`

Defined in:
[base.ts:164](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L164)

#### title?

> `optional` **title**: `string`

Defined in:
[base.ts:163](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L163)

# node/entry

## AudiobookEntry

Defined in:
[node/entry.ts:12](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/entry.ts#L12)

### Extends

- [`BaseAudiobookEntry`](../#baseaudiobookentry)

### Constructors

#### Constructor

> **new AudiobookEntry**(`entry`): [`AudiobookEntry`](#audiobookentry)

Defined in:
[node/entry.ts:17](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/entry.ts#L17)

##### Parameters

| Parameter | Type                                                            |
| --------- | --------------------------------------------------------------- |
| `entry`   | `string` \| [`Uint8ArrayEntry`](../#uint8arrayentry) \| `Entry` |

##### Returns

[`AudiobookEntry`](#audiobookentry)

##### Overrides

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`constructor`](../#baseaudiobookentry#constructor-1)

### Properties

#### entry

> `protected` **entry**: `string` \| >
> [`Uint8ArrayEntry`](../#uint8arrayentry) > \| `Entry`

Defined in:
[node/entry.ts:17](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/entry.ts#L17)

#### file

> `protected` **file**: `null` \| `File` = `null`

Defined in:
[node/entry.ts:15](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/entry.ts#L15)

##### Overrides

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`file`](../#baseaudiobookentry#file)

#### filename

> **filename**: `string`

Defined in:
[node/entry.ts:13](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/entry.ts#L13)

##### Overrides

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`filename`](../#baseaudiobookentry#filename)

### Methods

#### close()

> **close**(): `void`

Defined in:
[node/entry.ts:64](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/entry.ts#L64)

##### Returns

`void`

#### createFile()

> **createFile**(): `Promise`\<`File`\>

Defined in:
[node/entry.ts:22](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/entry.ts#L22)

##### Returns

`Promise`\<`File`\>

##### Overrides

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`createFile`](../#baseaudiobookentry#createfile)

#### getAuthors()

> **getAuthors**(): `Promise`\<`string`[]\>

Defined in:
[base.ts:57](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L57)

##### Returns

`Promise`\<`string`[]\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`getAuthors`](../#baseaudiobookentry#getauthors-2)

#### getCoverArt()

> **getCoverArt**(): `Promise`\<`null` \| `IPicture`\>

Defined in:
[base.ts:106](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L106)

##### Returns

`Promise`\<`null` \| `IPicture`\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`getCoverArt`](../#baseaudiobookentry#getcoverart-2)

#### getData()

> **getData**(): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in:
[node/entry.ts:35](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/entry.ts#L35)

##### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

##### Overrides

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`getData`](../#baseaudiobookentry#getdata)

#### getDescription()

> **getDescription**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:45](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L45)

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`getDescription`](../#baseaudiobookentry#getdescription-2)

#### getFile()

> **getFile**(): `Promise`\<`File`\>

Defined in:
[base.ts:17](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L17)

##### Returns

`Promise`\<`File`\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`getFile`](../#baseaudiobookentry#getfile)

#### getNarrators()

> **getNarrators**(): `Promise`\<`string`[]\>

Defined in:
[base.ts:84](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L84)

##### Returns

`Promise`\<`string`[]\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`getNarrators`](../#baseaudiobookentry#getnarrators-2)

#### getPublisher()

> **getPublisher**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:130](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L130)

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`getPublisher`](../#baseaudiobookentry#getpublisher-2)

#### getReleased()

> **getReleased**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:140](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L140)

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`getReleased`](../#baseaudiobookentry#getreleased-2)

#### getSubtitle()

> **getSubtitle**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:35](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L35)

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`getSubtitle`](../#baseaudiobookentry#getsubtitle-2)

#### getTitle()

> **getTitle**(): `Promise`\<`null` \| `string`\>

Defined in:
[base.ts:25](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L25)

##### Returns

`Promise`\<`null` \| `string`\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`getTitle`](../#baseaudiobookentry#gettitle-2)

#### persisted()

> **persisted**(): `boolean`

Defined in:
[node/entry.ts:60](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/entry.ts#L60)

##### Returns

`boolean`

#### readData()

> `protected` **readData**(): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in:
[node/entry.ts:44](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/node/entry.ts#L44)

##### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

#### save()

> **save**(): `void`

Defined in:
[base.ts:150](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L150)

##### Returns

`void`

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`save`](../#baseaudiobookentry#save)

#### setAuthors()

> **setAuthors**(`authors`): `Promise`\<`void`\>

Defined in:
[base.ts:75](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L75)

##### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `authors` | `string`[] |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`setAuthors`](../#baseaudiobookentry#setauthors-2)

#### setCoverArt()

> **setCoverArt**(`picture`): `Promise`\<`void`\>

Defined in:
[base.ts:116](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L116)

##### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `picture` | `IPicture` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`setCoverArt`](../#baseaudiobookentry#setcoverart-2)

#### setDescription()

> **setDescription**(`description`): `Promise`\<`void`\>

Defined in:
[base.ts:52](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L52)

##### Parameters

| Parameter     | Type     |
| ------------- | -------- |
| `description` | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`setDescription`](../#baseaudiobookentry#setdescription-2)

#### setNarrators()

> **setNarrators**(`narrators`): `Promise`\<`void`\>

Defined in:
[base.ts:100](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L100)

##### Parameters

| Parameter   | Type       |
| ----------- | ---------- |
| `narrators` | `string`[] |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`setNarrators`](../#baseaudiobookentry#setnarrators-2)

#### setPublisher()

> **setPublisher**(`publisher`): `Promise`\<`void`\>

Defined in:
[base.ts:135](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L135)

##### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `publisher` | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`setPublisher`](../#baseaudiobookentry#setpublisher-2)

#### setReleased()

> **setReleased**(`released`): `Promise`\<`void`\>

Defined in:
[base.ts:145](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L145)

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `released` | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`setReleased`](../#baseaudiobookentry#setreleased-2)

#### setSubtitle()

> **setSubtitle**(`subtitle`): `Promise`\<`void`\>

Defined in:
[base.ts:40](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L40)

##### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `subtitle` | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`setSubtitle`](../#baseaudiobookentry#setsubtitle-2)

#### setTitle()

> **setTitle**(`title`): `Promise`\<`void`\>

Defined in:
[base.ts:30](https://gitlab.com/storyteller-platform/storyteller/-/blob/main/audiobook/src/base.ts#L30)

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `title`   | `string` |

##### Returns

`Promise`\<`void`\>

##### Inherited from

[`BaseAudiobookEntry`](../#baseaudiobookentry).[`setTitle`](../#baseaudiobookentry#settitle-2)
