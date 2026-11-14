import { describe, expect, it } from "vitest"

import { describeUserAgent } from "@/userAgent"

describe("describeUserAgent", () => {
  it.each([
    ["KOReader/2024.11 (https://koreader.rocks/) LuaSocket/3.0.0", "KOReader"],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) EDRLab.ThoriumReader/3.1.0 Chrome/124.0.6367.243 Electron/30.4.0 Safari/537.36",
      "ThoriumReader on macOS",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0",
      "Firefox on macOS",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      "Safari on iOS",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
      "Chrome on Android",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
      "Edge on Windows",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) StorytellerTauri/3.0.0",
      "Storyteller desktop on macOS",
    ],
    ["Storyteller/412 CFNetwork/1568.200.51 Darwin/24.1.0", "Storyteller"],
    [
      "Dalvik/2.1.0 (Linux; U; Android 14; Pixel 8 Build/AP2A.240905.003)",
      "Android",
    ],
  ])("names %s", (userAgent, expected) => {
    expect(describeUserAgent(userAgent)).toBe(expected)
  })

  it("returns null without a user agent", () => {
    expect(describeUserAgent(null)).toBeNull()
    expect(describeUserAgent("")).toBeNull()
  })

  it("keeps long names short", () => {
    expect(describeUserAgent(`${"A".repeat(200)}/1.0`)).toHaveLength(60)
  })
})

describe("describeUserAgent without a recognisable client", () => {
  it("returns null for a bare HTTP library", () => {
    expect(describeUserAgent("okhttp/4.12.0")).toBeNull()
  })
})
