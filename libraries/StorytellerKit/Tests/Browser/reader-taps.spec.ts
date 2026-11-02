import { test, expect } from "./support.ts"

for (const delay of [100, 200, 250]) {
  test(`double click ${delay}ms apart seeks once without toggling chrome`, async ({
    reader,
    page,
  }) => {
    await reader.open({
      book: {
        sections: [
          {
            id: "chapter.xhtml",
            html: '<p id="sentence">A sentence to seek to without changing the reader controls.</p>',
          },
        ],
      },
    })
    const { rects } = await reader.measure("sentence")
    const rect = rects[0]!
    await page.mouse.click(
      (rect.left + rect.right) / 2,
      (rect.top + rect.bottom) / 2,
    )
    await page.waitForTimeout(delay)
    await page.mouse.down({ clickCount: 2 })
    await page.mouse.up({ clickCount: 2 })
    // Also catch a single-click timer left behind by the second click.
    await page.waitForTimeout(500)
    const { messages } = await reader.snapshot()
    expect(
      messages.filter(({ name }) => name === "mediaOverlaySeek"),
    ).toHaveLength(1)
    expect(messages.filter(({ name }) => name === "OverlayToggled")).toEqual([])
  })
}

test("a single click toggles chrome once at 300ms", async ({
  reader,
  page,
}) => {
  await reader.open({
    book: {
      sections: [
        {
          id: "chapter.xhtml",
          html: '<p id="sentence">A single tap in the middle of this sentence should show the reader controls.</p>',
        },
      ],
    },
  })
  const { rects } = await reader.measure("sentence")
  const rect = rects[0]!
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") })
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"))
  await page.mouse.click(
    (rect.left + rect.right) / 2,
    (rect.top + rect.bottom) / 2,
  )
  await page.clock.runFor(299)
  expect(
    (await reader.snapshot()).messages.filter(
      ({ name }) => name === "OverlayToggled",
    ),
  ).toEqual([])
  await page.clock.runFor(1)
  const { messages } = await reader.snapshot()
  expect(messages.filter(({ name }) => name === "OverlayToggled")).toHaveLength(
    1,
  )
  expect(messages.filter(({ name }) => name === "mediaOverlaySeek")).toEqual([])
})

for (const margins of [false, true]) {
  test(`separate clicks 300ms apart preserve ${margins ? "margin navigation" : "chrome toggles"}`, async ({
    reader,
    page,
  }) => {
    await reader.open({
      book: {
        sections: [
          {
            id: "chapter.xhtml",
            html: '<p id="first">The first sentence fills the middle of the page.</p><p id="second">The second sentence is a separate click target.</p>',
          },
        ],
      },
    })
    const first = (await reader.measure("first")).rects[0]!
    const second = (await reader.measure("second")).rects[0]!
    await page.mouse.click(margins ? 380 : 200, (first.top + first.bottom) / 2)
    await page.waitForTimeout(300)
    await page.mouse.click(margins ? 20 : 200, (second.top + second.bottom) / 2)
    await page.waitForTimeout(500)
    const { messages } = await reader.snapshot()
    expect(messages.filter(({ name }) => name === "mediaOverlaySeek")).toEqual(
      [],
    )
    if (margins) {
      expect(
        messages
          .filter(({ name }) => name === "MarginClickNav")
          .map(({ body }) => body.direction),
      ).toEqual(["right", "left"])
    } else {
      expect(
        messages.filter(({ name }) => name === "OverlayToggled"),
      ).toHaveLength(2)
    }
  })
}

test("an earlier single click cannot release a later double click's timer", async ({
  reader,
  page,
}) => {
  await reader.open({
    book: {
      sections: [
        {
          id: "chapter.xhtml",
          html: '<p id="sentence">A sentence long enough to provide two distinct click positions.</p>',
        },
      ],
    },
  })
  const rect = (await reader.measure("sentence")).rects[0]!
  const y = (rect.top + rect.bottom) / 2
  await page.mouse.click(100, y)
  await page.waitForTimeout(200)
  await page.mouse.click(300, y)
  await page.waitForTimeout(250)
  await page.mouse.down({ clickCount: 2 })
  await page.mouse.up({ clickCount: 2 })
  await page.waitForTimeout(500)
  const { messages } = await reader.snapshot()
  expect(messages.filter(({ name }) => name === "OverlayToggled")).toHaveLength(
    1,
  )
  expect(
    messages.filter(({ name }) => name === "mediaOverlaySeek"),
  ).toHaveLength(1)
})
