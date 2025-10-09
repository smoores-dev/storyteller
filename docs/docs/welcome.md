---
sidebar_position: 0
---

# Welcome to Storyteller

<div style={{maxWidth: 250, margin: 'auto'}}>
![storyteller logo of a campfire](sts.png)
</div>

**Storyteller** is a self-hosted platform for creating, reading, and managing
ebooks with _guided narration_ across all your devices.

Guided narration — also called “immersive reading” — is similar to Amazon’s
WhisperSync where the text of your eBook is aligned _and highlighted_ with the
spoken sentences in your matching audiobook. The two progress together, so you
are always in the same place! In Storyteller, we call these aligned books
**readalouds**.

Storyteller is made up of two components: the server and the mobile apps.
Together, these components allow you to take DRM-free audiobooks and ebooks that
you already own and automatically align them, so that you can read or listen to
(or both!) the resulting aligned books anywhere, any time on virtually any
device.

<details>
    <summary>What does alignment mean?</summary>

The process that Storyteller uses to line up the text of your ebook with the
audio of your audiobook belongs to a category of algorithms called “forced
alignment.” We call a book that Storyteller has processed “aligned,” and the
process itself “alignment.”

</details>

---

## Who is Storyteller for?

Storyteller is for anyone who wants personal control of their owned media and to
be able to enjoy their books any way they want whenever they want, and wherever
they want.

### Read, listen to, or read-listen to all of your books

- Switch between listening to a book in audiobook format, reading it as a
  digital, visual book without losing your place, or read and listen at the same
  time on virtually any device.
- Integrated online web reader, Android and iOS apps, and easy export and
  download of files.

### Library management

- Organize and access all your ebooks (EPUBs) and audiobooks (most standard
  audio files) in one place.
- Edit metadata and customize cover art. (Automatic metadata fetching from
  Hardcover coming soon.)
- Easy book ingestion via manual addition or auto-import to library or
  collections.

### Multiuser support

Sharing your library with friends and family is as easy as sending them an email
or messaging them a personalized link.

### Individual control <span style={{fontSize: '1rem', fontWeight: 'normal'}}>(coming soon)</span>

- Create notes and highlights which sync across devices.
- Keep track of their last read date and personal ratings.
- Create personal shelves to organize books in their own way.

Storyteller is _self-hosted_ software. This means that instead of running on
servers owned by a company or other organization, it runs on your servers. You
own your content and your data, and it will always be available to you!

---

## How Do I Use It?

- If you're looking to host your own Storyteller instance, step-by-step
  instructions start [here](installation/self-hosting.md).
- If someone you know has already created a Storyteller instance and invited you
  to it, and you'd just like to read the books they've shared with you,
  [these streamlined instructions](tutorials/basic-user.md) will get you
  reading, litening, or read-listening in no time.

---

## Requirements

- Resource Requirements - Before going further, take a moment to read the
  documentation on [minimum necessary resources](installation/resources.md) and
  make sure that you have a machine that will be able to run Storyteller!
- [Docker](https://docs.docker.com) - you will need to run Docker and
  [easy instructions](tutorials/docker.md) to get you going for Stroryteller
  without too much work are available.
- [Storyteller Server](https://storyteller-platform.gitlab.io/storyteller/) -
  You will need to either run the Storyteller server
  [locally](installation/self-hosting.md) or on a
  [paid hosting service](installation/resources.md#other-hosting-options).
- [Storyteller Apps](reading/storyteller-apps.md) - The Storyteller apps are by
  far the best way to enjoy your aligned books, but there are several
  [other options](reading/playing-readalouds.md#other-apps) available as well.
- DRM-free ebooks and audiobooks
  - Storyteller can only process and play files that are free of digitial rights
    management (DRM).
  - For audiobooks:
    - [Libro.fm](https://libro.fm/) is an online platform for audiobooks that
      sell only DRM-free audiobook files, _and they share revenue from your
      purchase with your local book store_. Without a monthly membership, their
      prices for some books can be very high, but they have a massive selection
      of books; I have yet to be unable to find what I'm looking for there.
    - [Downpour.com](https://www.downpour.com/) also sells DRM free audiobooks
      that can be downloaded as .m4b or .mp3 files.
  - For ebooks (a little harder to find):
    - Some publishers, like Tor and Dragonsteel (Brandon Sanderson's publishing
      company) simply provide books DRM-free, though that doesn't mean that all
      online storefronts make it straightforward to actually access the book
      files directly.
    - [Rakuten kobo](https://www.kobo.com/): it's easy to download book files
      from your purchased books, and books that are sold without DRM can be
      downloaded as EPUB files.

<details>
    <summary>What is DRM?</summary>

DRM ("Digital Rights Management") is a category of software that attempts to
limit access to digital goods. iTunes used to use DRM for music bought through
the iTunes store; the MP3 files that users downloaded from iTunes could _only_
be played on their Apple devices. In the book publishing world, the most common
DRM schemes are from Adobe, Amazon, and Apple.

</details>

---
