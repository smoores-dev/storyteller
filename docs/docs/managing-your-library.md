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

## Managing Books

### Data and Metadata

#### What are the different kinds of data?

Storyteller handles many different kinds of data, and they are treated
differently.

1. _Standard book metadata_. This generally comes from the original files and
   includes standard information like title and author. If you manage your books
   with other software, you may also have many other fields; some of which you
   may have customized to you own preferences. It also can include details about
   the files themselves such as size, codec, duration, modification date. To the
   best of our abilities, Storyteller has strived to map its metadata choices as
   closely as possilbe to what other consumer software recognizes for these
   fields.
2. _Storyteller **alignment** metadata_. This is metadata generated by
   Storyteller at the time of alignment. This currently includes last alignment
   date, Storyteller version aligned with, and transcription engine. This
   information is embedded into the readaloud file on creation, but not into the
   original source files. These metadata are not editable.
3. _Storyteller **user**-specific metadata_. This is metadata that is specific
   to a particular book _and_ a particular user. This list would include:
   collections, status, and position-sync, as well as highlights, notes, and
   bookmarks. This information is not embedded in the file. It exists inside of
   the storyteller application.

#### What metadata is imported

Storyteller’s library management system imports book metadata from all source
files as well as writes changes into all three file formats when any field is
updated in the app.

If all three formats are imported at the same time, preference is give to the
metadata in the following order: (1) readaloud first, (2) epub, (3) audio
file(s). If any file has information that other files do not have, it will be
added to the correct field.

Currently, the metadata that is iported and accessible for editing includes:

- Title (and seperate sub-title if it exists)
- Author(s)
- Narrator(s)
- Other creators (and their MARC relator roles)
- Publication Date
- Language
- Tags
- Series and series index number (including multiples)
- Comments/description

#### How to edit metadata

When you click on a book cover thumbnail from any view, you will be taken to the
book details page where you will see all metadata extracted from the books. On
this page, you have easy acces to downloading any version of the book as well as
updating the status (to be read, currently reading, read) for the book.

To access the remainder of the editable metadata, you click on the pencil.

::: info Writing edits to files

Any edits made on this page will be propogated to all existing version of the
book. If you have pointed your auto-import function to an external folder where
you are managing metadata with another application, Storyteller is blind to
these changes. All data will be overwritten by Storyteller’s dataset whenever an
update is triggered.

:::

### Categorizing books

In Storyteller, the two main systems for classifying books in addition to
traditional metadata like tags and series are **reading status** and
**collections**.

#### Reading status

Status is unique to each user. A book can be marked “Read”, “Reading” or “To
read”. Status is synced accross all devices that have access to the server. (The
ability to change these names or add additional mutually exclusive categories
such as “Did not finish” are planned.)

When books are intially imported, the default status is “To read”. If you are a
guest on someone else’s storyteller instance, all books will be marked as unread
when you first log in.

You can change the status of any book on that book’s details page, or as a bulk
action.

Books are automatically added to the “currently reading” list if you open on any
device. You may also add it to the list from the details page.

Books are automatically moved to the “Read” status when 98% of the book has been
completed, if they previously had the “Reading” status.

#### Collections

Collections are a special cateogization in Storyteller that can be customized to
the user/owner’s preferences. Collections are also the basis for sharing your
library with others.

You may create collections based on whatever criteria you want — they can map to
genres, audience (“children” and “adults”), user groups (“friends” and
“family”), or anything else. Your collections will show up in your navigation
bar as you create them.

You can have an arbitrary number of collections and any one book may be added to
an arbitrary number of collections. A real-world analogy is your bookshelves at
home (with the added bonus of having multiple copies of any one book to add to
any shelf or group you want).

By default, collections are public. A public collection can be viewed by any
user that you’ve invited to your Storyteller server. Collections can also be
made private. Private collections are only visible to their creators and any
users that have been explicitly invited to the collection by its creator.

::: info Permissions

Book permissions are determined by collections. A user can see any book that
belongs to a collection that they can see, as well as any book that does not
belong to any collections. If a book only belongs to collections that a user
cannot see, that user will not be able to see the book.

This means that just putting a book in a collection marked “Private”, is not
enough to keep that book private if it also appears in any shared collection.

:::

#### Series

Series are a standard part of metadata found in many books. Storyteller gives
you the ability to assign a book to more than one series (perhaps chronological
order and publication order, or overarching series, or cross-overs) and to
assign which series you consider the primary series.

### Finding Books (search, sort and filter)

The quickest way to find a particular book is via the **search** bar on the
“Books” (or any collection) page.

You can also easily **sort** books on the following fields: Title, Author, Last
aligned, Created, and Publication Date.

Additionally, you can **filter** books by Collections, Tags, Authors, Series,
Format, and Status. To find the filters, click on the “Advanced” button under
the search bar.

Currently, selections from within any filter are performed as an “or” function
(any book meeting any of the criteria will be included) and multiple filters are
performed as an “and” function (book must meet all criteria).

Example: If you search for “science fiction” (tag) and “fantasy” (tag), you will
get all books that have either tag, but if you search for “science fiction”
(tag) and “fantasy” (collection), you will only get books in your fantasy
collection that also include the “science fiction” tag.

For large collections, an alphabet jumper is available to quickly move through
the list of books.

::: info Pro-tip

If you have a favorite view, consider saving it as a bookmark, so you can get
right to it. Ex:. https://your.sever.here.net/books?sort=align-time%2Cdesc for
your most recently aligned books, or
https://your.sever.here.net/books?bookTypes=ebook-audiobook-only for your books
that have both the audiobook and ebook, but have not yet been aligned.

:::
