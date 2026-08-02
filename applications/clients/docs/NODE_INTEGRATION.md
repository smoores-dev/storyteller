# Node Integration

`StorytellerNode` is a [Node-API](https://nodejs.org/api/n-api.html) addon: a
Node process can `require()` it and search book metadata (Audnexus, Hardcover)
and cover art (Apple, Hardcover) through one API, without knowing anything about
the providers behind it.

## Building

```sh
scripts/nodebuild
```

That builds the addon and writes it to `.build/StorytellerNode.node`. It builds
release by default; pass `--debug` for a faster iteration loop, and anything
after the flags goes to `swift build`. The equivalent by hand is
`swift build -c release --product StorytellerNode`, on macOS or Linux.

Check a build with:

```sh
node -e 'require("./.build/StorytellerNode.node").coverSearch(JSON.stringify({title:"project hail mary"})).then(r => console.log(JSON.parse(r).length, "covers"))'
```

## Usage Overview

Start by `require`ing the built file, then (optionally) hand it your provider
keys once at startup:

```js
const storyteller = require("./.build/StorytellerNode.node")

await storyteller.configure(
  JSON.stringify({ tokens: { hardcover: process.env.HARDCOVER_TOKEN } }),
)
```

You are now ready to call one of the available functions, e.g.
`storyteller.metadataBook`, to perform a cover/metadata lookup. Every function
takes a single JSON string of options and returns a promise. All but `download`
resolve to a JSON string, so a call reads
`JSON.parse(await storyteller.someExportedFunction(JSON.stringify({ ... })))`.

The table below lists the available exported functions:

| Export            | Parameters                                                 | Resolves to                          |
| ----------------- | ---------------------------------------------------------- | ------------------------------------ |
| `configure`       | `tokens` (object keyed by provider)                        | Nothing                              |
| `metadataSearch`  | `title`, `author?`, `provider?` or `providers?`, `region?` | Array of search results              |
| `metadataBook`    | `provider`, `id`, `region?`                                | One normalized book record           |
| `metadataBookRaw` | `provider`, `id`, `region?`                                | That provider's record, unnormalized |
| `coverSearch`     | `title`, `author?`, `provider?` or `providers?`            | Array of cover candidates            |
| `download`        | `url`, `provider?`, `filename?`                            | An object carrying a Node `Buffer`   |

Metadata providers are `audnexus` and `hardcover`; cover providers are `apple`
and `hardcover`. Audnexus and Apple need no token set. A search with no
`provider` or `providers` is a wide search: it queries every provider whose key
is configured plus the keyless ones, and tags each result with the provider that
produced it. Calling `configure` again replaces the whole key set, so
`tokens: {}` drops back to keyless providers only. Naming
`provider: "hardcover"` explicitly without a configured key rejects with
`noToken`.

Metadata and covers are independent. Both are searched by title and author, so a
cover lookup does not need a metadata lookup first.

## Metadata Lookup

`metadataSearch` returns candidates, `metadataBook` returns the full record for
one of them:

```js
const results = JSON.parse(
  await storyteller.metadataSearch(
    JSON.stringify({ title: "Project Hail Mary", author: "Andy Weir" }),
  ),
)
// Output:
// [{ provider: "audnexus", id: "B08G9PRS1K", title: "Project Hail Mary",
//    authors: ["Andy Weir"], narrators: ["Ray Porter"], releaseYear: 2021, ... }, ...]

const book = JSON.parse(
  await storyteller.metadataBook(
    JSON.stringify({ provider: results[0].provider, id: results[0].id }),
  ),
)
// Output:
// { provider: "audnexus", title: "Project Hail Mary", authors: ["Andy Weir"],
//   narrators: ["Ray Porter"], description, rating, language, series, tags, ... }
```

`id` is whatever that provider's detail lookup takes: an ASIN for Audnexus, and
for Hardcover its internal database id for the work (not an ISBN or ASIN; those
identify specific editions and appear on the edition objects). `authors` and
`narrators` are arrays of names everywhere they appear. A scalar field a
provider does not supply is left out of the JSON rather than sent as null, so
read a missing key as unknown.

The below tables list what each call can return, by provider. A check means the
field is returned when the provider has it; an empty cell means that provider
never has anything for it. In the JSON itself, list fields (`authors`,
`narrators`, `creators`, `series`, `tags`, `editions`) are always present, just
empty when there is nothing to list, while an unsupplied scalar's key is
omitted.

A `metadataSearch` result will contain these fields:

| Field            | Audnexus | Hardcover |
| ---------------- | :------: | :-------: |
| `provider`       |    ✓     |     ✓     |
| `id`             |   ASIN   |  book id  |
| `title`          |    ✓     |     ✓     |
| `subtitle`       |    ✓     |     ✓     |
| `authors`        |    ✓     |     ✓     |
| `narrators`      |    ✓     |           |
| `seriesName`     |    ✓     |     ✓     |
| `seriesPosition` |    ✓     |     ✓     |
| `releaseDate`    |    ✓     |           |
| `releaseYear`    |    ✓     |     ✓     |
| `imageUrl`       |    ✓     |     ✓     |

A `metadataBook` record will contain these fields:

| Field                       | Audnexus | Hardcover |
| --------------------------- | :------: | :-------: |
| `provider`                  |    ✓     |     ✓     |
| `id`                        |          |  book id  |
| `slug`                      |          |     ✓     |
| `title`                     |    ✓     |     ✓     |
| `subtitle`                  |    ✓     |     ✓     |
| `description`               |    ✓     |     ✓     |
| `releaseDate`               |    ✓     |     ✓     |
| `rating`                    |    ✓     |     ✓     |
| `language`                  |    ✓     |           |
| `authors`                   |    ✓     |     ✓     |
| `narrators`                 |    ✓     |     ✓     |
| `creators`                  |          |     ✓     |
| `series`                    |    ✓     |     ✓     |
| `tags`                      |    ✓     |     ✓     |
| `defaultAudioEdition`       |          |     ✓     |
| `editions`                  |          |     ✓     |
| `imageUrl`                  |    ✓     |     ✓     |
| `imageWidth`, `imageHeight` |          |     ✓     |

Field shapes: `creators` is contributors beyond authors and narrators, as
`{name, role}`; `series` is `{name, position, featured}`; `editions` and
`defaultAudioEdition` hold edition objects, described in their own section
below.

The gaps are inherent to the sources. Hardcover models a book as a work with
many editions, addressed by numeric `id` and URL `slug`; Audible has no such
catalog, so an ASIN is one specific edition, the ASIN you fetched with is the
record's identity, and there is nothing to list under `editions`. Audnexus
models only authors and narrators, so `creators` stays empty.

Field levels differ accordingly. A Hardcover record is work-level except for
`editions` and `defaultAudioEdition`, plus two edition values promoted onto the
record: `narrators` comes from the default audio edition (a work has no
narrator), and `language` is not promoted at all, so look for it on the
editions. An Audnexus record is edition-level throughout: every field, including
`releaseDate` and the cover, describes that one Audible production.

`metadataBookRaw` takes the same options as `metadataBook` and gives back that
provider's own record with none of the normalization, for anything the
normalized record drops (Audnexus responses carry `copyright`, `formatType`,
`isAdult`, and more). For Audnexus that is the response body verbatim; for
Hardcover it is the matched book object from the GraphQL response, re-encoded
with sorted keys.

### Edition Objects

When a source supports editions, each entry in `editions` and
`defaultAudioEdition` is an edition object. `id` and `format` are always
present; the rest follow the same rules as above (scalars omitted when unknown,
lists always present):

| Field                                   | Meaning                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `id`                                    | Hardcover's edition id, its database key for this edition                           |
| `format`                                | Format in the provider's own words, e.g. `Audiobook`, `Hardcover`, `Kindle Edition` |
| `editionInfo`                           | Free-text edition notes, e.g. `Unabridged`, `10th Anniversary Edition`              |
| `title`, `subtitle`                     | This edition's own title, when it differs from the work's                           |
| `isbn13`, `isbn10`, `asin`              | The universal identifiers, when registered                                          |
| `pages`                                 | Page count, print and ebook editions                                                |
| `audioSeconds`                          | Running time, audio editions                                                        |
| `releaseDate`                           | This edition's release date                                                         |
| `language`, `country`, `publisher`      | Publication details                                                                 |
| `narrators`                             | Narrator names                                                                      |
| `otherContributors`                     | Contributors beyond authors and narrators, as `{name, role}`                        |
| `imageUrl`, `imageWidth`, `imageHeight` | This edition's own cover                                                            |

## Covers Lookup

`coverSearch` returns candidates from every configured cover provider in one
array, every one the same shape:

```js
const covers = JSON.parse(
  await storyteller.coverSearch(
    JSON.stringify({ title: "Project Hail Mary", author: "Andy Weir" }),
  ),
)
// Output (one candidate):
// {
//   "id": "apple-ebook-https://is1-ssl.mzstatic.com/.../100x100bb.jpg",
//   "provider": "apple",
//   "mediaKind": "ebook",
//   "url": "https://is1-ssl.mzstatic.com/.../2000x2000bb.jpg",
//   "title": "Project Hail Mary",
//   "subtitle": "Andy Weir",
//   "width": 2000,
//   "height": 2000,
//   "format": "ebook"
// }
```

`mediaKind` is `audiobook` or `ebook`, decided by each provider's adapter from
its own format vocabulary, so a consumer never has to know that Hardcover says
"Audible" and Apple says "audiobook". Widths and heights come from whatever the
provider states, or from the size Apple encodes in the artwork URL. `language`
appears on Hardcover editions that declare one, and is absent here for the same
reason any other unsupplied field is.

`download` then fetches the bytes, rather than handing back a URL for the
consumer to fetch itself. It applies whatever headers the named provider's image
host needs, and it rejects a response whose bytes are not an image even when the
host called it one:

```js
const fs = require("node:fs")

const file = await storyteller.download(
  JSON.stringify({ url: covers[0].url, provider: covers[0].provider }),
)
console.log(file)
// Output:
// {
//   filename: "2000x2000bb.jpg",
//   contentType: "image/jpeg",
//   url: "https://is1-ssl.mzstatic.com/.../2000x2000bb.jpg",
//   width: 1297,
//   height: 2000,
//   bytes: <Buffer ff d8 ff e0 ... 819906 more bytes>,
// }
fs.writeFileSync(file.filename, file.bytes)
```

`width` and `height` are parsed out of the JPEG or PNG header, so they are the
real pixel dimensions rather than the provider's claim. That URL advertises
2000x2000 and delivers 1297x2000.

`filename` is the URL's last path component when the URL already ends in an
image extension, and otherwise the `filename` option's stem with the extension
implied by the bytes. `contentType` is the response's, falling back to the
sniffed format.

Neither provider's image host authenticates today, so passing `provider` changes
nothing yet. It is the parameter that keeps working when one of them starts
requiring a signed request.

## Errors

Failures reject with the underlying Swift error. `err.code` is the Swift error
type and `err.message` is the case:

```js
await storyteller.metadataSearch(
  JSON.stringify({ provider: "hardcover", title: "dune" }),
)
// rejects: err.code === "HardcoverError", err.message === "noToken"
```

A rejected key gives `unauthorized`, a book id that is not a number gives
`invalidBookID("...")`, a typo in a `configure` provider name gives
`ConfigureError` / `unknownProvider("...")`, and a download of something that is
not an image gives `CoverDownloadError` / `unexpectedContentType("text/html")`
(or `notAnImage` when the host claims an image type over bytes that are not
one).

## Runtime requirements

`StorytellerKit` and its dependencies link statically into the addon, so the
`.node` file needs nothing at runtime beyond the Swift runtime libraries. On
Linux that means copying `/usr/lib/swift/linux/` (about 139 MB) out of the build
image alongside the addon and pointing `LD_LIBRARY_PATH` at it, plus two system
packages: `libcurl4` for the FoundationNetworking implementation of `URLSession`
and `libxml2` for FoundationXML, both loaded when the addon is. On Ubuntu 24.04,
`apt install libcurl4 libxml2` resolves to `libcurl4t64` and brings in
`ca-certificates`, which HTTPS needs; a slimmer base image must install
`ca-certificates` itself.
