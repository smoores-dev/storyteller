# @storyteller-platform/audiobooklib

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
npm install @storyteller-platform/audiobooklib
```

yarn:

```sh
yarn add @storyteller-platform/audiobooklib
```

deno:

```sh
deno install npm:@storyteller-platform/audiobooklib
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

`@storyteller-platform/audiobooklib` provides an API to interact with the
metadata, of an audiobook publication. It provides a consistent interface that
attempts to abstract away differences in metadata representations across audio
formats and publishers.

## Usage

The entrypoint to the library is through the [`Audiobook`](#audiobook) class. An
`Audiobook` can be constructed from existing audio data, either read from disk
or already in memory as a typed array.

### Reading from a single file

```ts
import { Audiobook } from "@storyteller-platform/audiobooklib/node"

const audiobook = await Audiobook.from("path/to/book.m4b")
console.log(await audiobook.getTitle())
```

### Reading from a set of files

```ts
import { Audiobook } from "@storyteller-platform/audiobooklib/node"

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
import { Audiobook } from "@storyteller-platform/audiobooklib"

const audioData: Uint8Array = await requestAudioData()

const audiobook = await Audiobook.from({
  filename: "audiobook.m4b",
  data: audioData,
})

console.log(await audiobook.getTitle())
```

### Writing to disk

```ts
import { Audiobook } from "@storyteller-platform/audiobooklib/node"

const audiobook = await Audiobook.from("path/to/audiobook.m4b")
await audiobook.setTitle("S'mores for Everyone")

await audiobook.save()
audiobook.close()
```

### Writing to a byte array

```ts
import { Audiobook } from "@storyteller-platform/audiobooklib"

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
