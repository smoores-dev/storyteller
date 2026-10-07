# @storyteller-platform/crengine-xpointer

!! This library is almost entirely LLM-generated, ported from crengine. !!

!! The README here has mostly been edited and re-written by a human, but still
has a few sections that are junk-y LLM prose. !!

Resolve and build [koreader](https://github.com/koreader/koreader)'s
[crengine](https://github.com/koreader/crengine) "xpointers" against an
[`@xmldom/xmldom`](https://github.com/xmldom/xmldom) tree.

## Usage

```ts
import { parse } from "@storyteller-platform/epub"
import {
  buildXPointer,
  resolveXPointer,
} from "@storyteller-platform/crengine-xpointer"

const document = parse(xhtml, "application/xhtml+xml")

const position = resolveXPointer(
  document,
  "/html[1]/body[1]/div[2]/p[1]/text()[1].64",
)
// → { node: Text, offset: 64 }

const xpointer = buildXPointer(document, position)
// → "/html[1]/body[1]/div[2]/p[1]/text()[1].64"
```

## The format

```
path    := step*
step    := '/' ( name index? | 'text()' index? | digits+ ) | '.' digits+
index   := '[' digits+ ']'
name    := [^/.\[]+
```

| Step         | Means                                                       |
| ------------ | ----------------------------------------------------------- |
| `/p`         | the first `<p>` child                                       |
| `/p[2]`      | the second `<p>` child                                      |
| `/text()[3]` | the third text child                                        |
| `/2`         | the second child of any kind                                |
| `.64`        | the caret: offset 64 in a text node, child 64 in an element |

An xpointer addresses a node plus an offset:

```ts
type XPointerPosition = { node: Node; offset: number }
```

`offset >= 0` is a caret (`Text#isPointer` in crengine) — a character offset
into a text node, or a child index into an element. `offset === -1` is a path
with no caret (`isPath`). Building with a negative offset produces no `.N`;
resolving a string with no `.N` produces `-1`.

**Indexes count from 1.** An index of `0` parses, but returns `null`.

### Path roots

Crengine represents an EPUB as a single tree. It has one root, which has a body,
and each child of the root body represents the top-level element of one of the
EPUB's spine items. The spine item root is represented as a DocFragment. So a
path into a specific text node in a given spine item looks like:

```
/body[1]/DocFragment[3]/body[1]/div[1]/p[4]/text()[1].64
```

### Indexes (:nth-of-type)

Each path segment specifies an optional element type (or text) and its index. If
the element type is provided, the index is measured like CSS's `:nth-of-type`
pseudo-class, so `/p[2]` is "the second `<p>` element". If the element is
elided, the index is measured like `:nth-child`, so `/p[1]/2` is "the second
child node of the first `<p>` element".

### `[1]` and its history

Crengine always wrote the index for a second-or-later sibling, and used to leave
`[1]` out of a first-of-kind sibling — but only when no sibling of that kind
followed, so that the string was never ambiguous. Since DOM version 20260812 it
writes `[1]` unconditionally, because a resolver then never has to scan forward.
This package writes `[1]` by default, matching crengine today:

```ts
buildXPointer(document, position) // "/body[1]/div[1]/p[1]"
buildXPointer(document, position, { explicitFirstIndex: false }) // "/body/div/p"
```

Both forms resolve identically, so you only need the option if the strings
themselves are compared against ones saved by older crengine.

## Names

Crengine stores element names interned and matches them exactly, ignoring
namespaces (so `dc:title` is `title` to it). This package matches the same way:
the node's local name, case-sensitively, no namespace.

That makes the DOM you hand in responsible for the names. crengine's parser
lowercases every tag name it reads (`lvxml.cpp:3081`), so its DOM has
`lineargradient` where the source file says `linearGradient` — the oracle dump
confirms it for an SVG fixture. crengine is reading the file it parsed; you are
reading whatever DOM you were given, so address nodes by how the DOM you were
handed spells them.

## A crengine XML tree

crengine's DOM holds **elements and text nodes, and nothing else**: its parser
callback (`LVXMLParserCallback`) has no comment, processing-instruction or
doctype callback at all. Additionally:

- Comments, processing instructions and doctypes are **invisible** — they do not
  take part in any index, so a DOM that keeps them still indexes like crengine's
  equivalent tree.
- A CDATA section **is** text. crengine's parser reports `<![CDATA[…]]>` through
  the same `OnText` callback as ordinary text (`lvxml.h:75`); the `TXTFLG_CDATA`
  flag that distinguishes it is used only inside the parser and never reaches
  the DOM. So CDATA occupies a slot in the `text()` sequence, while
  `@xmldom/xmldom` gives it a node of its own type — which is why this package
  counts CDATA with text instead of skipping it.
- Whitespace-only text nodes **may or may not be there**: crengine deletes them
  while rendering, so a rendered crengine tree has no whitespace-only text at
  the edge of an inline run — at a parent's edges, or on either side of a block
  child — unless the parent is `white-space: pre`, because
  `ldomNode::autoboxChildren()` removes exactly those (`lvtinydom.cpp:6926`)
  while wrapping the run in a boxing node. A tree that was only parsed keeps
  them, and indexes accordingly. [`crengineView`](#pointers-from-a-device)
  predicts the deletions from the CSS.

A position at a node crengine could not address (a comment, say) is a
`XPointerError`.

## Pointers from a device

Crengine depends on CSS and viewport size when parsing and rendering an XHTML
document, which means that a given xpointer generated from a KOReader client is
implicitly dependent on stylesheets and viewport width.

In order to (somewhat) faithfully resolve and build xpointers that match those
produced on the KOReader client, you can use a `crengineView`:

```ts
import {
  buildChapterXPointer,
  crengineView,
  resolveChapterXPointer,
} from "@storyteller-platform/crengine-xpointer"

const view = crengineView({
  styleSheets: [{ css: bookCss, kind: "author" }],
  screenWidth: 600,
})

// A pointer written for the third spine item, resolved in that item's chapter.
const position = resolveChapterXPointer(chapter, pointer, {
  spineIndex: 2,
  view,
})
// → { node: Text, offset: 41 } — an index into this chapter's own text

buildChapterXPointer(chapter, position, { spineIndex: 2, view })
// → the pointer a device resolves back to that position
```

Note that despite crengine xpointer indices being 1-based, `spineIndex` should
be 0-indexed.

You can alternatively construct your own EPUB-spanning crengine-style tree
manually and use it with `resolveXPointer` and `buildXPointer`, which also take
a `view` parameter.

## Ids

crengine also accepts `#something`, which is not a path at all: it looks up the
`id` attribute of any element, or the `name` attribute of an `<a>`, anywhere in
the owning document, and returns that element with no caret.

```ts
resolveXPointer(document, "#chapter-2") // → { node: Element, offset: -1 }
```

It is a map crengine fills in while parsing, which has three visible
consequences: a repeated id resolves to the **last** one in document order,
`name` resolves only on `<a>` (`<p name="x">` is not addressable as `#x`), and
in EPUBs crengine rewrites every chapter id to `_doc_fragment_N_ ` + the
original, **with a trailing space** (`lvstsheet.cpp:6689`), so the source id
does not resolve in a loaded book — only the rewritten one does. Since
`toStringV2()` never emits `#` anyway, treat `#` as input from elsewhere.

## Why some strings do not resolve

`resolveXPointer` returns `null` — as crengine returns a null pointer — for a
malformed path, a step that matches nothing, or a caret past the end of the
node. It also refuses a few strings that look like they should work, because
crengine's parser does:

| String     | Result      | Why                                                                               |
| ---------- | ----------- | --------------------------------------------------------------------------------- |
| `p[1]`     | `null`      | every step needs its `/` or `.`                                                   |
| `/p[1].2/` | `null`      | the caret has to be the last thing in the string                                  |
| `/0`       | `null`      | a `/N` step must be at least 1                                                    |
| `/p[0]`    | `null`      | an index of 0 matches nothing                                                     |
| `/p[2x]`   | `null`      | crengine reads the index with its own `atoi`, which yields 0 for trailing garbage |
| `/p[-1]`   | first `<p>` | `atoi` accepts a sign, and crengine reads `-1` as "no index"                      |
| `/p[0x10]` | 16th `<p>`  | `atoi` accepts `0x` hex                                                           |
| `/p[2/`    | `p[2]`      | the closing `]` is never actually required                                        |

Those are crengine's behaviours, reproduced deliberately; the tests that pin
them cite `tools/crengine-oracle`.

## Not implemented

- **The legacy, non-normalized dialect.** crengine selected between it and the
  current one by the book's DOM version (the boundary is 20200223). Only the
  normalized dialect — every xpointer crengine writes today — is supported.
- **Boxing nodes.** crengine's renderer wraps parts of the tree in
  `<autoBoxing>`, `<floatBox>`, `<inlineBox>` and friends, and the normalized
  dialect skips them when counting and when building, which is exactly what
  makes such an xpointer survive a change in `display`. A tree that was only
  parsed — anything `@xmldom/xmldom` hands you — has none, so there is nothing
  to implement here; a _rendered_ crengine tree handed to this library would
  have to be flattened by the caller first.
- **Ranges.** A KOReader highlight is `xpointer(start, end)`, and the extras
  around it (`range(…)`, `Selection`, `ignore-bidi-paragraph`) are KOReader's
  Lua, not crengine. A range is two positions; build it out of two calls.
- **Rendering.** `createXPointer(lvPoint, direction)` — crengine's "which
  xpointer is at this pixel" — needs a laid-out page.

## Where a device and this library cannot agree

A view reproduces crengine's tree from the source and the sheets. These are the
cases where it cannot, all of them measured against `tools/crengine-oracle`:

- **Markup the parsers disagree about.** crengine parses HTML and repairs it:
  unclosed elements, `<p>` closed by a block, content misplaced in a `<table>`
  foster-parented out. An XML parser either rejects the file or keeps the nodes
  where they were written. No cascade fixes that; `unclosed.xhtml` and
  `tables.xhtml` are skipped in the parity run for exactly this reason.
- **A `<style>` inside a chapter.** crengine ignores one that sits in the body
  of an EPUB chapter — `internal.xhtml` measures `em { display: block }` with no
  effect on the chapter it is in — so pass only the linked sheets. Handing an
  internal sheet to a view models an effect the device does not have.
- **`@media` and selectors, reduced.** Media conditions are evaluated for `all`
  and `screen` against the page width (`device-width` against the screen width),
  for `width`, `min-width` and `max-width`; the `print` sheet is never matched.
  Selectors are the subset crengine implements, and a selector crengine cannot
  parse matches nothing there, so it matches nothing here too.
- **Generated content.** `::before` and `::after` with `content:` put text in
  crengine's tree that is in no source file. It is not modelled, so a pointer
  into generated text cannot be reproduced at all.
- **`white-space` values.** Reduced to pre or not, because that is the threshold
  crengine's tree care about (`css_ws_pre_line`): `pre`, `pre-wrap`, `pre-line`
  and `break-spaces` are the same shape here.
- **Reader style tweaks.** KOReader applies them in the user-agent layer, where
  their `!important` outranks an author `!important`. Pass them as
  `kind: "user-agent"` and they behave that way here too; pass them as author
  CSS and a book can out-rank them, which it cannot do on the device.

## Tests

`src/__test__/parity.test.ts` is the test that matters for a device: it parses
each fixture's chapter bytes with `@xmldom/xmldom` — the same bytes crengine
parsed — builds a view from the fixture's own stylesheet and page width, and
then resolves every xpointer crengine produced, asserting that it lands on the
node crengine means and that the caret survives the trip into this tree's text.
Then it builds each one back and requires the original string. Two fixtures are
skipped for the parser reasons above.

`src/__test__/oracle.test.ts` compares this package's answers against crengine's
own. The data is generated by `tools/crengine-oracle`, which links an unmodified
crengine, loads each fixture as a two-chapter EPUB through `LVDocView` with
styles on — the path a device takes — and reports the xpointer string of every
node at several offsets and what crengine makes of every one of those strings
plus an adversarial set. The trees are rebuilt here from the dump rather than
re-parsed, with boxing nodes made transparent, so a difference between two HTML
parsers can never be mistaken for a difference between two xpointer algorithms.
See that directory's README for how to regenerate it, and its `FINDINGS.md` for
what the data says crengine does.

The hand-written suites cover what a dump cannot: comments, doctypes and CDATA
sections (which crengine cannot produce), the two ways `resolveXPointer` can be
rooted, `#id` resolution, the pre-20260812 output form, and the grammar.

## Development

```sh
yarn workspace @storyteller-platform/crengine-xpointer test
```
