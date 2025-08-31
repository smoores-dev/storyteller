---
sidebar_position: 3.5
---

# Managing your library

![A sample Storyteller library](/img/library_sample.png)

Storyteller has a number of features for managing a large library of books. It
supports standalone ebooks and audiobooks, as well as readaloud books (usually
produced by Storyteller itself). You can organize your books into collections,
decide which users have access to them, and generally manage metadata to your
heart’s desire.

## Adding books

There are three ways to add books to a Storyteller library:

### Uploading books

You can upload books one at a time through the web client. When uploading a
book, you can upload either a single readaloud EPUB file, plain EPUB file, or
audiobook file(s), or both a plain EPUB and audiobook file(s). If you upload
both a plain EPUB file and audiobook file(s), they will be matched, and
Storyteller will treat them as a single book asset with one set of metadata. You
will also be able to align them to create a readaloud book!

You can upload books from the home page, the Books page, or any collection page.
If you upload from a collection page, the book will automatically be added to
that collection.

Books that are uploaded through the web client will live in Storyteller’s
`/data` directory. You should always mount a Docker volume to `/data` when
[configuring your Storyteller container](/docs/intro/getting-started#docker-compose),
so that these files are accessible outside the container (and so that they
aren’t deleted when your container is updated!).

### Importing books from the server

If you already have book files on your server and you’d just like to import them
into Storyteller, you can manually import books one at a time. This is very
similar to uploading books, but you can choose from files that are already
available on your server, rather than uploading through the web client.

### Auto-import

You can also configure Storyteller to automatically import books from a folder
on your server. You can make this folder available to your Storyteller container
by mounting it as a volume on your container. For example, if we have our books
library in `~/Media/Books`, the following Docker compose configuration will make
our books available at `/library` inside the container:

```yaml
services:
  web:
    image: registry.gitlab.com/storyteller-platform/storyteller:latest
    volumes:
      - ~/Documents/Storyteller:/data:rw
      # Our new volume mount
      - ~/Media/Books:/library:rw
    environment:
      - STORYTELLER_SECRET_KEY_FILE=/run/secrets/secret_key
    ports:
      - "8001:8001"
    secrets:
      - secret_key

secrets:
  secret_key:
    file: ./STORYTELLER_SECRET_KEY.txt
```

#### Organizing your auto-import folder

Storyteller tries to be relatively un-opinionated about how auto-import folders
are organized, but there is one very important rule:

**Every book needs to be in its own folder.**

Here is an example library folder, demonstrating the various ways to organize
files that Storyteller is able to understand:

```
/
  library/
    Mary Shelley/
      Frankenstein/
        Frankenstein.epub
      Mathilda/
        Mathilda.m4b
    Willy Wonka/
      Willy Wonka.epub
      Willy Wonka.mp3
    Moby Dick/
      Moby Dick (readaloud).epub
    Children's novels/
      The Adventures of Pinocchio/
        Pinocchio.epub
        audio/
          Track 001.mp3
          Track 002.mp3
          Track 003.mp3
          Track 004.mp3
          Track 005.mp3
```

Some important notes about the allowed structure:

- As mentioned above, each book must be in its own folder. This is true even
  when there is only one file for that book.
- Book files in the same folder will be matched and considered a single book.
  This is equivalent to uploading ebook and audiobook files together, as
  described above
- Audiobooks can have any number of files, and they can be either directly
  alongside the EPUB files or nested within another folder
- All formats (ebook, audiobook, and readaloud) are optional
- Book folders can be nested arbitrarily. They can be organized by genre or
  author, for example, or simply listed flat at the root of the directory.

#### Configuring auto-import

You can configure Storyteller to automatically import from a folder in two
places:

1. In the Settings page. Books imported from the folder configured here will not
   be assigned to a collection, and will show up in “Uncollected”
2. In the settings for a Collection page, which can be accessed by clicking on
   the gear next to the Collection’s name. Books imported from the folder
   configured here will be automatically assigned to the collection.

You can configure both a top-level auto-import folder and any number of
per-collection folders. Just make sure that they don’t overlap, or you’ll end up
with duplicate books!

### Configuring readaloud output locations

When you manually or automatically import files into Storyteller from your
server, rather than uploading them, Storyteller leaves your files in place. When
Storyteller generates a readaloud file for books imported in this way, by
default it will place the readaloud EPUB file next to the input EPUB file, with
the suffix “ (readaloud)”.

If we generated a readaloud for “Willy Wonka”, in the above example, Storyteller
would create a new file at `/library/Willy Wonka/Willy Wonka (readaloud).epub`.

This behavior can be configured in the Storyteller settings. The options are:

- In the same folder as the input EPUB file, with a user-provided suffix
  (defaults to “ (readaloud)”).
- In a user-provided folder name next to the EPUB file (defaults to
  “readaloud/”).
- In a user-provided folder somewhere outside the auto-import folder.
- In the Storyteller internal folder, alongside the transcoded audio and
  transcription files.

## Collections

Your Storyteller library is organized into Collections (if you want it to be!).
You can think about Collections however you like — they can map to genres,
audience (“children” and “adults”), user groups (“friends” and “family”), or
anything else. Your Collections will show up in your navigation bar as you
create them.

### Permissions

By default, Collections are public. A public Collection can be viewed by any
user that you’ve invited to your Storyteller server. Collections can also be
made private. Private Collections are only visible to their creators and any
users that have been explicitly invited to the Collection by its creator.

Book permissions are determined by Collections, too. A user can see any book
that belongs to a Collection that they can see, as well as any book that does
not belong to any Collections. If a book only belongs to Collections that a user
cannot see, that user will not be able to see the book.
