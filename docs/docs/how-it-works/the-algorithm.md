---
sidebar_position: 1
---

# The Algorithm

At the core of the Storyteller system is its
[synchronization algorithm](https://gitlab.com/smoores/storyteller/-/blob/main/storyteller/synchronize/sync.py?ref_type=heads).
This algorithm is responsible for taking an audiobook (either as an m4b/mp4
file, or as a zip of mp3 files) and an ebook (as an epub file) and producing a
new epub file with synced narration support. This process is known as forced
alignment.

## Background: EPUB and Media Overlays

EPUB is an open publication format for digital books. The specification can be
found [on the w3c website](https://www.w3.org/publishing/epub3/). At its core,
an EPUB is a ZIP file of xhtml and assets, with some additional XML files used
for defining the structure of the book.

EPUB has support for synced narration in via
[the Media Overlay specification](https://www.w3.org/TR/epub-33/#sec-media-overlays).
This allows EPUB creators to define the relatonships between xhtml elements
(such as paragraphs) and audio content.

In order to associate a chunk of text with a length of audio, that text needs to
be defined within an xhtml element that can be referenced. For larger units of
text like "paragraph" or "chapter", this is straightforward; since all
publishers must use `p` tags to define paragraphs, we can always associate a
given paragraph with some length of audio.

For smaller units of text, like "word" or "sentence", this is somewhat more
challenging. Most EPUB software does not wrap each word or sentence in its own
xhtml tag, which means that in order to associate a single sentence with a
length of audio, we must in fact modify the xhtml of the ebook ourselves to
include these tags. More on this later.

The goal of the Storyteller synchronization algorithm is to produce modified
EPUB documents that include per-sentence tags that are associated with the
correct length of audio in the provided audiobook.

## Step 1: Split chapters

The first step of the algorithm is somewhat trivial: split chapters into
individual audio files. Note that in this scenario, we are referring to
audiobook "chapters", which do not always directly correspond to chapters in the
text format of the book. It may be more accurate to think of these as "tracks".

This step allows processing to be more incremental and less resource intensive
than if we attempted to process the entire audiobook as a single file, which
means that if processing fails or is interrupted, it can restart without losing
much work.

For a ZIP of audio files, we simply unzip the archive to obtain the individual
tracks. For an m4b/mp4 file, we utilize the file metadata to identify the tracks
within the file and manually split them into individual files.

## Step 2: Transcribe the audio

Once we have individual tracks to work with, we begin transcription. This is the
most resource intensive part of the process. We rely on the Whisper AI
transcription model from OpenAI, via
[WhisperX](https://github.com/m-bain/whisperx). The WhisperX project also uses
`wave2vec2` to provide accurate word-level timestamps, which is important for
sentence-level synchronization. The transcription process is fairly standard;
the only interesting addition to the process that Storyteller makes is to supply
an "initial prompt" to the transcription model, outlining its task as
transcribing an audiobook chapter and providing a list of words from the book
that don't exist in the English dictionary as hints.

## Step 3: Produce the synced book

The final step is to take the transcriptions from Whisper and actually align
them with the text from the ebook.

### Finding the chapter in the transcription

The first challenge we face in the synchronization system is that audiobooks are
not 1:1 audio representations of ebooks. There is often some audio-only
introduction from the narrator and/or publishing company, tables of contents are
skipped, and forewards and other pre-story content is often skipped or read
_after_ the story, rather than before.

This means that Storyteller can't assume that the chapters in the ebook are in
order in the audiobook, or even represented at all. To work around this, for
each chapter, we scan through the transcription for a place that seems to match
the beginning of the chapter. We can't rely on exact matches, because AI
transcription isn't perfect (even if it is quite good!), and it often produces
alternative punctuation at the very least. Instead, we rely on a
[Levenshtein-distance-based fuzzy search algorithm](https://github.com/taleinat/fuzzysearch).
This allows us to specify a threshold for textual similarity, above which we
will consider a match.

Once we've found the transcription for a given chapter, we move on to aligning
the individual sentences.

### Marking up the sentences

Earlier, we mentioned that most books don't have markup around their sentences,
and that the Media Overlay specification requires references to specific
elements in the text for synchronizing with audio segments. But syncing with
entire paragraphs just doesn't provide a very good narration experience;
sentences are much better! There are also performance reasons to prefer
sentence-level alignment over paragraph-level alignment.

In order to support sentence-level alignment, Storyteller goes through each
chapter and wraps each sentence with a `span` tag, giving it a unique `id`
attribute. This process is somewhat more challenging than it initially seems;
it's important that Storyteller doesn't break existing markup, like `strong`
(bold) or `em` (italic) tags, links, lists, etc, so it's very careful to
maintain this existing markup where possible. Even so, there are some edge cases
here, and this logic is worth revisiting.

### Aligning sentences

In order to find the actual timestamps in the transcription that map to a given
sentence, we run a windowed search through the transcription, starting at the
offset identified by the first phase of this step. As before, we use a fuzzy
search algorithm to find matches, which is more likely to fail for an individual
sentence than an entire chapter. Because of this, if we can't find a match in
the given window, we move on to the next sentence rather than moving the window,
unless we fail to match three consecutive sentences. Only after three failures
do we move the window, and reset to the first failed match. This approach allows
our search to more readily abandon sentences that were not transcribed
correctly, favoring as many matches as possible and allowing gaps between
matches.

To account for these gaps, after matching every sentence, we interpolate over
the timestamps of the missing sentences. This, in theory, allows us to have a
range for every sentence, even if some of them are only estimations.

### Producing the Media Overlays

Once we have a time range for each sentence, we produce a SMIL Media Overlay, as
defined by the EPUB spec. This is fairly straightforward, as the overlay is
essentially a list of pairs, one referencing the id of the sentence's span, and
the other referencing the start and stop time of the corresponding audio
segment. This Media Overlay gets added to the EPUB package, along with the
referenced audio file and some metadata about duration.
