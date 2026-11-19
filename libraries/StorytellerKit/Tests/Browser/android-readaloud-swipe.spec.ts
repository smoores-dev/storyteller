import { _android, expect, test } from "@playwright/test"

test("a forward swipe when the readaloud highlight arrives keeps the next page", async ({}, info) => {
  const serial = process.env.STORYTELLER_SWIPE_DEVICE
  test.skip(!serial || info.project.name !== "chromium")
  const pkg =
    process.env.STORYTELLER_ANDROID_PACKAGE ?? "dev.smoores.Storyteller.dev3"
  const devices = await _android.devices({ omitDriverInstall: true })
  try {
    const device = devices.find((device) => device.serial() === serial)
    if (!device) throw Error("Connect the requested Android device")
    const reader = await (
      await device.webView({ pkg }, { timeout: 5000 })
    ).page()
    const chapter = reader
      .frames()
      .find((f) => f.parentFrame() === reader.mainFrame())
    if (!chapter || (await chapter.title()) !== "Swipe Check")
      throw Error("Open Swipe Check in readaloud mode first")

    const trace = await chapter.evaluateHandle(() => {
      const frame = window.frameElement!
      const root = frame.getRootNode()
      const position = () =>
        1 - frame.getBoundingClientRect().left / parent.innerWidth
      const highlight = () =>
        document.querySelector(".epub-media-overlay-active")
      const cue = () => {
        const el = highlight()
        if (!el) return null
        const x = frame.getBoundingClientRect().left
        return [...el.getClientRects()].some(
          (r) =>
            r.width > 0 && x + r.right > 0 && x + r.left < parent.innerWidth,
        )
          ? el.id
          : null
      }
      const events: {
        event: string
        time: number
        position: number
        sentence?: string
      }[] = []
      const controller = new AbortController()
      const record = (e: Event) =>
        events.push({
          event: e.type,
          time: performance.now(),
          position: position(),
          sentence: highlight()?.id,
        })
      const options = {
        capture: true,
        passive: true,
        signal: controller.signal,
      }
      root.addEventListener("scroll", record, options)
      root.addEventListener("scrollend", record, options)
      document.addEventListener("touchstart", record, options)
      document.addEventListener("touchend", record, options)
      return { position, cue, events, controller }
    })

    const width = await reader.evaluate(() =>
      Math.round(innerWidth * devicePixelRatio),
    )
    const x1 = Math.round(width * 0.8),
      x2 = Math.round(width * 0.2)
    const y = Math.round(width * 0.95)
    // Use the native player's control and the same point to pause after the run.
    const tree = (await device.shell("uiautomator dump /dev/tty")).toString()
    const play = tree.match(
      /<node [^>]*content-desc="Play"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    )
    if (!play) throw Error("Pause playback and show the reader's Play button")
    const [, left, top, right, bottom] = play.map(Number)
    const toggle = () =>
      device.shell(
        `input tap ${Math.round((left + right) / 2)} ${Math.round((top + bottom) / 2)}`,
      )
    let playing = false
    try {
      expect(
        await trace.evaluate((t) => t.position()),
        "Start at the chapter heading",
      ).toBeCloseTo(1, 1)
      await toggle()
      playing = true
      await chapter.waitForFunction((t) => t.cue() === "sentence-1", trace)
      expect(
        await chapter
          .locator("#sentence-1")
          .evaluate((e) => Number(getComputedStyle(e).fontWeight)),
      ).toBeGreaterThanOrEqual(600)

      let sentence = "sentence-1"
      for (let from = 1; from <= 6; from++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        const start = await trace.evaluate((t) => t.events.length)
        await device.shell(`input swipe ${x1} ${y} ${x2} ${y} 250`)
        // The next finger-down follows the visible highlight. Waiting for the
        // reader to quiesce here skips the reported interaction.
        const next = await chapter
          .waitForFunction(
            ({ t, from, sentence }) => {
              const cue = t.cue()
              return Math.abs(t.position() - (from + 1)) < 0.02 &&
                cue &&
                cue !== sentence
                ? cue
                : false
            },
            { t: trace, from, sentence },
            { timeout: 2000, polling: "raf" },
          )
          .catch((e: Error) => {
            if (e.name !== "TimeoutError") throw e
            return null
          })
        const after = await trace.evaluate(
          (t, start) => ({
            final: t.position(),
            furthest: Math.max(...t.events.slice(start).map((e) => e.position)),
          }),
          start,
        )
        expect(
          after.final,
          `Swipe from page ${from} reached ${after.furthest.toFixed(2)} and ended at ${after.final.toFixed(2)}`,
        ).toBeCloseTo(from + 1, 1)
        expect(
          next,
          "The destination should acquire a new visible highlight",
        ).toBeTruthy()
        sentence = String(await next!.jsonValue())
        await next!.dispose()
      }
      // Observe the final turn through the same reversal interval as earlier turns.
      await new Promise((resolve) => setTimeout(resolve, 1800))
      expect(await trace.evaluate((t) => t.position())).toBeCloseTo(7, 1)
    } finally {
      const events = await trace.evaluate((t) => {
        t.controller.abort()
        return t.events
      })
      await info.attach("physical page positions", {
        body: JSON.stringify(events),
        contentType: "application/json",
      })
      if (playing) await toggle()
      await trace.dispose()
    }
  } finally {
    await Promise.all(devices.map((d) => d.close()))
  }
})
