import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  seedBooks,
  setupTestDb,
  type TestDbContext,
} from "@/__tests__/harness/testDb"
import {
  getProgressionDocument,
  ProgressionConflictError,
  ProgressionNoopError,
  upsertProgression,
} from "@/database/progressions"
import { AUDIO_1 } from "@/progress/__tests__/fixtures.ts"
import { UriReference } from "@/progress/uriReference"
import { type UUID } from "@/uuid"

const CHAPTER_1 = "OEBPS/Text/chapter1.xhtml"

const DEVICE = { id: "https://example.com/device", name: "iPad Pro" }

const references = (char: string): UriReference[] => [
  new UriReference(`${CHAPTER_1}#char=${char}`),
  new UriReference(`${CHAPTER_1}#ch1-p2`),
]

let ctx!: TestDbContext
let userId!: UUID
let bookUuid!: UUID

async function createReader(
  ctx: TestDbContext,
  username: string,
): Promise<UUID> {
  const permission = await ctx.db
    .insertInto("userPermission")
    .values({ bookRead: true })
    .returning("uuid as uuid")
    .executeTakeFirstOrThrow()

  const user = await ctx.db
    .insertInto("user")
    .values({
      username,
      name: "Reader",
      email: `${username}@example.com`,
      userPermissionUuid: permission.uuid,
    })
    .returning("id as id")
    .executeTakeFirstOrThrow()

  return user.id
}

beforeEach(async () => {
  ctx = setupTestDb()

  userId = await createReader(ctx, "reader")

  ;[bookUuid] = seedBooks(ctx, [
    { title: "Progression Fixture", ebook: "book.epub" },
  ]) as [UUID]

  await setStatus("To read")
})

afterEach(() => {
  ctx[Symbol.dispose]()
})

async function setStatus(name: "To read" | "Reading" | "Read") {
  await ctx.db.deleteFrom("bookToStatus").execute()

  const status = await ctx.db
    .selectFrom("status")
    .select("uuid")
    .where("name", "=", name)
    .executeTakeFirstOrThrow()

  await ctx.db
    .insertInto("bookToStatus")
    .values({ bookUuid, userId, statusUuid: status.uuid })
    .execute()
}

async function statusName(): Promise<string | undefined> {
  const row = await ctx.db
    .selectFrom("bookToStatus")
    .innerJoin("status", "status.uuid", "bookToStatus.statusUuid")
    .select("status.name as name")
    .where("bookToStatus.bookUuid", "=", bookUuid)
    .executeTakeFirst()

  return row?.name
}

async function storedProgression(
  format: "ebook" | "audiobook" | "readaloud" = "ebook",
) {
  return ctx.db
    .selectFrom("progression")
    .select(["modified", "progression", "title", "deviceName"])
    .where("format", "=", format)
    .executeTakeFirstOrThrow()
}

async function storedHistory() {
  return ctx.db
    .selectFrom("progressionHistory")
    .select([
      "modified",
      "progression",
      "deviceName",
      "charRef",
      "mediaRef",
      "sourceFormat",
    ])
    .where("userId", "=", userId)
    .orderBy("modified", "asc")
    .execute()
}

describe("upsertProgression", () => {
  it("creates the book's progression", async () => {
    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.5,
        device: DEVICE,
        title: "Chapter One",
        references: [],
      },
    })

    expect(await storedProgression()).toEqual({
      modified: new Date("2024-01-01T00:00:00.000Z"),
      progression: 0.5,
      title: "Chapter One",
      deviceName: "iPad Pro",
    })
  })

  it("updates the stored progression when a newer one arrives", async () => {
    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.2,
        device: DEVICE,
        title: "Chapter One",
        references: [],
      },
    })

    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-02-01T00:00:00.000Z",
        progression: 0.75,
        device: DEVICE,
        title: "Chapter Two",
        references: [],
      },
    })

    expect(await storedProgression()).toEqual({
      modified: new Date("2024-02-01T00:00:00.000Z"),
      progression: 0.75,
      title: "Chapter Two",
      deviceName: "iPad Pro",
    })
  })

  it("rejects a progression older than the stored one", async () => {
    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-06-01T00:00:00.000Z",
        progression: 0.5,
        device: DEVICE,
        title: "Chapter One",
        references: [],
      },
    })

    await expect(
      upsertProgression(userId, bookUuid, "ebook", {
        ebook: {
          modified: "2024-05-01T00:00:00.000Z",
          progression: 0.2,
          device: DEVICE,
          title: "Chapter One",
          references: [],
        },
      }),
    ).rejects.toThrow(ProgressionConflictError)

    expect((await storedProgression()).modified).toEqual(
      new Date("2024-06-01T00:00:00.000Z"),
    )
  })

  it("rejects a progression with the timestamp it already has", async () => {
    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-06-01T00:00:00.000Z",
        progression: 0.5,
        device: DEVICE,
        title: "Chapter One",
        references: [],
      },
    })

    await expect(
      upsertProgression(userId, bookUuid, "ebook", {
        ebook: {
          modified: "2024-06-01T00:00:00.000Z",
          progression: 0.9,
          device: DEVICE,
          title: "Chapter One",
          references: [],
        },
      }),
    ).rejects.toThrow(ProgressionNoopError)
  })

  it("keeps each reader's progression to themselves", async () => {
    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.2,
        device: DEVICE,
        title: "Chapter One",
        references: [],
      },
    })

    const otherId = await createReader(ctx, "second-reader")

    await upsertProgression(otherId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-02-01T00:00:00.000Z",
        progression: 0.8,
        device: DEVICE,
        title: "Chapter One",
        references: [],
      },
    })

    const rows = await ctx.db
      .selectFrom("progression")
      .select(["userId", "progression"])
      .execute()

    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.userId === userId)?.progression).toBe(0.2)
    expect(rows.find((row) => row.userId === otherId)?.progression).toBe(0.8)
  })

  it("keeps each reader's progress to themselves", async () => {
    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.2,
        device: DEVICE,
        title: "Chapter One",
        references: references("15"),
      },
    })

    const otherId = await createReader(ctx, "second-reader")

    await upsertProgression(otherId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-02-01T00:00:00.000Z",
        progression: 0.5,
        device: DEVICE,
        title: "Chapter One",
        references: references("27"),
      },
    })

    const rows = await ctx.db
      .selectFrom("progression")
      .select(["userId"])
      .execute()

    expect(rows).toHaveLength(2)
    expect(rows.filter((row) => row.userId === userId)).toHaveLength(1)
    expect(rows.filter((row) => row.userId === otherId)).toHaveLength(1)

    expect(
      (await getProgressionDocument(userId, bookUuid, "ebook"))?.references,
    ).toEqual(
      expect.arrayContaining([`${CHAPTER_1}#char=15`, `${CHAPTER_1}#ch1-p2`]),
    )

    expect(
      (await getProgressionDocument(otherId, bookUuid, "ebook"))?.references,
    ).toEqual(
      expect.arrayContaining([`${CHAPTER_1}#char=27`, `${CHAPTER_1}#ch1-p2`]),
    )
  })

  it("writes a progression and reference for every format and fragment kind", async () => {
    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.5,
        device: DEVICE,
        title: "Chapter One",
        references: references("27"),
      },
      audiobook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.5,
        device: DEVICE,
        title: "Chapter One",
        references: [new UriReference(`${AUDIO_1}#t=150`)],
      },
    })

    expect(
      await ctx.db
        .selectFrom("progression")
        .select(["format", "modified"])
        .execute(),
    ).toEqual([
      {
        format: "ebook",
        modified: new Date("2024-01-01T00:00:00.000Z"),
      },
      {
        format: "audiobook",
        modified: new Date("2024-01-01T00:00:00.000Z"),
      },
    ])

    expect(
      await ctx.db
        .selectFrom("progressionReference")
        .select(["kind", "value"])
        .execute(),
    ).toEqual([
      {
        kind: "char",
        value: `${CHAPTER_1}#char=27`,
      },
      {
        kind: "anchor",
        value: `${CHAPTER_1}#ch1-p2`,
      },
      {
        kind: "media",
        value: `${AUDIO_1}#t=150`,
      },
    ])
  })

  it("replaces the stored reference of a format and kind", async () => {
    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.2,
        device: DEVICE,
        title: "Chapter One",
        references: references("15"),
      },
    })

    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-02-01T00:00:00.000Z",
        progression: 0.5,
        device: DEVICE,
        title: "Chapter One",
        references: references("27"),
      },
    })

    const rows = await ctx.db
      .selectFrom("progressionReference")
      .select(["kind", "value"])
      .where("kind", "=", "char")
      .execute()

    expect(rows).toEqual([{ kind: "char", value: `${CHAPTER_1}#char=27` }])
  })
})

describe("the book's status", () => {
  it("moves a book the reader started to Reading", async () => {
    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.0,
        device: DEVICE,
        title: "Chapter One",
        references: [],
      },
    })

    expect(await statusName()).toBe("Reading")
  })

  it("marks a book Read at the last two percent", async () => {
    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.98,
        device: DEVICE,
        title: "Chapter One",
        references: [],
      },
    })

    expect(await statusName()).toBe("Read")
  })

  it("does not move a Read book back to Reading", async () => {
    await setStatus("Read")

    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.1,
        device: DEVICE,
        title: "Chapter One",
        references: [],
      },
    })

    expect(await statusName()).toBe("Read")
  })
})

describe("the progression history", () => {
  it("records where the reader was", async () => {
    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.25,
        device: DEVICE,
        title: "Chapter One",
        references: references("27"),
      },
    })

    expect(await storedHistory()).toEqual([
      {
        modified: new Date("2024-01-01T00:00:00.000Z"),
        progression: 0.25,
        sourceFormat: "ebook",
        deviceName: "iPad Pro",
        charRef: `${CHAPTER_1}#char=27`,
        mediaRef: null,
      },
    ])
  })

  it("records at most one entry every five minutes", async () => {
    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.1,
        device: DEVICE,
        title: "Chapter One",
        references: [],
      },
    })

    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:06:00.000Z",
        progression: 0.2,
        device: DEVICE,
        title: "Chapter One",
        references: [],
      },
    })

    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:07:00.000Z",
        progression: 0.3,
        device: DEVICE,
        title: "Chapter One",
        references: [],
      },
    })

    expect((await storedHistory()).map((row) => row.modified)).toEqual([
      new Date("2024-01-01T00:00:00.000Z"),
      new Date("2024-01-01T00:06:00.000Z"),
    ])
  })

  it("records one entry per update, with a reference for each format", async () => {
    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.5,
        device: DEVICE,
        title: "Chapter One",
        references: references("27"),
      },
      audiobook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.5,
        device: DEVICE,
        title: "Chapter One",
        references: [new UriReference(`${AUDIO_1}#t=150`)],
      },
    })

    expect(await storedHistory()).toEqual([
      {
        modified: new Date("2024-01-01T00:00:00.000Z"),
        progression: 0.5,
        sourceFormat: "ebook",
        deviceName: "iPad Pro",
        charRef: `${CHAPTER_1}#char=27`,
        mediaRef: `${AUDIO_1}#t=150`,
      },
    ])
  })
})

describe("getProgressionDocument", () => {
  it("returns nothing for a book with no progression", async () => {
    expect(
      await getProgressionDocument(userId, bookUuid, "ebook"),
    ).toBeUndefined()
  })

  it("returns the stored progression with its references", async () => {
    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.5,
        device: DEVICE,
        title: "Chapter One",
        references: references("27"),
      },
    })

    const stored = await getProgressionDocument(userId, bookUuid, "ebook")

    expect(stored?.references).toEqual(
      expect.arrayContaining([`${CHAPTER_1}#char=27`, `${CHAPTER_1}#ch1-p2`]),
    )
    expect(stored?.modified).toBe("2024-01-01T00:00:00.000Z")
    expect(stored?.progression).toBe(0.5)
    expect(stored?.title).toBe("Chapter One")
    expect(stored?.device).toEqual(DEVICE)
  })

  it("returns no progression for a format with no references", async () => {
    await upsertProgression(userId, bookUuid, "ebook", {
      ebook: {
        modified: "2024-01-01T00:00:00.000Z",
        progression: 0.5,
        device: DEVICE,
        title: "Chapter One",
        references: [],
      },
    })

    expect(await getProgressionDocument(userId, bookUuid, "audiobook")).toEqual(
      undefined,
    )
  })
})
