import { _android, expect, test, type TestInfo } from "@playwright/test"

// Run against the real app with handle-check.epub open in portrait, paginated,
// single-column mode. Only run on the explicitly selected device.
test.describe.configure({ mode: "default" })
test("adjusting a native selection handle keeps the current page", async ({}, info) => {
  await checkSelectionHandle(info, false)
})
test("adjusting a native selection handle after a short swipe keeps the current page", async ({}, info) => {
  await checkSelectionHandle(info, true)
})

async function checkSelectionHandle(info: TestInfo, shortSwipe: boolean) {
  const serial = process.env.STORYTELLER_ANDROID_SERIAL
  test.skip(!serial || info.project.name !== "chromium")
  const devices = await _android.devices({ omitDriverInstall: true })
  try {
    const device = devices.find((d) => d.serial() === serial)
    if (!device) throw new Error("Android device not connected: " + serial)
    const webView = await device.webView(
      { pkg: "dev.smoores.Storyteller.dev3" },
      { timeout: 5000 },
    )
    const reader = await webView.page()
    const chapter = reader
      .frames()
      .find((frame) => frame.parentFrame() === reader.mainFrame())
    if (!chapter || (await chapter.title()) !== "Handle Check")
      throw new Error(
        "Open the Handle Check fixture in the Storyteller debug app first.",
      )

    // The WebView's origin includes the Android system bars, unlike DOM coordinates.
    const idleScreen = () => device.shell("uiautomator dump /dev/tty")
    const tree = (await idleScreen()).toString()
    const bounds = tree.match(
      /<node [^>]*class="android\.webkit\.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    )
    if (!bounds) throw new Error("Could not locate the reader on screen")
    const [, left, top, right, bottom] = bounds.map(Number)
    const density = await reader.evaluate(() => devicePixelRatio)
    const touch = (x: number, y: number, endX: number, duration: number) =>
      device.shell(
        "input swipe " +
          [
            left + x * density,
            top + y * density,
            left + endX * density,
            top + y * density,
            duration,
          ]
            .map(Math.round)
            .join(" "),
      )

    // Measure the actual chapter frame's displacement in screen widths.
    const position = () =>
      chapter.evaluate(
        () =>
          1 -
          window.frameElement!.getBoundingClientRect().left / parent.innerWidth,
      )
    const selection = () => chapter.evaluate(() => getSelection()!.toString())
    const width = (right - left) / density,
      middleY = (bottom - top) / density / 2
    expect(await selection(), "Open the fixture with no active selection").toBe(
      "",
    )
    let page = Math.round(await position())
    while (page !== 4) {
      const forward = page < 4
      await touch(
        width * (forward ? 0.8 : 0.2),
        middleY,
        width * (forward ? 0.2 : 0.8),
        400,
      )
      page += forward ? 1 : -1
      await expect.poll(position).toBeCloseTo(page, 1)
    }

    // Pick an actual word away from both page-turn zones. Project the glyphs
    // into the outer viewport because the chapter spans several CSS columns.
    await idleScreen()
    const word = await chapter.evaluate(() => {
      const node = document.querySelector("section:last-child p")!
        .firstChild as Text
      const frame = window.frameElement!.getBoundingClientRect()
      const range = document.createRange()
      for (const match of node.data.matchAll(/reader/g)) {
        range.setStart(node, match.index)
        range.setEnd(node, match.index + match[0].length)
        const rect = range.getBoundingClientRect()
        const x = rect.x + frame.x,
          y = rect.y + frame.y
        if (
          x > parent.innerWidth * 0.2 &&
          x + rect.width < parent.innerWidth * 0.8 &&
          y > parent.innerHeight * 0.25 &&
          y < parent.innerHeight * 0.7
        ) {
          // End the drag at the q. A fixed drag distance can also pick up
          // the preceding space, depending on the justified line's spacing.
          range.setStart(node, match.index - "quiet ".length)
          range.collapse(true)
          return {
            x,
            y,
            width: rect.width,
            height: rect.height,
            quietX: frame.x + range.getBoundingClientRect().x,
          }
        }
      }
      throw new Error(
        "No central 'reader' on the fourth page. Use the default text layout.",
      )
    })
    const center = word.x + word.width / 2
    await touch(center, word.y + word.height / 2, center, 750)
    await expect.poll(selection).toBe("reader")
    await expect.poll(position).toBeCloseTo(4, 1)
    if (shortSwipe) {
      // A short page drag settles back on page 4 and leaves the word selected.
      // Require a real scrollend so a tap cannot satisfy this precondition.
      const scroll = await chapter.evaluateHandle(() => ({
        ended: new Promise<void>((resolve) => {
          const root = window.frameElement!.getRootNode()
          root.addEventListener("scrollend", () => resolve(), {
            once: true,
            capture: true,
          })
        }),
      }))
      await touch(width * 0.5, middleY, width * 0.545, 650)
      await scroll.evaluate(({ ended }) => ended)
      await scroll.dispose()
      await expect.poll(position).toBeCloseTo(4, 1)
      expect(await selection()).toBe("reader")
    }
    // Android draws the handles after the DOM selection exists. Wait for the
    // native UI to become idle before touching the leading handle.
    await idleScreen()
    await info.attach("before handle drag", {
      body: await device.screenshot(),
      contentType: "image/png",
    })

    // Grab the teardrop below the leading edge and extend one word to the left.
    await touch(word.x - 10, word.y + word.height + 10, word.quietX - 10, 850)
    await expect.poll(selection).not.toBe("reader")
    await info.attach("after handle drag", {
      body: await device.screenshot(),
      contentType: "image/png",
    })
    const selected = await selection()
    expect({
      page: Math.round(await position()),
      selectedCharacters: selected.length,
    }).toEqual({
      page: 4,
      selectedCharacters: "quiet reader".length,
    })
    expect(selected).toBe("quiet reader")

    // An intentional swipe must still work while those words are selected.
    await touch(width * 0.8, middleY, width * 0.2, 400)
    await expect.poll(position).toBeCloseTo(5, 1)
  } finally {
    await Promise.all(devices.map((d) => d.close()))
  }
}
