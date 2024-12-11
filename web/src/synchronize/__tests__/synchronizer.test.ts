import { describe, it } from "node:test"
import { Epub, XmlElement } from "@smoores/epub"
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
      "src",
      "synchronize",
      "__fixtures__",
      "mobydick_001_002_melville.mp3",
    ),
  })),
}

void describe("Synchronizer", () => {
  void it("synchronizes an epub", async () => {
    const epub = await Epub.from(join("src", "__fixtures__", "moby-dick.epub"))
    const audiofiles = [
      join("src", "__fixtures__", "mobydick_001_002_melville.mp3"),
    ]
    const syncCache = await SyncCache.init(
      join("src", "__fixtures__", "__output__", "moby-dick-cache.json"),
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

    const smil = mediaOverlay[0] as XmlElement<"smil">
    const body = Epub.getXmlChildren(smil)[1] as XmlElement<"body">
    const seq = Epub.getXmlChildren(body)[1] as XmlElement<"seq">
    // This gets us to sentence 570, which is the first sentence that's actually
    // a part of the book and in the audiobook
    const firstPar = Epub.getXmlChildren(seq)[1171] as XmlElement<"par">
    assert.strictEqual(firstPar[":@"]?.["@_id"], "pg-header-sentence585")
    const text = Epub.getXmlChildren(firstPar)[1] as XmlElement<"text">
    assert.strictEqual(
      text[":@"]?.["@_src"],
      "../3484760691463238453_2701-h-0.htm.xhtml#pg-header-sentence585",
    )
    const audio = Epub.getXmlChildren(firstPar)[3] as XmlElement<"audio">
    assert.strictEqual(
      audio[":@"]?.["@_src"],
      "../Audio/mobydick_001_002_melville.mp3",
    )
    assert.strictEqual(audio[":@"]["@_clipBegin"], "26.398s")
    assert.strictEqual(audio[":@"]["@_clipEnd"], "29.221s")

    assert.ok(manifest["audio_mobydick_001_002_melville"])
    await epub.close()
  })
})
