import { describe, it } from "node:test"
import { Epub } from "../../epub"
import { join } from "node:path"
import { Synchronizer } from "../synchronizer"
import transcription from "../../__fixtures__/mobydick_001_002_melville.json"
import { StorytellerTranscription } from "../getSentenceRanges"
import assert from "node:assert"
import { SyncCache } from "../syncCache"

const stTranscription: StorytellerTranscription = {
  segments: transcription.segments.map((segment) => ({
    ...segment,
    audiofile: join("__fixtures__", "mobydick_001_002_melville.mp3"),
  })),
}

describe("Synchronizer", () => {
  it("synchronizes an epub", async () => {
    const epub = await Epub.from(join("__fixtures__", "moby-dick-small.epub"))
    const audiofiles = [join("__fixtures__", "mobydick_001_002_melville.mp3")]
    const syncCache = await SyncCache.init(
      join("__fixtures__", "__output__", "moby-dick-cache.json"),
    )
    const synchronizer = new Synchronizer(epub, syncCache, audiofiles, [
      stTranscription,
    ])
    await synchronizer.syncBook()

    const spine = await epub.getSpineItems()
    const mediaOverlay = await epub.readXhtmlItemContents(
      spine[1]!.mediaOverlay!,
    )
    const firstPar = mediaOverlay[0]!["smil"]![0]!["body"]![0]!["seq"]![0]!
    assert.strictEqual(firstPar[":@"]!["@_id"], "sentence1")
    assert.strictEqual(
      firstPar["par"]![0]![":@"]!["@_src"],
      "../3484760691463238453_2701-h-0.htm.xhtml#sentence1",
    )
    assert.strictEqual(
      firstPar["par"]![1]![":@"]!["@_src"],
      "../Audio/mobydick_001_002_melville.mp3",
    )
    assert.strictEqual(firstPar["par"]![1]![":@"]!["@_clipBegin"], "0s")
    assert.strictEqual(firstPar["par"]![1]![":@"]!["@_clipEnd"], "21.383s")
    await epub.close()
  })
})
