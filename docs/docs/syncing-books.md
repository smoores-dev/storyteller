---
sidebar_position: 2
---

# Syncing books

Once you have your Storyteller server up and running, you can start managing
your new library! In order to produce a synced book, Storyteller needs two
things:

1. An EPUB book. EPUB is an open file format for ebooks, and most online book
   stores will provide EPUB files for their books, though many unfortunately
   still use DRM. Storyteller _cannot_ work with books that are locked with DRM.
   ACSM files, or EPUB files with Readium's LCP, will not work with Storyteller.
2. An audiobook. This can either be formatted as a single MP4 file (it may have
   a `.mp4`, `.m4a`, or `.m4b` file extension) or a ZIP archive of MP3 files. In
   the future, Storyteller may support other audiobook formats; for now, it only
   supports these common formats. Again, these files must not be protected by
   DRM; Storyteller cannot process or strip DRM-protected files.

## Uploading a book

Once you have your two book files, you can upload them to your Storyteller
server. Navigate to your web interface and click the "Add book" button, which
will open a dialogue where you can upload each file, first the EPUB, and then
the audiobook. After your file uploads have completed, you can click the "Start
processing" button, which will begin the automated syncing process.

Storyteller runs entirely on your hardware, which means the length of the
syncing process will vary depending on your hardware. Most of the processing
time is made up by the automated transcription of the audiobook, which is a very
resource intensive task. This will go faster if you have faster CPU cores, more
CPU cores, or a CUDA-capable GPU, but it's expected that the entire
synchronization process will take around 1-4 hours for most books on most
relatively modern hardware.

**Note**: If you have a CUDA-capable GPU, and would like to use that rather than
your CPU for transcription, make sure to run the API container with the
environment variable `STORYTELLER_DEVICE` set to `cuda`. Otherwise you will use
the default, which is `cpu`.

Please note that the transcription task will, by default, use as many CPU cores
and as much RAM as is available, and Docker, by default, will give it access to
all of the resources on your system. Given how long the transcription task can
take, this is likely not what you want, especially if you are running other
services on your system. It's recommended that you use the `--memory` and
`--cpus` flags on your `docker run` command to limit the resources available to
the API service container. For example, the following will run the container
with access to 24GB of memory and 8 CPU cores:

```shell
docker run -v ~/Documents/Storyteller:/data -p 8000:8000 --memory=24g --cpus=8 registry.gitlab.com/smoores/storyteller/api:latest
```

## Where do I get DRM-free books?

It is unfortunately the case that most book publishers and sellers only provide
digital book files with DRM protection. Finding alternatives that provide
DRM-free options can be a challenge.

For audiobooks, try [Libro.fm](https://libro.fm/). They're an online platform
for audiobooks that sell only DRM-free audiobook files, and they share revenue
from your purchase with your local book store. Without a monthly membership,
their prices for some books can be very high, but they have a massive selection
of books; I have yet to be unable to find what I'm looking for there.

For ebooks, the alternatives are a little less promising. Some publishers, like
Tor and Dragonsteel (Brandon Sanderson's publishing company) simply provide
books DRM-free, though that doesn't mean that all online storefronts make it
straightforward to actually access the book files directly. I personally
purchase ebooks through [Rakuten kobo](https://www.kobo.com/); it's easy to
download book files from your purchased books, and books that are sold without
DRM can be downloaded as EPUB files.
