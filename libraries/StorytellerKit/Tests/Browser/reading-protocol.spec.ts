import { reflowBook } from "./fixtures/reflow.ts"
import type { ReadingSnapshot } from "./harness.d.ts"
import { test, expect } from "./support.ts"

// These run the shipped protocol and paginator. Inspect actual DOM geometry,
// not merely the list of scripts Swift would have sent.
test("a dropped completion is recoverable and a relative command is deduplicated", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  const initial = await reader.page.evaluate(() => {
    window.reader.dropReadingMessages(true)
    return window.reader.readingSnapshot()
  })
  const command = {
    documentID: initial.documentID,
    id: "turn-once",
    kind: "right",
    animated: false,
  }
  await reader.page.evaluate((c) => window.reader.readingCommand(c), command)
  await expect
    .poll(() =>
      reader.page.evaluate(
        () => window.reader.readingSnapshot().command?.status,
      ),
    )
    .toBe("completed")
  const after = await reader.page.evaluate(() =>
    window.reader.readingSnapshot(),
  )
  expect(after.command?.location?.cfi).toBe(after.location?.cfi)
  expect(after.location?.pageIndex).toBeGreaterThan(initial.location!.pageIndex)
  await reader.page.evaluate((c) => window.reader.readingCommand(c), command)
  await reader.page.evaluate(() => window.reader.settled())
  expect(
    (await reader.page.evaluate(() => window.reader.readingSnapshot())).location
      ?.cfi,
  ).toBe(after.location?.cfi)
})

test("old document commands cannot move a replacement reader", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  const before = await reader.page.evaluate(() =>
    window.reader.readingSnapshot(),
  )
  const response = await reader.page.evaluate(() =>
    window.reader.readingCommand({
      documentID: "destroyed-document",
      id: "stale",
      kind: "right",
    }),
  )
  expect(response).toEqual({ status: "staleDocument" })
  expect(
    (await reader.page.evaluate(() => window.reader.readingSnapshot())).location
      ?.cfi,
  ).toBe(before.location?.cfi)
})

test("restoration completes only after the requested anchor is visible", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  const doc = await reader.page.evaluate(
    () => window.reader.readingSnapshot().documentID,
  )
  await reader.page.evaluate(
    (documentID) =>
      window.reader.readingCommand({
        documentID,
        id: "restore",
        kind: "anchor",
        sectionIndex: 0,
        textId: "sentence-40",
      }),
    doc,
  )
  await expect
    .poll(() =>
      reader.page.evaluate(
        () => window.reader.readingSnapshot().command?.status,
      ),
    )
    .toBe("completed")
  expect((await reader.measure("sentence-40")).visibleArea).toBeGreaterThan(0)
  // Visibility is a fact independent of whether the highlight is painted.
  await reader.page.evaluate(() => window.reader.clearHighlight())
  expect(
    await reader.page.evaluate(
      () =>
        window.reader.readingSnapshot({
          sectionIndex: 0,
          textId: "sentence-40",
        }).playhead?.visible,
    ),
  ).toBe(true)
})

test("a missing anchor is a failure rather than a successful JS evaluation", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  const doc = await reader.page.evaluate(
    () => window.reader.readingSnapshot().documentID,
  )
  await reader.page.evaluate(
    (documentID) =>
      window.reader.readingCommand({
        documentID,
        id: "missing",
        kind: "anchor",
        sectionIndex: 0,
        textId: "does-not-exist",
      }),
    doc,
  )
  await expect
    .poll(() =>
      reader.page.evaluate(
        () => window.reader.readingSnapshot().command?.status,
      ),
    )
    .toBe("failed")
})

test("visible sentence identity is scoped to its section without split geometry", async ({
  reader,
}) => {
  await reader.open({
    book: reflowBook({ chapterCount: 2, writingMode: "vertical-rl" }),
  })
  for (const sectionIndex of [0, 1]) {
    if (sectionIndex === 1) await reader.navigate("chapter-2.xhtml#sentence-0")
    const [local, other] = await reader.page.evaluate(
      (sectionIndex) =>
        [sectionIndex, 1 - sectionIndex].map(
          (index) =>
            window.reader.readingSnapshot({
              sectionIndex: index,
              textId: "sentence-0",
            }).playhead,
        ),
      sectionIndex,
    )
    expect(local?.visible).toBe(true)
    expect(other?.visible).toBe(false)
    expect((await reader.measure("sentence-0")).ratio).toBeGreaterThan(0.99)
  }
})

test("a local gesture rejects competing follow navigation even with dropped notifications", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  const doc = await reader.page.evaluate(() => {
    window.reader.dropReadingMessages(true)
    window.reader.readingInput(true)
    return window.reader.readingSnapshot().documentID
  })
  const result = await reader.page.evaluate(
    (documentID) =>
      window.reader.readingCommand({
        documentID,
        id: "follow",
        kind: "anchor",
        sectionIndex: 0,
        textId: "sentence-40",
      }),
    doc,
  )
  expect(result).toMatchObject({ status: "rejected" })
  await reader.page.evaluate(() => window.reader.readingInput(false))
  await expect
    .poll(() =>
      reader.page.evaluate(
        () => window.reader.readingSnapshot().gesture?.active,
      ),
    )
    .toBe(false)
})

for (const scrolling of [false, true]) {
  for (const gap of [0, 80, 150]) {
    test(`wheel input ${gap}ms into ${scrolling ? "scrolling" : "paginated"} reflow finishes without navigation or a stuck reader`, async ({
      reader,
    }) => {
      await reader.open({ book: reflowBook() })
      if (scrolling)
        await reader.page.evaluate(() => window.reader.scrollingMode())
      await reader.navigate("chapter.xhtml#sentence-40")
      await reader.page.mouse.move(200, 200)
      const reflow = reader.page.evaluate(() =>
        window.reader.reflow({ height: 480 }),
      )
      await reader.page.waitForTimeout(gap)
      await reader.page.mouse.wheel(scrolling ? 0 : 450, scrolling ? 450 : 0)
      await reflow
      await expect
        .poll(() =>
          reader.page.evaluate(() => {
            const state = window.reader.readingSnapshot()
            return state.gesture?.active === false && !state.navigationBlocked
          }),
        )
        .toBe(true)
      const settled = await reader.page.evaluate(() =>
        window.reader.readingSnapshot(),
      )
      expect(settled.gesture?.moved).toBe(false)
      expect((await reader.measure("sentence-40")).visibleArea).toBeGreaterThan(
        0,
      )

      await reader.page.evaluate(
        (documentID) =>
          window.reader.readingCommand({
            documentID,
            id: "after-reflow",
            kind: "anchor",
            sectionIndex: 0,
            textId: "sentence-80",
            animated: false,
          }),
        settled.documentID,
      )
      await expect
        .poll(() =>
          reader.page.evaluate(
            () => window.reader.readingSnapshot().command?.status,
          ),
        )
        .toBe("completed")
      expect((await reader.measure("sentence-80")).visibleArea).toBeGreaterThan(
        0,
      )
    })
  }
}

test("wheel input without movement has no navigation destination", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  const before = await reader.page.evaluate(() =>
    window.reader.readingSnapshot(),
  )
  await reader.page.mouse.move(200, 200)
  // Vertical wheel input cannot move this horizontal paginator.
  await reader.page.mouse.wheel(0, 450)
  await expect
    .poll(() =>
      reader.page.evaluate(() => {
        const state = window.reader.readingSnapshot()
        return state.gesture?.active === false && !state.navigationBlocked
      }),
    )
    .toBe(true)
  const after = await reader.page.evaluate(() =>
    window.reader.readingSnapshot(),
  )
  expect(after.gesture?.moved).toBe(false)
  expect(after.location?.cfi).toBe(before.location?.cfi)
})

test("a completed scroll receipt survives dropped events, following, and a later tap", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  await reader.page.evaluate(() => window.reader.scrollingMode())
  await reader.page.evaluate(() => window.reader.dropReadingMessages(true))
  const bounds = await reader.page.locator("foliate-view").boundingBox()
  expect(bounds).not.toBeNull()
  await reader.page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  )
  await reader.page.mouse.wheel(0, 600)
  await expect
    .poll(() =>
      reader.page.evaluate(() => {
        const gesture = window.reader.readingSnapshot().gesture
        return gesture?.moved === true && gesture.active === false
      }),
    )
    .toBe(true)
  const afterScroll = await reader.page.evaluate(() =>
    window.reader.readingSnapshot(),
  )
  expect(afterScroll.gesture?.location?.cfi).toBe(afterScroll.location?.cfi)
  await reader.page.evaluate(
    (documentID) =>
      window.reader.readingCommand({
        documentID,
        id: "later-follow",
        kind: "anchor",
        sectionIndex: 0,
        textId: "sentence-1",
      }),
    afterScroll.documentID,
  )
  await expect
    .poll(() =>
      reader.page.evaluate(
        () => window.reader.readingSnapshot().command?.status,
      ),
    )
    .toBe("rejected")
  await reader.page.evaluate(() => {
    window.reader.readingInput(true)
    window.reader.readingInput(false)
  })
  await expect
    .poll(() =>
      reader.page.evaluate(
        () => window.reader.readingSnapshot().gesture?.active,
      ),
    )
    .toBe(false)
  const final = await reader.page.evaluate(() =>
    window.reader.readingSnapshot(),
  )
  expect(final.gesture?.id).toBe(afterScroll.gesture?.id)
  expect(final.gesture?.location?.cfi).toBe(afterScroll.gesture?.location?.cfi)
})

test("a chapter href without a fragment produces a verified receipt", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook({ chapterCount: 2 }) })
  const documentID = await reader.page.evaluate(
    () => window.reader.readingSnapshot().documentID,
  )
  await reader.page.evaluate(
    (documentID) =>
      window.reader.readingCommand({
        documentID,
        id: "chapter",
        kind: "href",
        value: "chapter-2.xhtml",
      }),
    documentID,
  )
  await expect
    .poll(() =>
      reader.page.evaluate(
        () => window.reader.readingSnapshot().command?.status,
      ),
    )
    .toBe("completed")
  expect(
    (await reader.page.evaluate(() => window.reader.readingSnapshot())).command
      ?.location?.sectionIndex,
  ).toBe(1)
})

test("a page gesture retains its final destination across a chapter boundary", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook({ chapterCount: 2 }) })
  await reader.navigate("chapter.xhtml#sentence-119")
  const bounds = await reader.page.locator("foliate-view").boundingBox()
  expect(bounds).not.toBeNull()
  await reader.page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  )
  for (const direction of [1, -1]) {
    await reader.page.mouse.wheel(direction * bounds!.width, 0)
    await expect
      .poll(() =>
        reader.page.evaluate(() => {
          const snapshot = window.reader.readingSnapshot()
          return snapshot.gesture?.moved && !snapshot.gesture.active
        }),
      )
      .toBe(true)
    // Check the destination delivered at completion. Later font reflow may
    // change the visible range without changing this retained navigation.
    const snapshot = await reader.page.evaluate(() => {
      const gesture = window.reader.readingSnapshot().gesture
      return window.reader
        .snapshot()
        .messages.filter((m) => m.name === "ReadingState")
        .map((m) => m.body as unknown as ReadingSnapshot)
        .find(
          (s) => s.gesture?.id === gesture?.id && s.gesture?.active === false,
        )!
    })
    expect(snapshot.location?.sectionIndex).toBe(direction > 0 ? 1 : 0)
    expect(snapshot.gesture?.location).toEqual(snapshot.location)
    await reader.page.evaluate((snapshot) => {
      window.reader.acknowledgeReading(
        snapshot.documentID,
        null,
        snapshot.gesture!.id,
      )
    }, snapshot)
  }
})

test("stale presentation cannot paint or move a replacement document", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  const before = await reader.page.evaluate(() =>
    window.reader.readingSnapshot(),
  )
  expect(
    await reader.page.evaluate(() =>
      window.reader.presentReading({
        documentID: "old",
        playing: true,
        highlight: true,
        follow: true,
        anchor: { sectionIndex: 0, textId: "sentence-40" },
      }),
    ),
  ).toBe(false)
  expect(
    (await reader.page.evaluate(() => window.reader.readingSnapshot())).location
      ?.cfi,
  ).toBe(before.location?.cfi)
})

test("internal links and page keys request Swift navigation without moving the reader", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  const before = await reader.page.evaluate(() =>
    window.reader.readingSnapshot(),
  )
  const requests = await reader.page.evaluate(() => {
    const doc = window.reader.document()
    const link = doc.createElement("a")
    link.href = "chapter.xhtml#sentence-40"
    link.textContent = "Later"
    doc.body.prepend(link)
    link.click()
    doc.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "PageDown",
        bubbles: true,
        cancelable: true,
      }),
    )
    return window.reader
      .snapshot()
      .messages.filter((m) => m.name === "ReadingNavigate")
  })
  expect(requests).toHaveLength(2)
  expect(requests[0].body).toMatchObject({
    documentID: before.documentID,
    target: { kind: "href" },
  })
  expect(requests[1].body).toMatchObject({
    documentID: before.documentID,
    target: { kind: "next" },
  })
  expect(
    (await reader.page.evaluate(() => window.reader.readingSnapshot())).location
      ?.cfi,
  ).toBe(before.location?.cfi)
})

test("logical forward navigation respects RTL and skips nonlinear spine entries", async ({
  reader,
}) => {
  const book = reflowBook({ chapterCount: 3 })
  book.dir = "rtl"
  book.sections[1].linear = "no"
  await reader.open({ book })
  const documentID = await reader.page.evaluate(
    () => window.reader.readingSnapshot().documentID,
  )
  await reader.page.evaluate(
    (documentID) =>
      window.reader.readingCommand({
        documentID,
        id: "end-of-chapter",
        kind: "section",
        sectionIndex: 0,
        fraction: 1,
      }),
    documentID,
  )
  await expect
    .poll(() =>
      reader.page.evaluate(
        () => window.reader.readingSnapshot().command?.status,
      ),
    )
    .toBe("completed")
  await reader.page.evaluate(
    (documentID) =>
      window.reader.readingCommand({
        documentID,
        id: "forward",
        kind: "next",
        animated: false,
      }),
    documentID,
  )
  await expect
    .poll(() =>
      reader.page.evaluate(
        () => window.reader.readingSnapshot().command?.status,
      ),
    )
    .toBe("completed")
  expect(
    (await reader.page.evaluate(() => window.reader.readingSnapshot())).location
      ?.sectionIndex,
  ).toBe(2)
})
