---
sidebar_position: 99
---

# OPDS Feed

Storyteller supports the OPDS protocol, which allows you to download and browse
books from your library on devices that may not support the Storyteller apps.

## Feed specifics

The feed is available at `https://<storyteller-server>/opds`.

Storyteller only supports OPDS v1.2 for now. Please let us know if you want
support for v2.0.

Storyteller serves both audiobooks and epubs/readalouds through the OPDS feed.
If a readaloud is available, it will be preferred over the EPUB.

Most client will not be able to play audiobooks, the only currently tested
client that can is Thorium Reader.

## Authentication methods

Most OPDS clients support basic authentication. This is the default
authentication method for Storyteller.

Storyteller also aims to comply with the
[OPDS Authentication 1.0](https://opds-spec.org/specs/authentication/1.0/index.html)
specification. Compatible clients will allow you to login with OAuth for
instance.

As of 2026-01-03, Thorium Reader is the only client tested that supports the
above spec.

## Tested clients

### Works

- [Thorium Reader](https://www.edrlab.org/software/thorium-reader/) Only one who
  supports reading Readalouds and audiobooks.
- [Cantook](https://cantook.app/)
- [Boox PushRead](https://help.boox.com/hc/en-us/articles/10992026883732-PushRead)
  (Images may not work)
- [KOReader](https://koreader.rocks/)
- [Yomu](https://yomu.app/)
- [KyBook](http://kybook-reader.com/)
- [FBReader](https://fbreader.org/)

### Does not work

- [MoonReader+](https://moonreader.app/) (Only tested on an older version)

## Settings

For now there are only three settings available for OPDS:

- **Enable OPDS feed**: Whether to enable the OPDS feed.
- **Enable pagination**: Whether to enable pagination for the OPDS feed. Some
  clients (like Boox PushRead) do not support pagination. You can disable this
  to return all items in a single response.
- **Page size**: The number of items per page in the OPDS feed.
