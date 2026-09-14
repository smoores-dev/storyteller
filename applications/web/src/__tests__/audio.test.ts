import assert from "node:assert"
import { join } from "node:path"

import { describe, it } from "vitest"

import {
  getTrackDuration,
  isAudioFile,
  isHiddenFile,
  isZipArchive,
} from "@/audio"

describe("getTrackInfo", () => {
  it("can get track duration from an mp3 file", async () => {
    const duration = await getTrackDuration(
      join("src", "__fixtures__", "mp3", "mobydick_001_002_melville.mp3"),
    )
    assert.strictEqual(Math.floor(duration), 1436)
  })

  it("can get track info from an mp4 file", async () => {
    const duration = await getTrackDuration(
      join(
        "src",
        "__fixtures__",
        "mpeg4",
        "MobyDickOrTheWhalePart1_librivox.m4b",
      ),
    )
    assert.strictEqual(Math.floor(duration), 18742)
  })
})

describe("isAudioFile", () => {
  it("recognizes mp3, mp4, and opus formats", () => {
    assert.ok(isAudioFile("track.mp3"))
    assert.ok(isAudioFile("track.m4a"))
    assert.ok(isAudioFile("track.m4b"))
    assert.ok(isAudioFile("track.mp4"))
    assert.ok(isAudioFile("track.aac"))
    assert.ok(isAudioFile("track.ogg"))
    assert.ok(isAudioFile("track.oga"))
    assert.ok(isAudioFile("track.opus"))
  })

  it("recognizes file formats we don't use", () => {
    assert.ok(isAudioFile("track.flac"))
    assert.ok(isAudioFile("track.wav"))
  })

  it("does not recognize other formats", () => {
    assert.ok(!isAudioFile("track.json"))
    assert.ok(!isAudioFile("track.epub"))
    assert.ok(!isAudioFile("track.html"))
    assert.ok(!isAudioFile("track.zip"))
    assert.ok(!isAudioFile("track.txt"))
  })

  it("works with full file names", () => {
    assert.ok(isAudioFile("somefile.m4b"))
    assert.ok(isAudioFile("audiobook/chapter 1.mp3"))
    assert.ok(isAudioFile("audio.book/chapter.1.flac"))
    assert.ok(!isAudioFile("cover.png"))
    assert.ok(!isAudioFile("A Book.epub"))
    assert.ok(!isAudioFile("README.txt"))
  })

  it("ignores extension casing, which rips from older tools vary", () => {
    // "Track 01.MP3" is the same audio as "Track 01.mp3"; a case-sensitive
    // check silently dropped every track of an uppercase rip, so the book
    // imported with no audio at all.
    assert.ok(isAudioFile("Track 01.MP3"))
    assert.ok(isAudioFile("Track 01.Mp3"))
    assert.ok(isAudioFile("book.M4B"))
    assert.ok(isAudioFile("track.FLAC"))
    assert.ok(!isAudioFile("README.TXT"))
  })
})

describe("isZipArchive", () => {
  it("accepts .zip regardless of casing", () => {
    assert.ok(isZipArchive("book.zip"))
    assert.ok(isZipArchive("book.ZIP"))
    assert.ok(!isZipArchive("book.epub"))
  })
})

describe("isHiddenFile", () => {
  it("catches hidden files, including ones that shadow real audio names", () => {
    assert.ok(isHiddenFile("._Track 01.mp3"))
    assert.ok(isHiddenFile("/library/A Book/._Track 01.mp3"))
    assert.ok(isHiddenFile(".DS_Store"))
    assert.ok(isHiddenFile(".hidden.mp3"))
  })

  it("leaves visible files alone", () => {
    assert.ok(!isHiddenFile("Track 01.mp3"))
    assert.ok(!isHiddenFile("/library/A Book/Track 01.mp3"))
    assert.ok(!isHiddenFile("_underscore name.mp3"))
    assert.ok(!isHiddenFile("Thumbs.db"))
  })
})
