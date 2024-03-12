---
sidebar_position: 3
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
your CPU for transcription, check out the
[instructions below](#using-cuda-for-gpu-accelerated-transcription).

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
[Downpour.com](https://www.downpour.com/) also sells DRM free audiobooks that
can be downloaded as .m4b or .mp3 files.

For ebooks, the alternatives are a little less promising. Some publishers, like
Tor and Dragonsteel (Brandon Sanderson's publishing company) simply provide
books DRM-free, though that doesn't mean that all online storefronts make it
straightforward to actually access the book files directly. I personally
purchase ebooks through [Rakuten kobo](https://www.kobo.com/); it's easy to
download book files from your purchased books, and books that are sold without
DRM can be downloaded as EPUB files.

## Using CUDA for GPU accelerated transcription

> Note: The minimum supported CUDA version is 11.8.

The transcription phase can be fairly slow on a CPU, but it can be sped up quite
dramatically with a CUDA-enabled GPU. There are a few steps you'll need to
follow to do so.

1. Install and configure the
   [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html).
   Make sure to follow the
   ["Configuration Docker"](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html#configuring-docker)
   section as well.
2. Update your `compose.yaml` file or docker CLI commands:

   a. Replace the `api:latest` image tag with `api:cuda` (note that this image
   is _much_ larger and may take a while to download)

   b. Add `runtime: nvidia` to the `api` service stanza. You can add it right
   below the `image` property

### CUDA Environment Variables

| Parameter                           | Description                                                                                                                | Default | CUDA Options                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| STORYTELLER_DEVICE (required)       | The device Storyteller will use to process files.                                                                          | `cpu`   | `gpu`                                                                                                                |
| NVIDIA_VISIBLE_DEVICES (required)   | Expose NVIDIA GPU to container.                                                                                            | `none`  | `all`                                                                                                                |
| STORYTELLER_BATCH_SIZE (optional)   | Number of audio chunks being processed at a single time. Decrease this value if you are running into out of memory errors. | `16`    | minumum value of `1`                                                                                                 |
| STORYTELLER_COMPUTE_TYPE (optional) | Helps with reducing the model size and accelerate its execution. Increasing this value may impact quality.                 | `int8`  | [See CTranslate2 documentation.](https://opennmt.net/CTranslate2/quantization.html#implicit-type-conversion-on-load) |
