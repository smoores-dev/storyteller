# @storyteller-platform/uri-fragment

A JavaScript library for parsing, building, and serializing
[URI fragments](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment).

Supports:

- Anchor fragments (`#paragraph01`)
- [Media fragments](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment/Media_fragments)
  (`#t=3.2`, `#xywh=25,25,50,50`)
- [Text fragments](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment/Text_fragments)
  (`:~:text=the%20end`)
- [Character fragments](https://datatracker.ietf.org/doc/html/rfc5147#section-2.2.1)
  (`#char=100`, `#char=100,150`)
- [EPUB CFI](https://w3c.github.io/epub-specs/epub33/epubcfi/)
  (`#epubcfi(/6/4!/4/10/3:10)`)
- [XPointer](https://www.w3.org/TR/xptr-xpointer/)
  (`#xpointer(id("introduction"))`)
- [KOReader crengine "xpointer"](https://github.com/koreader/koreader/issues/14690#issuecomment-4416018495),
  a non-standard fragment to represent KOReader's crengine's non-standard
  "xpointer" implementation (has almost nothing to do with the W3C XPointer
  spec). (`#crengine(/body/DocFragment/body/div/p[4]/text()[1].64)`)

Also supports mixing fragments where supported by the spec(s). For example, any
URI fragment may contain one identifier _and_ any number of directives, e.g.,
`#paragraph01:~:text=first&text=second`. Also, media identifiers may contain
multiple dimensions, e.g., `#t=15,75&xywh=percent:25,25,50,50`.

- [Installation](#installation)
- [About](#about)
- [Usage](#usage)
- [Development](#development)

## Installation

npm:

```sh
npm install @storyteller-platform/uri-fragment
```

yarn:

```sh
yarn add @storyteller-platform/uri-fragment
```

deno:

```sh
deno install npm:@storyteller-platform/uri-fragment
```

## About

URI's may terminate with a URI fragment. Different media types have different
specifications regarding how to interpret these fragments, as well as (sometimes
complex) grammars for parsing them. Standard URI parsers (e.g., `new URL()`) do
not parse the fragment, returning it as is.

The goal of this library is to accept a fragment parsed by a URI parser and
further parse it into a semantically useful object that can be inspected and
operated on.

## Usage

### Parsing

```ts
// Parsing a text directive
const url = new URL("https://example.com/example#:~:text=permission,.")

const fragment = new UriFragment(url.hash)

console.log(fragment.directive.text[0]?.decodedTextStart)

// => "permission"

console.log(fragment.directive.text[0]?.decodedTextEnd)

// => "."
```

```ts
// Parsing a media identifier
const url = new URL(
  "https://example.com/video.mp4#t=01:30,02:15&xywh=percent:25,25,50,50",
)

const fragment = new UriFragment(url.hash)

console.log(fragment.identifier?.kind)

// => "media"

console.log(fragment.identifier?.media.temporal?.parsedTimeStart)

// => 90

console.log(fragment.identifier?.media.spatial?.xCoord)

// => 25
```

### Building

```ts
const fragment = new UriFragment()

fragment.directive.appendTextDirective("permission,.")

const media = new MediaDimensions()

media.temporal = new MediaTemporalDimension()

media.temporal.timeStart = "3.5"

fragment.setIdentifier("media", { media })

console.log(fragment.toString())

// => `#t=3.5:~:text=permission,.`
```

## Development

This package lives in the
[Storyteller monorepo](https://gitlab.com/storyteller-platform/storyteller), and
is developed alongside the
[Storyteller platform](https://storyteller-platform.dev).

To get started with developing in the Storyteller monorepo, check out the
[development guides in the docs](https://storyteller-platform.dev/docs/category/development).
