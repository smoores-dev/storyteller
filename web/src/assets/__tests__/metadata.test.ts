import assert from "node:assert"
import { describe, it } from "node:test"

import { applyFieldOverrides } from "@/assets/metadata"
import { type BookWithRelations } from "@/database/books"
import {
  type MetadataFieldOverrides,
  defaultMetadataFieldOverrides,
} from "@/database/settingsTypes"

type CreatorRow = BookWithRelations["authors"][number]
type SeriesRow = BookWithRelations["series"][number]
type TagRow = BookWithRelations["tags"][number]

function creator(name: string, fileAs?: string): CreatorRow {
  return {
    uuid: "00000000-0000-0000-0000-000000000000" as CreatorRow["uuid"],
    id: 0,
    name,
    fileAs: fileAs ?? name,
    createdAt: "",
    updatedAt: "",
  }
}

function seriesRow(name: string, position?: number): SeriesRow {
  return {
    uuid: "00000000-0000-0000-0000-000000000000" as SeriesRow["uuid"],
    name,
    featured: false,
    position: position ?? null,
    createdAt: "",
    updatedAt: "",
  }
}

function tagRow(name: string): TagRow {
  return {
    uuid: "00000000-0000-0000-0000-000000000000" as TagRow["uuid"],
    name,
    createdAt: "",
    updatedAt: "",
  }
}

function makeBook(
  overrides: Partial<BookWithRelations> = {},
): BookWithRelations {
  const base = {
    uuid: "00000000-0000-0000-0000-000000000000",
    title: "",
    subtitle: null,
    description: null,
    language: null,
    publicationDate: null,
    authors: [],
    narrators: [],
    creators: [],
    series: [],
    tags: [],
  } as unknown as BookWithRelations
  return { ...base, ...overrides }
}

function makeOverrides(
  patch: Partial<MetadataFieldOverrides> = {},
): MetadataFieldOverrides {
  return { ...defaultMetadataFieldOverrides("merge"), ...patch }
}

void describe("applyFieldOverrides", () => {
  void describe("scalar fields", () => {
    void it("merge keeps existing title when storyteller already has one", () => {
      const result = applyFieldOverrides(
        makeOverrides(),
        makeBook({ title: "Stored Title" }),
        { title: "Extracted Title" },
        {},
      )
      assert.strictEqual(result.metadataUpdate, null)
    })

    void it("merge fills empty subtitle from extracted value", () => {
      const result = applyFieldOverrides(
        makeOverrides(),
        makeBook({ title: "x", subtitle: null }),
        { subtitle: "From file" },
        {},
      )
      assert.deepStrictEqual(result.metadataUpdate, { subtitle: "From file" })
    })

    void it("always overrides scalar value even when storyteller has one", () => {
      const result = applyFieldOverrides(
        makeOverrides({ title: "always" }),
        makeBook({ title: "Stored Title" }),
        { title: "Extracted Title" },
        {},
      )
      assert.deepStrictEqual(result.metadataUpdate, {
        title: "Extracted Title",
      })
    })

    void it("skip ignores extracted scalar even when storyteller is empty", () => {
      const result = applyFieldOverrides(
        makeOverrides({ description: "skip" }),
        makeBook({ description: null }),
        { description: "From file" },
        {},
      )
      assert.strictEqual(result.metadataUpdate, null)
    })
  })

  void describe("list fields with merge", () => {
    void it("unions current tags with extracted tags", () => {
      const result = applyFieldOverrides(
        makeOverrides(),
        makeBook({ tags: [tagRow("lame")] }),
        null,
        { tags: ["interesting"] },
      )
      assert.deepStrictEqual(result.relationUpdate.tags, [
        "lame",
        "interesting",
      ])
    })

    void it("dedupes when extracted tag matches a current tag", () => {
      const result = applyFieldOverrides(
        makeOverrides(),
        makeBook({ tags: [tagRow("interesting")] }),
        null,
        { tags: ["interesting", "cool"] },
      )
      assert.deepStrictEqual(result.relationUpdate.tags, [
        "interesting",
        "cool",
      ])
    })

    void it("treats a renamed tag as a new entry, keeping the original", () => {
      const result = applyFieldOverrides(
        makeOverrides(),
        makeBook({ tags: [tagRow("intresting")] }),
        null,
        { tags: ["interesting"] },
      )
      assert.deepStrictEqual(result.relationUpdate.tags, [
        "intresting",
        "interesting",
      ])
    })

    void it("emits no tag patch when there is nothing on either side", () => {
      const result = applyFieldOverrides(makeOverrides(), makeBook(), null, {})
      assert.strictEqual(result.relationUpdate.tags, undefined)
    })

    void it("unions authors by name", () => {
      const result = applyFieldOverrides(
        makeOverrides(),
        makeBook({ authors: [creator("Alice")] }),
        null,
        {
          creators: [
            { name: "Bob", role: "aut", fileAs: "Bob" },
            { name: "Alice", role: "aut", fileAs: "Alice" },
          ],
        },
      )
      const names = result.relationUpdate.creators?.map((c) => c.name) ?? []
      assert.deepStrictEqual(names, ["Alice", "Bob"])
    })

    void it("unions series by name", () => {
      const result = applyFieldOverrides(
        makeOverrides(),
        makeBook({ series: [seriesRow("Foundation", 1)] }),
        null,
        {
          series: [
            { name: "Foundation", featured: true, position: 2 },
            { name: "Robots", featured: false },
          ],
        },
      )
      const names = result.relationUpdate.series?.map((s) => s.name) ?? []
      assert.deepStrictEqual(names, ["Foundation", "Robots"])
    })

    void it("does not keep authors when both current and extracted are empty", () => {
      const result = applyFieldOverrides(makeOverrides(), makeBook(), null, {})
      assert.strictEqual(result.relationUpdate.creators, undefined)
    })
  })

  void describe("list fields with always", () => {
    void it("replaces tags with extracted set", () => {
      const result = applyFieldOverrides(
        makeOverrides({ tags: "always" }),
        makeBook({ tags: [tagRow("lame")] }),
        null,
        { tags: ["interesting"] },
      )
      assert.deepStrictEqual(result.relationUpdate.tags, ["interesting"])
    })
  })

  void describe("list fields with skip", () => {
    void it("emits no tag patch even when extracted has entries", () => {
      const result = applyFieldOverrides(
        makeOverrides({ tags: "skip" }),
        makeBook({ tags: [tagRow("lame")] }),
        null,
        { tags: ["interesting"] },
      )
      assert.strictEqual(result.relationUpdate.tags, undefined)
    })

    void it("uses existing creators when only authors mode is skip", () => {
      const result = applyFieldOverrides(
        makeOverrides({ authors: "skip" }),
        makeBook({
          authors: [creator("Alice")],
          narrators: [creator("Bob")],
        }),
        null,
        {
          creators: [{ name: "Carol", role: "nrt", fileAs: "Carol" }],
        },
      )
      const narrators =
        result.relationUpdate.creators?.filter((c) => c.role === "nrt") ?? []
      const authors =
        result.relationUpdate.creators?.filter((c) => c.role === "aut") ?? []
      // narrators are merged (Bob + Carol)
      assert.deepStrictEqual(narrators.map((c) => c.name).sort(), [
        "Bob",
        "Carol",
      ])
      // authors are preserved (Alice) because we never produce a creators
      // patch that wipes a role that's set to skip.
      assert.deepStrictEqual(
        authors.map((c) => c.name),
        ["Alice"],
      )
    })
  })
})
