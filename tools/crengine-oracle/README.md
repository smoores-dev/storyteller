# crengine-oracle

!! This is **entirely** LLM generated !!

A C++ harness that uses crengine itself as the oracle for
`libraries/crengine-xpointer`: it asks crengine what its xpointers are, and
prints the answers as JSON. The library's tests encode crengine's answers rather
than a reading of the C++.

It writes `libraries/crengine-xpointer/src/__test__/oracle/crengine.json`, which
`oracle.test.ts` reads. The JSON is committed, so this tooling is only needed
when the data has to be regenerated.

## Regenerating

```sh
./generate.sh
```

`ORACLE_FONT` must name a TTF — crengine applies no styles at all until it has
been given a font to render with — and the devenv exports one. `generate.sh`
clones the revision named in `crengine.version` into `/tmp/crengine-src` and
builds `libcrengine.so` into `/tmp/crengine-build` unless they already exist
(`CRENGINE_SRC` / `CRENGINE_BUILD` override), compiles `src/oracle.cpp` against
it, packages every fixture as an EPUB and runs the binary over it. Building
crengine needs `cmake`, a C++ compiler, `zlib` and `freetype`, all in the
devenv.

## What it does

For each fixture in `fixtures/`:

- `package-epub.sh` turns the fixture into a two-chapter EPUB (a real `mimetype`
  entry, `container.xml`, an OPF, a 1x1 PNG so `<img>` loads an image, and the
  optional `<name>.css` sidecar as the book's stylesheet). Two spine items
  matter: each becomes its own `DocFragment` child of `body`, and
  `DocFragment[2]` is an index a one-chapter book cannot produce.
- the oracle loads that archive through **`LVDocView`**, the interface KOReader
  drives, so the document is built by the code a device runs — element tables,
  render props and styles, the archive as container, the chapters' own
  stylesheets — and the user-agent sheet is handed in through
  `LVDocView::setStyleSheet()` exactly as `cre.cpp` does.
- it then walks the resulting tree and reports:
  - the tree: node kind, tag name or full text, attributes **as crengine stored
    them** (it rewrites ids per chapter, for one), whether the node is boxing,
    and the computed `display` / `white-space` that decided the tree's shape,
  - for every addressible node, at caret `-1`, `0` and the end:
    `ldomXPointer::toStringV2()`, the string a device writes,
  - for all of those plus an adversarial set, what
    `ldomDocument::createXPointer()` makes of them.
- the chapter source is emitted as `source`, so a test can parse exactly the
  bytes crengine parsed with another parser.

Provenance is in the data: `domVersion`, `stylesEnabled`, `docFlags`,
`screenWidth`, `uaCssBytes`, `uaCssSha256`. If a run silently loses its
stylesheet, `stylesEnabled` says so.

The user-agent sheet is assembled the way `LVLoadStylesheetFile()` would for the
`epub.css` KOReader passes: `html5.css`, then `epub.css` without its `@import`
line. Style tweaks are not appended — none of the ones that change tree shape is
on by default, see `FINDINGS.md`.

## Reading this data is the point; a reading of the C++ is not

`FINDINGS.md` records what the data has taught us, including two things that
looked obvious and were wrong (a per-tag block list is not a substitute for the
cascade, and "first child of a block" is not the whitespace rule). It also lists
what the library still has to model. Read it before changing either the harness
or the library's whitespace handling.

## Caveats

- **One document per process.** `generate.sh` runs the binary once per fixture
  and merges the JSON.
- **No boxing node is asked for a pointer at `-1`.**
  `ldomXPointer(boxingNode, -1).toStringV2()` segfaults; normalized pointers
  never name boxing nodes, so they are dumped but skipped as pointer targets.
- **The legacy `[1]`-eliding dialect is not covered.** The DOM version comes
  from a render prop `LVDocView` reads before `getDocument()` is reachable, and
  `m_props` is private. Newly written pointers are all current, which is what
  the library is for; the option stays unit-tested only.
- **Fixtures are inputs, not formatted output.** Each `.xhtml` file is the body
  content of chapter 1 — no `<html>`/`<body>` wrapper, that is added by the
  packager. They are excluded from oxfmt in `.oxfmtrc.json` because whitespace
  is load-bearing: it is what makes a text node exist, and text nodes are what
  the indexes count.
- **The harness asserts while it runs.** If crengine ever builds a pointer its
  own parser cannot read back, `require_identical` aborts. That is a finding
  about crengine, not a broken fixture — record it in `FINDINGS.md` rather than
  deleting the fixture.
