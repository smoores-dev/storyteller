import { describe, expect, it } from "vitest"

import { opdsTokenName } from "@/opds/auth"

describe("opdsTokenName", () => {
  const now = new Date(2026, 10, 13, 12)

  it("names the client and the date", () => {
    expect(opdsTokenName("KOReader/2024.11", now)).toBe(
      "OPDS sign-in from KOReader, 2026-11-13",
    )
  })

  it("falls back to the date alone", () => {
    expect(opdsTokenName(null, now)).toBe("OPDS sign-in, 2026-11-13")
  })
})
