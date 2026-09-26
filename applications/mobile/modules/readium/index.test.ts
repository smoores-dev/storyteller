import assert from "node:assert/strict"
import { test, vi } from "vitest"

import { type ReadiumLocalizedString } from "./src/Readium.types"

// The module under test re-exports the native module and the reader view.
vi.mock("./src/ReadiumModule", () => ({ default: {} }))
vi.mock("./src/ReadiumView", () => ({ default: () => null }))

const { parseLocalizedString, readiumToStorytellerAuthors } =
  await import("./index")

test("parses a plain string", () => {
  assert.equal(parseLocalizedString("Moby Dick"), "Moby Dick")
})

test("prefers the requested locale, then falls back to the first value", () => {
  assert.equal(
    parseLocalizedString({ "en-US": "Moby Dick", fr: "..." }),
    "Moby Dick",
  )
  assert.equal(parseLocalizedString({ de: "Moby Dick" }, "en-US"), "Moby Dick")
})

test("never returns a non-string", () => {
  for (const value of [undefined, null, {}, ""]) {
    assert.equal(typeof parseLocalizedString(value), "string")
  }
})

test("reads an android contributor, where every string is a language map", () => {
  const [author] = readiumToStorytellerAuthors({
    name: { und: "Ada Lovelace" },
    sortAs: { und: "Lovelace, Ada" },
    role: ["aut"],
  })

  assert.deepEqual(author, {
    name: "Ada Lovelace",
    file_as: "Lovelace, Ada",
    role: "aut",
  })
})

test("reads an ios contributor, where strings are not localized", () => {
  const [author] = readiumToStorytellerAuthors({
    name: "Ada Lovelace",
    sortAs: "Lovelace, Ada",
    role: ["aut"],
  })

  assert.deepEqual(author, {
    name: "Ada Lovelace",
    file_as: "Lovelace, Ada",
    role: "aut",
  })
})

test("falls back to the name when there is no sortAs", () => {
  const absent = readiumToStorytellerAuthors({
    name: { en: "Ada Lovelace" },
    role: ["aut"],
  })[0]
  assert.equal(absent?.file_as, "Ada Lovelace")

  const emptySortAsValues: ReadiumLocalizedString[] = [{}, ""]

  for (const sortAs of emptySortAsValues) {
    const author = readiumToStorytellerAuthors({
      name: { en: "Ada Lovelace" },
      sortAs,
      role: ["aut"],
    })[0]

    assert.equal(author?.file_as, "Ada Lovelace")
  }
})

test("flattens multiple roles into one string", () => {
  const author = readiumToStorytellerAuthors({
    name: "Ada Lovelace",
    role: ["aut", "nrt"],
  })[0]

  assert.equal(author?.role, "aut, nrt")
})

test("reads a bare string contributor", () => {
  assert.deepEqual(readiumToStorytellerAuthors("Ada Lovelace"), [
    { name: "Ada Lovelace", file_as: "Ada Lovelace", role: null },
  ])
})
