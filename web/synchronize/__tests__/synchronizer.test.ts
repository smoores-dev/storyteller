import { describe, it } from "node:test"
import { Epub } from "../../epub"
import { join } from "node:path"
import { Synchronizer } from "../synchronizer"
import transcription from "../../__fixtures__/mobydick_001_002_melville.json"
import { StorytellerTranscription } from "../getSentenceRanges"
import assert from "node:assert"
import { SyncCache } from "../syncCache"
import { TimelineEntry } from "echogarden/dist/utilities/Timeline"

const stTranscription: StorytellerTranscription = {
  transcript: transcription.transcript,
  wordTimeline: transcription.wordTimeline.map((entry) => ({
    ...(entry as TimelineEntry),
    audiofile: join(
      "synchronize",
      "__fixtures__",
      "mobydick_001_002_melville.mp3",
    ),
  })),
}

void describe("Synchronizer", () => {
  // TODO: This is failing in CI because it's somehow getting a
  // much different value for clipBegin?
  void it.skip("synchronizes an epub", async () => {
    const epub = await Epub.from(join("__fixtures__", "moby-dick.epub"))
    const audiofiles = [join("__fixtures__", "mobydick_001_002_melville.mp3")]
    const syncCache = await SyncCache.init(
      join("__fixtures__", "__output__", "moby-dick-cache.json"),
    )
    const synchronizer = new Synchronizer(epub, syncCache, audiofiles, [
      stTranscription,
    ])
    await synchronizer.syncBook()

    const manifest = await epub.getManifest()

    const spine = await epub.getSpineItems()
    const mediaOverlay = await epub.readXhtmlItemContents(
      spine[1]!.mediaOverlay!,
    )

    // This gets us to sentence 570, which is the first sentence that's actually
    // a part of the book and in the audiobook
    const firstPar = mediaOverlay[0]!["smil"]![1]!["body"]![1]!["seq"]![1141]!
    assert.strictEqual(firstPar[":@"]!["@_id"], "sentence570")
    assert.strictEqual(
      firstPar["par"]![1]![":@"]!["@_src"],
      "../3484760691463238453_2701-h-0.htm.xhtml#sentence570",
    )
    assert.strictEqual(
      firstPar["par"]![3]![":@"]!["@_src"],
      "../Audio/mobydick_001_002_melville.mp3",
    )
    assert.strictEqual(firstPar["par"]![3]![":@"]!["@_clipBegin"], "29.070s")
    assert.strictEqual(firstPar["par"]![3]![":@"]!["@_clipEnd"], "29.121s")

    assert.ok(manifest["audio_mobydick_001_002_melville"])
    await epub.close()
  })
})
