import { describe, it, expect } from "vitest"

import { isHiddenFile } from "./index.ts"

describe("isHiddenFile", () => {
  it("catches hidden files, including ones that shadow real audio names", () => {
    expect(isHiddenFile("._Track 01.mp3")).toBeTruthy()
    expect(isHiddenFile("/library/A Book/._Track 01.mp3")).toBeTruthy()
    expect(isHiddenFile("/library/.Trash/A Book/._Track 01.mp3")).toBeTruthy()
    expect(isHiddenFile(".DS_Store")).toBeTruthy()
    expect(isHiddenFile(".hidden.mp3")).toBeTruthy()
    expect(isHiddenFile("@eaDir/Track 1.mp3")).toBeTruthy()
  })

  it("leaves visible files alone", () => {
    expect(isHiddenFile("Track 01.mp3")).toBeFalsy()
    expect(isHiddenFile("/library/A Book/Track 01.mp3")).toBeFalsy()
    expect(isHiddenFile("_underscore name.mp3")).toBeFalsy()
    expect(isHiddenFile("Thumbs.db")).toBeFalsy()
  })
})
