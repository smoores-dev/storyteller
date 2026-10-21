---
title: Progress API v3
---

This design is based on (and compatible with)
[OPDS progression v1.0 draft](https://github.com/opds-community/drafts/blob/main/opds-progression-1.0.md).

This API is intended to support:

1. Standalone EPUBs
2. Standalone Audiobooks
3. Readaloud EPUBs

## Progression Document

| Key           | Definition                                                                                                | Format                                                                                                    | Required                                 |
| ------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `title`       | Contains text that can be relevant to identify or contextualize the progression, such as a chapter title. | String                                                                                                    | No                                       |
| `modified`    | Timestamp for the last-known progression.                                                                 | ISO 8601 time and date                                                                                    | Yes                                      |
| `device`      | Identifies the device that provided the last-known progression.                                           | [Device Object](https://github.com/opds-community/drafts/blob/main/opds-progression-1.0.md#device-object) | Yes                                      |
| `progression` | Total progression in the publication expressed as a percentage (%).                                       | Float between 0 and 1                                                                                     | Yes                                      |
| `references`  | References inside the publication.                                                                        | Array of URI references                                                                                   | **Yes** (deviates from OPDS progression) |

### `title`

If the publication has chapter metadata, `title` should be set to the current
chapter.

### `modified`

This **MUST** be the timestamp that the user navigation to this progression,
_not_ the timestamp that the client attempted to sync this progression.

### `progression`

For audiobooks, this should be computed as a fraction of time. For standalone
and readaloud EPUBs, this should be computed as a fraction of
[character counts](#Character%20counting).

Progression may be approximate. It is only used for representing to the user how
far they are in the book. [References](#references) are used to identify precise
locations.

### `references`

For standalone audiobooks, the only required reference is an audio file URI with
a time fragment, e.g. `audiobook.m4b#t=983.31`.

For standalone EPUBs, an XHTML URI with a
[character fragment](#Character%20counting), e.g.
`OEPS/chapter1.xhtml#char=152`, will always be provided by the server. Clients
that support character fragments should rely on them primarily, as they are
maximally precise and robust to markup changes. The server will also provide the
following URI fragment types for each XHTML progress document:

- Anchor (if available, will point to the nearest ancestor of the current
  character with an ID)
- XPointer
- CFI

Any of the above fragment types may be provided to the server on update. The
server will compute the values for any fragment types that are not provided.

If a bare XHTML reference is provided, with no fragment, `#char=0` will be
assumed, and the other fragment types will be computed from that basis.

For readaloud EPUBs, **either** an audio file URI with a time fragment or an
XHTML URI are required. If an XHTML URI is provided, the same rules apply to the
XHTML URI as for standalone EPUBs.

## Protocol

The progress sync protocol basically the same as in v2, but we additionally
distinguish between "there's a newer document" and "the document you sent is
already the latest".

Clients submit timestamped progress documents when their local progress changes.

- If there's already a newer progress document, the server replies with a 409.
- If the latest progress document matches the incoming one, the server replies
  with a 200.
- Otherwise, the server saves the document and replies with a 201.

This enables a slightly different (smarter) flow for clients:

- Track whether a local progression document is confirmed by the server or
  unconfirmed
- If unconfirmed, periodically attempt to save to server
  - If the network request fails or you get an unexpected (500) error, retry
    again later
  - If you get a 409, pull the latest from the server and mark it as confirmed
  - If you get a 200, mark your local document as confirmed
  - If you get a 201, mark your local document as confirmed (and, optionally,
    save the new references that the server resolved for you)
- If confirmed, periodically attempt to get the latest progression from the
  server

If a client submits a progress document for a standalone ebook or readaloud with
an XHTML URI, the server will synchronously look up/compute the other fragment
types for that URI before saving. All requests for the latest progress for a
standalone ebook or readaloud will include character, xpointer, and cfi
fragments, as well as anchor fragments if available.

If a client submits a progress document for a book that we have a readaloud
alignment for, the server will use the readaloud alignment to synchronously look
up/compute the other reference types _for every format_. This ensures that all
requests for the latest progress document always include up-to-date references,
even if the last update was for a different format.

## Resource identifiers

The progress document resource will live at
`/api/v3/books/<bookid>/progress?format=<format>`. `<format>` must be one of
`ebook`, `audiobook`, or `readaloud`.

## Character counting

The `#char=` URI fragment is only defined for `text/plain`, but we are planning
to use it for XHTML documents. To do this, we need to define a consistent
definition of character count that can be repeated across runtimes and
environments, as well as converted to and from DOM Ranges.

The fragment `#char=n` identifies a position between two characters, before the
first character, or after the last character of the `body` element of the XHTML
document.

Character position is counted by traversing the XHTML document, starting at the
`body` element, in a depth-first traversal:

- Each UTF-16 code unit encountered in a text node increments the position by
  one.
- Each non-text leaf node increments the position by one.

### Examples

The following examples use the following XHTML document. In each example, `|`
indicates the position that the character fragment points to.

```xhtml
<?xml version="1.0" encoding="UTF-8"?>
<html
  xmlns="http://www.w3.org/1999/xhtml"
  xml:lang="en-US"
  xmlns:epub="http://www.idpf.org/2007/ops"
>
  <head>
    <title>XHTML</title>
  </head>
  <body>
    <p>I am an XHTML document.</p>
    <img src="#" />
    <p>I have an image.</p>
  </body>
</html>
```

`#char=0`

```xhtml
<?xml version="1.0" encoding="UTF-8"?>
<html
  xmlns="http://www.w3.org/1999/xhtml"
  xml:lang="en-US"
  xmlns:epub="http://www.idpf.org/2007/ops"
>
  <head>
    <title>XHTML</title>
  </head>
  <body>
    |
    <p>I am an XHTML document.</p>
    <img src="#" />
    <p>I have an image.</p>
  </body>
</html>
```

`#char=58`

```xhtml
<?xml version="1.0" encoding="UTF-8"?>
<html
  xmlns="http://www.w3.org/1999/xhtml"
  xml:lang="en-US"
  xmlns:epub="http://www.idpf.org/2007/ops"
>
  <head>
    <title>XHTML</title>
  </head>
  <body>
    <p>I am an XHTML document.</p>
    <img src="#" />
    <p>I have an image.</p>
    |
  </body>
</html>
```

`#char=33`

```xhtml
<?xml version="1.0" encoding="UTF-8"?>
<html
  xmlns="http://www.w3.org/1999/xhtml"
  xml:lang="en-US"
  xmlns:epub="http://www.idpf.org/2007/ops"
>
  <head>
    <title>XHTML</title>
  </head>
  <body>
    <p>I am an XHTML document.</p>
    |<img src="#" />
    <p>I have an image.</p>
  </body>
</html>
```

`#char=34`

```xhtml
<?xml version="1.0" encoding="UTF-8"?>
<html
  xmlns="http://www.w3.org/1999/xhtml"
  xml:lang="en-US"
  xmlns:epub="http://www.idpf.org/2007/ops"
>
  <head>
    <title>XHTML</title>
  </head>
  <body>
    <p>I am an XHTML document.</p>
    <img src="#" />|
    <p>I have an image.</p>
  </body>
</html>
```

### Ranges

Character fragments can also indicate ranges. Simply provide two positions,
separated by a comma. This is not useful for simple progress sync, but can be
useful for e.g. indicating a range to be decorated by a user highlight.
