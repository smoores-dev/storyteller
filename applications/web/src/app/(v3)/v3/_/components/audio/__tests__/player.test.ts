import assert from "node:assert"
import { beforeEach, describe, it } from "node:test"

import {
  type Clip,
  clipKey,
  clipSrc,
  formatClock,
} from "@/app/(v3)/v3/_/components/audio/clip"
import {
  play,
  playAll,
  seek,
  setRate,
  skip,
  stop,
  toggle,
  wholeFile,
} from "@/app/(v3)/v3/_/components/audio/store"

class FakeAudio {
  src = ""
  preload = ""
  currentTime = 0
  duration = 0
  playbackRate = 1
  paused = true
  loads = 0
  listeners = new Map<string, Set<() => void>>()

  addEventListener(type: string, listener: () => void) {
    const set = this.listeners.get(type) ?? new Set()
    set.add(listener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener)
  }

  load() {
    this.loads += 1
  }

  play() {
    this.paused = false
    return Promise.resolve()
  }

  pause() {
    this.paused = true
    this.fire("pause")
  }

  fire(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener()
  }
}

const audio = new FakeAudio()

Object.defineProperty(globalThis, "document", {
  value: { createElement: () => audio },
  configurable: true,
  writable: true,
})

const clipA: Clip = {
  bookUuid: "book-1",
  name: "00001.mp4",
  start: 10,
  end: 40,
  label: "Chapter 1",
}

const clipB: Clip = {
  bookUuid: "book-1",
  name: "00002.mp4",
  start: 0,
  end: 20,
  label: "Chapter 2",
}

function metadata(duration: number) {
  audio.duration = duration
  audio.fire("loadedmetadata")
}

void describe("clipSrc", () => {
  void it("builds a plain url with no range", () => {
    assert.strictEqual(
      clipSrc({ bookUuid: "abc", name: "00001.mp4", label: "x" }),
      "/api/v2/books/abc/listen/00001.mp4",
    )
  })

  void it("adds a media fragment for a range", () => {
    assert.strictEqual(
      clipSrc({
        bookUuid: "abc",
        name: "00001.mp4",
        start: 8.4567,
        end: 1088,
        label: "x",
      }),
      "/api/v2/books/abc/listen/00001.mp4#t=8.457,1088",
    )
  })

  void it("adds a start only fragment", () => {
    assert.strictEqual(
      clipSrc({ bookUuid: "abc", name: "a b.mp3", start: 3, label: "x" }),
      "/api/v2/books/abc/listen/a%20b.mp3#t=3",
    )
  })

  void it("keeps path separators unencoded", () => {
    assert.strictEqual(
      clipSrc({ bookUuid: "abc", name: "disc 1/00001.mp4", label: "x" }),
      "/api/v2/books/abc/listen/disc%201/00001.mp4",
    )
  })
})

void describe("formatClock", () => {
  void it("formats minutes and seconds", () => {
    assert.strictEqual(formatClock(0), "0:00")
    assert.strictEqual(formatClock(8), "0:08")
    assert.strictEqual(formatClock(68.9), "1:08")
    assert.strictEqual(formatClock(1088), "18:08")
  })

  void it("formats hours", () => {
    assert.strictEqual(formatClock(3600), "1:00:00")
    assert.strictEqual(formatClock(3671), "1:01:11")
  })

  void it("falls back for junk input", () => {
    assert.strictEqual(formatClock(-4), "0:00")
    assert.strictEqual(formatClock(Number.NaN), "0:00")
  })
})

void describe("clipKey", () => {
  void it("separates clips by range", () => {
    assert.notStrictEqual(clipKey(clipA), clipKey({ ...clipA, end: 41 }))
    assert.strictEqual(clipKey(clipA), clipKey({ ...clipA }))
  })
})

void describe("player store", () => {
  beforeEach(() => {
    stop()
    setRate(1)
    audio.currentTime = 0
    audio.duration = 0
  })

  void it("plays a clip from its start", () => {
    play(clipA)
    assert.strictEqual(
      audio.src,
      "/api/v2/books/book-1/listen/00001.mp4#t=10,40",
    )
    metadata(120)
    assert.strictEqual(audio.currentTime, 10)
    assert.strictEqual(audio.paused, false)
  })

  void it("toggles when the same clip is played again", () => {
    play(clipA)
    play(clipA)
    assert.strictEqual(audio.paused, true)
    play(clipA)
    assert.strictEqual(audio.paused, false)
  })

  void it("clamps seeking to the clip window", () => {
    play(clipA)
    metadata(120)
    seek(200)
    assert.strictEqual(audio.currentTime, 40)
    seek(0)
    assert.strictEqual(audio.currentTime, 10)
    skip(5)
    assert.strictEqual(audio.currentTime, 15)
  })

  void it("leaves a start only clip free to seek anywhere", () => {
    play({
      bookUuid: "book-1",
      name: "00003.mp4",
      start: 60,
      label: "Reel click",
    })
    metadata(120)
    assert.strictEqual(audio.currentTime, 60)
    seek(0)
    assert.strictEqual(audio.currentTime, 0)
    seek(500)
    assert.strictEqual(audio.currentTime, 120)
  })

  void it("releases the window for the whole file", () => {
    play(clipA)
    metadata(120)
    wholeFile()
    seek(0)
    assert.strictEqual(audio.currentTime, 0)
    seek(500)
    assert.strictEqual(audio.currentTime, 120)
  })

  void it("pauses at the clip end", () => {
    play(clipA)
    metadata(120)
    audio.currentTime = 40
    audio.fire("timeupdate")
    assert.strictEqual(audio.paused, true)
  })

  void it("advances through a queue at each clip end", () => {
    playAll([clipA, clipB])
    metadata(120)
    audio.currentTime = 40
    audio.fire("timeupdate")
    assert.strictEqual(
      audio.src,
      "/api/v2/books/book-1/listen/00002.mp4#t=0,20",
    )
    assert.strictEqual(audio.paused, false)
    metadata(120)
    audio.currentTime = 20
    audio.fire("timeupdate")
    assert.strictEqual(audio.paused, true)
    assert.strictEqual(
      audio.src,
      "/api/v2/books/book-1/listen/00002.mp4#t=0,20",
    )
  })

  void it("restarts from the clip start after reaching the end", () => {
    play(clipA)
    metadata(120)
    audio.currentTime = 40
    audio.fire("timeupdate")
    toggle()
    assert.strictEqual(audio.currentTime, 10)
    assert.strictEqual(audio.paused, false)
  })

  void it("applies the playback rate to later clips", () => {
    setRate(1.5)
    play(clipA)
    assert.strictEqual(audio.playbackRate, 1.5)
  })

  void it("stops and forgets the clip", () => {
    play(clipA)
    stop()
    assert.strictEqual(audio.paused, true)
    seek(30)
    assert.strictEqual(audio.currentTime, 0)
  })
})
